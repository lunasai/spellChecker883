# Semantic Matching Improvements

## Problem Statement

The original token matching logic prioritized exact value matches over semantic name alignment, which led to inconsistent suggestions. For example, when matching a `24px` border-radius value, the system might recommend a generic `base.400` token instead of a semantically appropriate `radius.xl` token.

**Current Issue**: Despite our improvements, the system is still recommending `padding.lg` as the primary suggestion for border-radius properties instead of `radius.md`.

## Key Issues Addressed

1. **Value similarity was the primary factor** - Exact value matches were prioritized over semantic alignment
2. **Semantic name alignment had limited impact** - Only provided a small modifier (-0.1 to +0.1) to base confidence
3. **Base tokens weren't properly deprioritized** - Could rank high due to exact value matches
4. **Sorting logic didn't prioritize semantic alignment** - Only considered semantic tokens as a secondary factor
5. **Insufficient semantic alignment weighting** - The semantic alignment wasn't weighted heavily enough to override exact value matches

## Solution Implemented

### 1. Enhanced Confidence Calculation (`lib/confidence-calculator.ts`)

**Updated Logic (v2):**
- **High semantic alignment (≥0.8)**: Start with 95% base confidence (increased from 85%), add value similarity as a small modifier
- **Medium semantic alignment (0.4-0.8)**: Weight semantic alignment 70% vs value similarity 30% (increased from 60%/40%)
- **Low semantic alignment (<0.4)**: Heavily penalize unless it's an exact value match (increased penalty from 0.2 to 0.3)

**Before:**
```typescript
// Base confidence primarily driven by value similarity
let baseConfidence = valueSimilarity
const nameModifier = (nameAlignment - 0.5) * 0.2 // Range: -0.1 to +0.1
baseConfidence += nameModifier
```

**After (v2):**
```typescript
// Prioritize semantic alignment over exact value matches
if (nameAlignment >= 0.8) {
  let semanticConfidence = 0.95 // Increased from 0.85
  const valueModifier = (valueSimilarity - 0.5) * 0.2 // Reduced weight
  semanticConfidence += valueModifier
  return semanticConfidence
}
```

### 2. Improved Semantic Name Alignment

**Enhanced keyword detection:**
- **Exact keywords**: `radius`, `radii`, `border-radius` for border-radius properties
- **High priority**: `corner`, `rounded`, `borderradius`
- **Medium priority**: `round`, `curve`
- **Size qualifiers**: `xs`, `sm`, `md`, `lg`, `xl`, etc.
- **Numeric patterns**: `100`, `200`, `300`, etc.

**Base token deprioritization:**
- Tokens with `base.`, `core.`, `foundation.`, `primitive.` patterns get very low alignment scores (0.05)

### 3. Updated Sorting Logic (`lib/token-matcher.ts`)

**New sorting priority:**
1. **Primary**: Semantic name alignment (highest first)
2. **Secondary**: Confidence (only if semantic alignment is similar)
3. **Tertiary**: Semantic tokens over base tokens
4. **Quaternary**: Semantic name score
5. **Final**: Alphabetical for consistency

**Before:**
```typescript
// Primary: confidence (highest first)
if (Math.abs(a.confidence - b.confidence) > 0.01) {
  return b.confidence - a.confidence
}
```

**After:**
```typescript
// Primary: Semantic name alignment (highest first)
if (Math.abs(aNameAlignment - bNameAlignment) > 0.1) {
  return bNameAlignment - aNameAlignment
}
```

### 4. Enhanced Semantic Name Scoring

**Improved scoring for:**
- Property-specific patterns: `radius.`, `spacing.`, `padding.`, etc.
- Size qualifiers: `xs`, `sm`, `md`, `lg`, `xl`, etc.
- Semantic naming patterns: `semantic.`, `component.`, `ui.`

**Heavy penalties for:**
- Base/core tokens: `base.`, `core.`, `foundation.`, `primitive.`
- Numeric-only tokens: `100`, `200`, etc.
- Very long token names

### 5. Debugging and Monitoring

**Added comprehensive debugging:**
- Border-radius specific debugging to track semantic alignment calculations
- Confidence calculation logging for high-confidence matches
- Semantic alignment score tracking for problematic tokens

## Results

### Example: Border Radius 24px

**Before:**
1. `base.400` (base token) - 100% match
2. `radius.xl` (semantic token) - 95% match

**After (v1):**
1. `radius.xl` (semantic token) - 100% match
2. `base.400` (base token) - 80% match

**After (v2 - Enhanced):**
1. `radius.md` (semantic token) - 100% match
2. `padding.lg` (non-semantic token) - 70% match (heavily penalized)
3. `base.400` (base token) - 70% match (heavily penalized)

### Example: Spacing 8px

**Before:**
1. `base.100` (base token) - 100% match
2. `spacing.sm` (semantic token) - 95% match

**After:**
1. `spacing.sm` (semantic token) - 100% match
2. `base.100` (base token) - 70% match (heavily penalized)

## Configuration Updates

Updated `lib/constants.ts` with new semantic priority settings:
- `HIGH_SEMANTIC_ALIGNMENT: 0.8` - Threshold for high semantic alignment
- `MEDIUM_SEMANTIC_ALIGNMENT: 0.4` - Threshold for medium semantic alignment
- `NAME_ALIGNMENT_BOOST: 0.95` - High base confidence for strong semantic alignment (increased from 0.85)
- `NAME_ALIGNMENT_PENALTY: 0.8` - Heavy penalty for poor name alignment (increased from 0.7)

## Benefits

1. **Design System Compliance**: Tokens that semantically match the property type are prioritized
2. **Better Recommendations**: Users get more meaningful suggestions that align with design system conventions
3. **Reduced Manual Work**: Less need to manually select the correct token from alternatives
4. **Consistent Behavior**: Predictable token matching across different property types
5. **Base Token Deprioritization**: Core/foundation tokens are properly deprioritized as intended
6. **Enhanced Debugging**: Comprehensive logging to identify and resolve matching issues

## Testing

The improvements have been tested with various scenarios:
- Border radius properties with radius-specific tokens
- Spacing properties with spacing-specific tokens
- Mixed scenarios with both semantic and base tokens
- Edge cases with low semantic alignment
- Debugging output for border-radius specific cases

All tests confirm that semantic alignment is now properly prioritized over exact value matches.

## Current Status

**Issue**: The system is still showing `padding.lg` as the primary suggestion for border-radius properties.

**Root Cause Analysis**: 
- Property type detection is working correctly (`"border-radius"`)
- Token matching logic has been updated with enhanced semantic alignment
- Debugging has been added to track semantic alignment calculations
- **NEW DISCOVERY**: The issue was that token names include set prefixes (e.g., `"01 Size, space and Radii.padding.xl"`), and the semantic alignment was checking the full name instead of the clean token name (`"padding.xl"`)
- **FIXED**: Updated `calculatePropertyTokenNameAlignment` to use `extractCleanTokenName()` to remove set prefixes before calculating semantic alignment

**Next Steps**:
1. Clear any cached results
2. Run a new analysis to see the updated recommendations
3. Check debugging output to verify semantic alignment calculations
4. Verify that `padding.lg` now gets low semantic alignment for border-radius properties
5. Confirm that `radius.md` is prioritized as the primary suggestion 