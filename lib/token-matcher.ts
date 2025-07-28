import { APP_CONFIG } from "./constants"
import { calculateMatchConfidence, calculatePropertyTokenNameAlignment } from "./confidence-calculator"
import { extractCleanTokenName } from "./token-utils"
import type { ResolvedToken, TokenMatch, UnmatchedValue } from "./types"

interface HardcodedValueForMatching {
  type: string
  value: string
  count: number
  locations: string[]
  nodeIds?: string[]
}

interface MatchResult {
  tokenMatches: TokenMatch[]
  unmatchedValues: UnmatchedValue[]
}

interface EnhancedTokenMatch {
  figmaValue: string
  nodeIds?: string[]
  count?: number
  matches: Array<{
    tokenName: string
    tokenValue: string
    confidence: number
    isSemanticToken: boolean
    referenceChain?: string[]
    originalReference?: string
    tokenType?: string
    matchType: "exact" | "semantic" | "similar" | "base"
  }>
}

export function matchValuesWithTokens(hardcodedValues: HardcodedValueForMatching[], tokens: Record<string, ResolvedToken>): MatchResult {
  console.log("Starting token matching...")
  console.log(`Hardcoded values to match: ${hardcodedValues.length}`)
  console.log(`Available resolved tokens: ${Object.keys(tokens).length}`)

  // Debug: Show some resolved token examples
  const semanticTokens = Object.entries(tokens).filter(([_, token]) => token.isReference)
  const baseTokens = Object.entries(tokens).filter(([_, token]) => !token.isReference)

  console.log(`Semantic tokens: ${semanticTokens.length}`)
  console.log(`Base tokens: ${baseTokens.length}`)

  // Show examples of resolved tokens
  console.log("Example semantic tokens:")
  semanticTokens.slice(0, 3).forEach(([name, token]) => {
    console.log(`  ${name}: ${token.originalReference} → ${token.value}`)
  })

  console.log("Example base tokens:")
  baseTokens.slice(0, 3).forEach(([name, token]) => {
    console.log(`  ${name}: ${token.value}`)
  })

  const enhancedMatches: EnhancedTokenMatch[] = []
  const unmatchedValues: UnmatchedValue[] = []

  hardcodedValues.forEach((hardcodedValue) => {
    const allMatches = findAllPotentialMatches(hardcodedValue, tokens)

    if (allMatches.length > 0) {
      console.log(`Found ${allMatches.length} matches for ${hardcodedValue.value}:`)
      allMatches.slice(0, 3).forEach((match) => {
        console.log(`  ${match.tokenName} (${match.matchType}): ${match.confidence.toFixed(2)}`)
      })

      enhancedMatches.push({
        figmaValue: hardcodedValue.value,
        nodeIds: hardcodedValue.nodeIds,
        count: hardcodedValue.count,
        matches: allMatches.map(match => ({
          tokenName: match.tokenName,
          tokenValue: match.tokenData.value,
          confidence: match.confidence,
          isSemanticToken: match.tokenData.isReference,
          referenceChain: match.tokenData.referenceChain,
          originalReference: match.tokenData.originalReference,
          tokenType: match.tokenData.tokenType,
          matchType: match.matchType,
        })),
      })
    } else {
      console.log(`No matches found for ${hardcodedValue.value} (${hardcodedValue.type})`)
      unmatchedValues.push({
        value: hardcodedValue.value,
        type: hardcodedValue.type,
        count: hardcodedValue.count,
      })
    }
  })

  // Convert enhanced matches to the expected format
  const tokenMatches = convertToTokenMatches(enhancedMatches)

  // Calculate total occurrences for matched and unmatched values
  const totalMatchedOccurrences = enhancedMatches.reduce((sum, match) => sum + (match.count || 1), 0)
  const totalUnmatchedOccurrences = unmatchedValues.reduce((sum, value) => sum + value.count, 0)

  console.log(`Final results: ${totalMatchedOccurrences} matches, ${totalUnmatchedOccurrences} unmatched`)

  return { tokenMatches, unmatchedValues }
}

interface PotentialMatch {
  tokenName: string
  tokenData: ResolvedToken
  confidence: number
  matchType: "exact" | "semantic" | "similar" | "base"
}

function findAllPotentialMatches(hardcodedValue: HardcodedValueForMatching, tokens: Record<string, ResolvedToken>): PotentialMatch[] {
  const allMatches: PotentialMatch[] = []

  for (const [tokenName, tokenData] of Object.entries(tokens)) {
    // Skip tokens that don't have a resolved value
    if (!tokenData.value) {
      continue
    }

    const confidence = calculateMatchConfidence(
      hardcodedValue.value,
      tokenData.value,
      hardcodedValue.type,
      tokenData.isReference,
      tokenName,
    );

    if (confidence === 0) continue;

    const match: PotentialMatch = {
      tokenName,
      tokenData,
      confidence,
      matchType: determineMatchType(confidence, tokenData.isReference),
    };

    allMatches.push(match);
  }

  // Sort matches by semantic alignment, then exact value matches, then confidence, then semantic preference
  allMatches.sort((a, b) => {
    // Calculate semantic name alignment scores
    const aNameAlignment = calculatePropertyTokenNameAlignment(a.tokenName, hardcodedValue.type)
    const bNameAlignment = calculatePropertyTokenNameAlignment(b.tokenName, hardcodedValue.type)
    
    // Primary: Semantic name alignment (highest first)
    if (Math.abs(aNameAlignment - bNameAlignment) > 0.1) {
      return bNameAlignment - aNameAlignment
    }
    
    // Secondary: Exact value matches over similar value matches (when semantic alignment is similar)
    const aIsExactValueMatch = a.tokenData.value === hardcodedValue.value
    const bIsExactValueMatch = b.tokenData.value === hardcodedValue.value
    
    if (aIsExactValueMatch && !bIsExactValueMatch) {
      return -1 // a wins (exact match)
    }
    if (!aIsExactValueMatch && bIsExactValueMatch) {
      return 1 // b wins (exact match)
    }
    
    // Tertiary: confidence (highest first) - but only if semantic alignment and exact match status are similar
    if (Math.abs(a.confidence - b.confidence) > 0.05) {
      return b.confidence - a.confidence
    }
    
    // Quaternary: prefer semantic tokens over base tokens
    if (a.tokenData.isReference && !b.tokenData.isReference) return -1
    if (!a.tokenData.isReference && b.tokenData.isReference) return 1
    
    // Quinary: prefer shorter, more semantic token names
    const aSemanticScore = calculateSemanticNameScore(a.tokenName)
    const bSemanticScore = calculateSemanticNameScore(b.tokenName)
    if (aSemanticScore !== bSemanticScore) {
      return bSemanticScore - aSemanticScore
    }
    
    // Final: alphabetical for consistency
    return a.tokenName.localeCompare(b.tokenName)
  })

  // Return top matches with reasonable limits
  return allMatches.slice(0, 8);
}

function determineMatchType(confidence: number, isSemanticToken: boolean): "exact" | "semantic" | "similar" | "base" {
  // Updated thresholds based on the new four-category scoring system
  
  // Exact matches: Category 1 (0.95-1.0)
  if (confidence >= 0.95) {
    return "exact";
  }
  
  // Semantic matches: Category 2 (0.8-0.94) for semantic tokens with naming match + similar value
  if (confidence >= 0.8 && isSemanticToken) {
    return "semantic";
  }
  
  // Similar matches: Category 3 (0.7-0.89) for exact value matches without naming match, or Category 4 (0.4-0.69) for similar value matches
  if (confidence >= 0.7) {
    return "similar";
  }
  
  // Base matches: Everything else (0.0-0.69)
  return "base";
}

function convertToTokenMatches(enhancedMatches: EnhancedTokenMatch[]): TokenMatch[] {
  const tokenMatches: TokenMatch[] = []

  enhancedMatches.forEach((enhancedMatch) => {
    enhancedMatch.matches.forEach((match, index) => {
      // Generate suggestions from other matches
      const otherMatches = enhancedMatch.matches
        .filter((_, i) => i !== index)
        .slice(0, APP_CONFIG.MATCH_LIMITS.MAX_SUGGESTIONS)
        .map((m) => {
          const prefix = getMatchTypePrefix(m.matchType, m.isSemanticToken)
          return `${prefix}${m.tokenName} (${m.tokenValue}) - ${Math.round(m.confidence * 100)}%`
        })

      tokenMatches.push({
        figmaValue: enhancedMatch.figmaValue,
        tokenName: extractCleanTokenName(match.tokenName),
        tokenValue: match.tokenValue,
        confidence: match.confidence,
        suggestions: otherMatches,
        isSemanticToken: match.isSemanticToken,
        referenceChain: match.referenceChain,
        originalReference: match.originalReference,
        tokenType: match.tokenType,
        nodeIds: enhancedMatch.nodeIds,
        fullTokenPath: match.tokenName, // Keep full path for tooltip
      })
    })
  })

  return tokenMatches
}

function getMatchTypePrefix(matchType: string, isSemanticToken: boolean): string {
  switch (matchType) {
    case "exact":
      return isSemanticToken ? "[Exact Semantic] " : "[Exact Base] "
    case "semantic":
      return "[Semantic] "
    case "similar":
      return "[Similar] "
    case "base":
      return "[Base] "
    default:
      return ""
  }
}

// Enhanced function for frame analysis recommendations
export function getRecommendationsForValue(
  value: string,
  type: string,
  tokens: Record<string, ResolvedToken>,
): Array<{
  tokenName: string
  tokenValue: string
  confidence: number
  isSemanticToken: boolean
  referenceChain?: string[]
  originalReference?: string
  tokenType?: string
  matchType: string
  fullTokenPath?: string
}> {
  const figmaValue = { type, value, count: 1, locations: [] }
  const matches = findAllPotentialMatches(figmaValue, tokens)

  return matches.map((match) => ({
    tokenName: extractCleanTokenName(match.tokenName),
    tokenValue: match.tokenData.value,
    confidence: match.confidence,
    isSemanticToken: match.tokenData.isReference,
    referenceChain: match.tokenData.referenceChain,
    originalReference: match.tokenData.originalReference,
    tokenType: match.tokenData.tokenType,
    matchType: match.matchType,
    fullTokenPath: match.tokenName, // Keep full path for tooltip
  }))
}

// Helper function to calculate semantic name score
function calculateSemanticNameScore(tokenName: string): number {
  const normalizedName = tokenName.toLowerCase()
  let score = 0
  
  // Boost for semantic patterns by property type
  if (normalizedName.includes('space.') || normalizedName.includes('spacing.')) score += 4
  if (normalizedName.includes('radius.') || normalizedName.includes('radii.')) score += 4
  if (normalizedName.includes('padding.') || normalizedName.includes('pad.')) score += 4
  if (normalizedName.includes('margin.')) score += 4
  if (normalizedName.includes('font.') || normalizedName.includes('typography.')) score += 4
  if (normalizedName.includes('color.') || normalizedName.includes('colour.')) score += 4
  if (normalizedName.includes('border.')) score += 4
  if (normalizedName.includes('stroke.')) score += 4
  
  // Boost for semantic size qualifiers
  if (normalizedName.match(/\.(xs|sm|md|lg|xl|xxs|xxl|2xl|3xl|4xl|5xl)$/)) score += 3
  
  // Boost for semantic numeric patterns
  if (normalizedName.match(/\.(100|200|300|400|500|600|700|800|900)$/)) score += 2
  
  // Boost for semantic naming patterns
  if (normalizedName.includes('semantic.')) score += 3
  if (normalizedName.includes('component.')) score += 2
  if (normalizedName.includes('ui.')) score += 2
  
  // Penalize base/core/foundation tokens (should be deprioritized)
  if (normalizedName.includes('base.') || normalizedName.includes('core.') || 
      normalizedName.includes('foundation.') || normalizedName.includes('primitive.')) {
    score -= 5
  }
  
  // Penalize numeric-only tokens
  if (normalizedName.match(/^\d+$/) || normalizedName.match(/\.\d+$/)) score -= 3
  
  // Penalize very long token names (less semantic)
  if (tokenName.length > 30) score -= 2
  
  // Prefer shorter, more readable names
  score += Math.max(0, 15 - tokenName.length) * 0.2
  
  return score
}
