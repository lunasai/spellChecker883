# Enhanced Detached Component Detection

## Overview

This feature enhances the detection of detached components in Figma files using both API-based detection and heuristic analysis. Detached components are components that have lost their connection to their master component, often appearing as `FRAME` or `GROUP` nodes instead of `INSTANCE` nodes.

## How It Works

### 1. API-Based Detection

The system first uses the Figma API to detect detached components by:

- **INSTANCE nodes without componentId**: These are clearly detached as they lack the essential `componentId` property
- **INSTANCE nodes with invalid componentId**: Components that reference non-existent master components
- **Component validation**: Cross-referencing componentIds with actual component definitions in the file

### 2. Heuristic Detection

For `FRAME` and `GROUP` nodes that might be detached components, the system uses a scoring algorithm that considers:

- **Component naming patterns**: Names that match known component conventions
- **Component properties**: Presence of `componentProperties` object
- **Bound variables**: Connection to design tokens/variables
- **Component styles**: Application of component-level styles
- **Fill/Stroke variables**: Bound variables in fills and strokes
- **Complex structure**: Multiple children with consistent styling
- **Naming conventions**: PascalCase, camelCase, or component-like patterns

### 3. Confidence Scoring

Each detected component is assigned a confidence level:

- **High (0.9+)**: Clear indicators of detachment (API-based or very strong heuristics)
- **Medium (0.8-0.89)**: Strong heuristic indicators
- **Low (0.7-0.79)**: Moderate heuristic indicators

## Usage

### Basic Usage

```typescript
import { detectDetachedComponents } from './lib/figma-analyzer'

const detachedComponents = detectDetachedComponents(
  figmaDocument, 
  figmaUrl,
  knownComponentNames // Optional set of known component names
)
```

### Integration with Analysis

The enhanced detection is automatically integrated into the main analysis pipeline:

```typescript
const analysisResult = analyzeFigmaFileByFrames(document, figmaUrl)
// analysisResult.detachedComponents contains the detected components
```

### UI Display

The detected components are displayed in the Component Usage View with:

- **Confidence-based filtering**: Filter by high, medium, or low confidence
- **Search functionality**: Search by component name or detection reason
- **Detailed information**: Shows detection method, confidence, and component properties
- **Visual indicators**: Color-coded by confidence level

## Detection Criteria

### High Confidence Detections

1. **INSTANCE nodes without componentId**
2. **INSTANCE nodes with invalid componentId references**
3. **FRAME/GROUP nodes with heuristic score ≥ 0.9**

### Medium Confidence Detections

1. **FRAME/GROUP nodes with heuristic score 0.8-0.89**

### Low Confidence Detections

1. **FRAME/GROUP nodes with heuristic score 0.7-0.79**

## Heuristic Scoring Breakdown

| Factor | Score | Description |
|--------|-------|-------------|
| Known component name | +0.4 | Matches a known component name |
| Component keywords | +0.2 | Contains component-like keywords |
| Component properties | +0.3 | Has componentProperties object |
| Bound variables | +0.25 | Has bound variables |
| Component styles | +0.15 | Has component styles |
| Fill variables | +0.2 | Has fills with bound variables |
| Stroke variables | +0.2 | Has strokes with bound variables |
| Complex structure | +0.1 | Multiple children with consistent styling |
| Naming conventions | +0.1 | Follows component naming patterns |

## Benefits

1. **More Accurate Detection**: Catches detached components that appear as FRAME/GROUP nodes
2. **Reduced False Negatives**: Heuristic detection catches components missed by API-only detection
3. **Confidence Levels**: Helps users prioritize which components to investigate
4. **Detailed Information**: Provides context about why a component was flagged
5. **Search and Filter**: Easy to find and analyze specific detached components

## Example Output

```typescript
{
  nodeId: "detached-button-123",
  nodeName: "Button",
  nodeType: "FRAME",
  confidence: "high",
  detectionMethod: "heuristic",
  reason: "FRAME/GROUP with component-like properties (score: 0.95)",
  hasComponentProperties: true,
  hasBoundVariables: true,
  hasComponentStyles: false
}
```

## Testing

Run the test file to see the detection in action:

```bash
# The test will run automatically when the file is imported
import { testDetachedComponentDetection } from './lib/detached-component-test'
```

## Future Enhancements

1. **Machine Learning**: Train models on large datasets of detached components
2. **Pattern Recognition**: Learn from user feedback to improve detection accuracy
3. **Component Library Integration**: Cross-reference with known component libraries
4. **Historical Analysis**: Track component changes over time to detect detachment patterns 