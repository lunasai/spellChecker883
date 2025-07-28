import { rgbToHex } from "./color-utils"
import { getRecommendationsForValue } from "./token-matcher"
import { generateFigmaFrameUrl } from "./figma-utils"
import type { FigmaNode, HardcodedValue, FrameAnalysis, FrameInfo, ResolvedToken } from "./types"
import axios from "axios"

// --- Figma Style Fetching and Mapping ---

export async function fetchFigmaStyles(figmaFileKey: string, personalAccessToken: string) {
  const stylesUrl = `https://api.figma.com/v1/files/${figmaFileKey}/styles`;
  const fileUrl = `https://api.figma.com/v1/files/${figmaFileKey}`;
  const headers = { 'X-Figma-Token': personalAccessToken };

  // Fetch styles metadata
  const stylesRes = await axios.get(stylesUrl, { headers });
  const styles = stylesRes.data.meta.styles;
  
  // Get all style types: TEXT, EFFECT, FILL, GRID
  const textStyleIds = styles.filter((s: any) => s.style_type === 'TEXT').map((s: any) => s.node_id);
  const effectStyleIds = styles.filter((s: any) => s.style_type === 'EFFECT').map((s: any) => s.node_id);
  const fillStyleIds = styles.filter((s: any) => s.style_type === 'FILL').map((s: any) => s.node_id);
  const gridStyleIds = styles.filter((s: any) => s.style_type === 'GRID').map((s: any) => s.node_id);
  
  // Combine all style IDs
  const allStyleIds = [...textStyleIds, ...effectStyleIds, ...fillStyleIds, ...gridStyleIds];

  console.log(`Fetched Figma styles: ${textStyleIds.length} TEXT, ${effectStyleIds.length} EFFECT, ${fillStyleIds.length} FILL, ${gridStyleIds.length} GRID`);

  // Fetch file nodes to get style definitions
  const fileRes = await axios.get(fileUrl, { headers });
  const nodes = fileRes.data.document;

  // Recursively collect all nodes by id
  const nodeMap: Record<string, any> = {};
  function collectNodes(node: any) {
    nodeMap[node.id] = node;
    if (node.children) node.children.forEach(collectNodes);
  }
  collectNodes(nodes);

  // Map styleId to style node (with variable bindings if present)
  const styleIdToStyle: Record<string, any> = {};
  allStyleIds.forEach((id: string) => {
    if (nodeMap[id]) {
      styleIdToStyle[id] = nodeMap[id];
      console.log(`Mapped style ${id}: ${nodeMap[id].name} (${nodeMap[id].type})`);
      
      // Log more details about EFFECT styles specifically
      if (nodeMap[id].type === 'RECTANGLE' && nodeMap[id].cornerRadius !== undefined) {
        console.log(`  - EFFECT style has cornerRadius: ${nodeMap[id].cornerRadius}px`);
      }
    }
  });
  
  console.log(`Total styles mapped: ${Object.keys(styleIdToStyle).length}`);
  return styleIdToStyle;
}

// --- Updated Typography Extraction ---

// Helper function to check if a node has any styles applied
function hasNodeStyles(node: FigmaNode, styleIdToStyle?: Record<string, any>): boolean {
  // Check if the current node has styles applied
  // @ts-ignore
  if ((node as any).styles && styleIdToStyle) {
    const stylesObj = (node as any).styles;
    console.log(`Checking styles for node "${node.name}":`, stylesObj);
    for (const key in stylesObj) {
      if (stylesObj[key] && styleIdToStyle[stylesObj[key]]) {
        console.log(`Node "${node.name}" has style "${key}" applied: ${stylesObj[key]}`);
        return true;
      }
    }
  }

  // Check if this is a component instance and has component properties that might include styles
  if (node.type === 'INSTANCE' && node.componentProperties) {
    console.log(`Checking component properties for "${node.name}":`, node.componentProperties);
    // Component instances can have overridden properties that include styles
    for (const [key, value] of Object.entries(node.componentProperties)) {
      if (value && typeof value === 'object' && 'type' in value) {
        // Check if the property value is a style reference
        if (value.type === 'STYLE' && value.value && styleIdToStyle && styleIdToStyle[value.value]) {
          console.log(`Node "${node.name}" has component property "${key}" with style: ${value.value}`);
          return true;
        }
      }
    }
  }

  // Note: We removed the broad boundVariables check here because it was causing issues
  // with detached components that have some bound variables but detached fills
  // Instead, we check bound variables per property in the specific extraction functions

  console.log(`Node "${node.name}" has no styles or component properties with styles`);
  return false;
}

// Enhanced function to check for styles including component hierarchy
function hasNodeOrParentStyles(node: FigmaNode, styleIdToStyle?: Record<string, any>, context?: TraversalContext): boolean {
  // Check if the current node has styles applied
  if (hasNodeStyles(node, styleIdToStyle)) {
    console.log(`Node "${node.name}" has styles applied`);
    return true;
  }

  // Check if this node has any bound variables that might indicate inherited styles
  // This is especially important for typography where styles can be inherited from parent frames
  if (node.boundVariables) {
    const typographyKeys = ["fontSize", "fontFamily", "fontWeight", "lineHeight"];
    for (const key of typographyKeys) {
      if (node.boundVariables[key]) {
        console.log(`Node "${node.name}" has bound typography variable "${key}" - likely inherited from parent style`);
        return true;
      }
    }
  }

  // Check if we're inside a component that might have typography styles
  if (context?.isInsideComponent) {
    console.log(`Node "${node.name}" is inside a component - checking for component-level typography styles`);
    
    // For text nodes inside components, if they have complete typography properties set,
    // they're likely inheriting from a component-level typography style
    if (node.style && node.type === 'TEXT') {
      const hasFontSize = node.style.fontSize !== undefined;
      const hasFontFamily = node.style.fontFamily !== undefined;
      const hasFontWeight = node.style.fontWeight !== undefined;
      
      if (hasFontSize && hasFontFamily && hasFontWeight) {
        console.log(`Node "${node.name}" has complete typography set inside component - likely from component style`);
        return true;
      }
    }
  }

  return false;
}

function extractTypographyFromNode(
  node: FigmaNode,
  currentPath: string,
  currentFrame: FrameInfo | undefined,
  hardcodedValues: HardcodedValue[],
  styleIdToStyle?: Record<string, any>,
  context?: TraversalContext, // Add context parameter
): TypographyAnalysisInfo {
  let hasAnyTokenizedProperties = false
  let hardcodedPropertiesFound = 0

  if (!node.style) {
    return { hasAnyTokenizedProperties, hardcodedPropertiesFound }
  }

  console.log(`Typography extraction for "${node.name}":`);
  console.log(`  - style:`, node.style);
  console.log(`  - boundVariables:`, node.boundVariables);

  // For typography, if there's a style applied, treat it as fully tokenized
  // This is because typography styles in Figma work as cohesive units
  if (hasNodeOrParentStyles(node, styleIdToStyle, context)) {
    console.log(`Typography style detected for "${node.name}" - treating as fully tokenized`);
    return { hasAnyTokenizedProperties: true, hardcodedPropertiesFound: 0 };
  }

  // Check if the current frame has typography styles applied
  // This is important because frames can have typography styles that affect all text nodes within them
  if (currentFrame && context?.parentFrames) {
    const parentFrame = context.parentFrames.find(frame => frame.id === currentFrame?.id);
    if (parentFrame && hasNodeStyles(parentFrame, styleIdToStyle)) {
      console.log(`Parent frame "${parentFrame.name}" has styles applied - treating typography as tokenized`);
      return { hasAnyTokenizedProperties: true, hardcodedPropertiesFound: 0 };
    }
  }

  // Gather style bound variables if present
  let styleBoundVariables: any = {};
  // @ts-ignore
  if ((node as any).styles && (node as any).styles.text && styleIdToStyle && styleIdToStyle[(node as any).styles.text]) {
    styleBoundVariables = styleIdToStyle[(node as any).styles.text].boundVariables || {};
    console.log(`  - styleBoundVariables:`, styleBoundVariables);
  }

  // Check if ANY typography property is bound to a variable (node or style)
  // If any typography property is bound, treat the entire typography as tokenized
  // This handles cases where typography styles are applied to parent frames
  const typographyKeys = ["fontSize", "fontFamily", "fontWeight", "lineHeight"];
  let hasAnyTypographyBoundVariables = false;
  
  for (const key of typographyKeys) {
    const hasNodeBoundVariable = node.boundVariables && node.boundVariables[key];
    const hasStyleBoundVariable = styleBoundVariables && styleBoundVariables[key];
    
    if (hasNodeBoundVariable || hasStyleBoundVariable) {
      console.log(`Typography property "${key}" has bound variables for "${node.name}" - treating as tokenized`);
      hasAnyTypographyBoundVariables = true;
      break; // If any typography property is bound, treat all as tokenized
    }
  }

  // If any typography property is bound, skip adding value occurrences (hide from results)
  if (hasAnyTypographyBoundVariables) {
    console.log(`Typography has bound variables for "${node.name}" - treating as fully tokenized`);
    return { hasAnyTokenizedProperties: true, hardcodedPropertiesFound: 0 };
  }

  // Check if this node is inside a component that might have typography styles
  // Component instances often inherit typography from their main component
  if (context?.isInsideComponent || node.type === 'INSTANCE') {
    console.log(`Node "${node.name}" is inside a component - checking for inherited typography styles`);
    
    // Check if any typography properties have values that suggest they're from a style
    // This is a heuristic: if all typography properties are set and consistent, they might be from a style
    const hasFontSize = node.style.fontSize !== undefined;
    const hasFontFamily = node.style.fontFamily !== undefined;
    const hasFontWeight = node.style.fontWeight !== undefined;
    const hasLineHeight = node.style.lineHeightPx !== undefined;
    
    // If we have a complete typography set, it's likely from a style
    if (hasFontSize && hasFontFamily && hasFontWeight) {
      console.log(`Node "${node.name}" has complete typography set - likely from inherited style, treating as tokenized`);
      return { hasAnyTokenizedProperties: true, hardcodedPropertiesFound: 0 };
    }
  }

  // Check typography properties for hardcoded values only (when no styles or bound variables)
  const typographyProperties = [
    {
      value: node.style.fontSize,
      suffix: "px",
      name: "fontSize"
    },
    {
      value: node.style.fontFamily,
      suffix: "",
      name: "fontFamily"
    },
    {
      value: node.style.fontWeight,
      suffix: "",
      name: "fontWeight"
    },
    {
      value: node.style.lineHeightPx,
      suffix: "px",
      name: "lineHeight"
    },
  ]

  typographyProperties.forEach(({ value, suffix, name }) => {
    if (value !== undefined) {
      const formattedValue = suffix ? `${value}${suffix}` : String(value)
      console.log(`  - Adding hardcoded typography: ${formattedValue} (${name}) for "${node.name}"`);
      addHardcodedValue(formattedValue, "typography", currentPath, currentFrame, hardcodedValues, node.id, node, context)
      hardcodedPropertiesFound++
    }
  })

  // Check for text fill bound variables (for text color) - this is handled separately in extractColorsFromNode
  if (node.fills) {
    node.fills.forEach((fill) => {
      if (fill.type === "SOLID" && fill.color) {
        const hasBoundVariable = (fill.boundVariables?.color !== undefined) || (node.boundVariables?.color !== undefined)
        if (hasBoundVariable) {
          hasAnyTokenizedProperties = true
        }
      }
    })
  }

  return { hasAnyTokenizedProperties, hardcodedPropertiesFound }
}

export interface FigmaAnalysisResult {
  hardcodedValues: Array<{
    type: "fill" | "stroke" | "spacing" | "padding" | "typography" | "border-radius"
    value: string
    count: number
    locations: string[]
  }>
  frameAnalyses: FrameAnalysis[]
  totalElements: number
  tokenizedProperties: number
}

interface NodeAnalysisStats {
  totalElements: number
  totalProperties: number
  tokenizedProperties: number
  hardcodedProperties: number
}

export function analyzeFigmaFileByFrames(
  document: FigmaNode,
  figmaUrl: string,
  resolvedTokens?: Record<string, ResolvedToken>,
  styleIdToStyle?: Record<string, any>,
): FigmaAnalysisResult {
  const hardcodedValues: HardcodedValue[] = []
  const frameAnalyses: Map<string, FrameAnalysis> = new Map()
  const stats: NodeAnalysisStats = { 
    totalElements: 0, 
    totalProperties: 0,
    tokenizedProperties: 0,
    hardcodedProperties: 0
  }

  const parentFrames = findParentFrames(document)

  traverseDocumentNodes(document, {
    hardcodedValues,
    frameAnalyses,
    parentFrames,
    figmaUrl,
    resolvedTokens,
    stats,
    styleIdToStyle,
    isInsideComponent: false, // Start outside any component
  })

  const hardcodedValuesFormatted = convertToHardcodedValuesFormat(hardcodedValues)

  // Enhance frame analyses with recommendations if tokens are provided
  if (resolvedTokens) {
    enhanceFrameAnalysesWithRecommendations(frameAnalyses, hardcodedValues, resolvedTokens)
  }

  return {
    hardcodedValues: hardcodedValuesFormatted,
    frameAnalyses: Array.from(frameAnalyses.values()),
    totalElements: stats.totalElements,
    tokenizedProperties: stats.tokenizedProperties,
  }
}

function findParentFrames(document: FigmaNode): FigmaNode[] {
  const parentFrames: FigmaNode[] = []

  function searchForFrames(node: FigmaNode, isTopLevel = true): void {
    if (node.type === "FRAME" && !isTopLevel) {
      parentFrames.push(node)
      return
    }

    if (node.children) {
      node.children.forEach((child) => searchForFrames(child, false))
    }
  }

  searchForFrames(document)
  return parentFrames
}

interface TraversalContext {
  hardcodedValues: HardcodedValue[]
  frameAnalyses: Map<string, FrameAnalysis>
  parentFrames: FigmaNode[]
  figmaUrl: string
  resolvedTokens?: Record<string, ResolvedToken>
  stats: NodeAnalysisStats
  // Component tracking
  currentComponentId?: string
  isInsideComponent: boolean
}

function traverseDocumentNodes(node: FigmaNode, context: TraversalContext & { styleIdToStyle?: Record<string, any> }, path = "", currentFrame?: FrameInfo): void {
  // Skip hidden nodes
  if (node.visible === false) {
    return
  }
  context.stats.totalElements++
  const currentPath = path ? `${path} > ${node.name}` : node.name

  // Check if this node is a component instance
  // In Figma API, component instances have type 'INSTANCE' and may have componentId
  const isComponentInstance = node.type === 'INSTANCE' || node.componentId !== undefined
  const newIsInsideComponent = context.isInsideComponent || isComponentInstance
  const newCurrentComponentId = isComponentInstance ? node.id : context.currentComponentId

  if (isComponentInstance) {
    console.log(`Component instance detected: "${node.name}" (type: ${node.type}, componentId: ${node.componentId})`);
  } else if (node.type === 'RECTANGLE' || node.type === 'FRAME' || node.type === 'GROUP') {
    // Check if this might be a detached component (has component-like properties but no componentId)
    console.log(`Regular node: "${node.name}" (type: ${node.type}, componentId: ${node.componentId || 'none'})`);
    
    // Check for any properties that might indicate this was a former component
    if (node.fills && node.fills.length > 0) {
      console.log(`  - Has fills: ${node.fills.length} fill(s)`);
      node.fills.forEach((fill, index) => {
        console.log(`    Fill ${index}:`, fill);
        if (fill.boundVariables) {
          console.log(`    Fill ${index} boundVariables:`, fill.boundVariables);
        }
      });
    }
    if (node.boundVariables && Object.keys(node.boundVariables).length > 0) {
      console.log(`  - Has bound variables:`, node.boundVariables);
    }
  }

  // Try to extract component name from the node path
  let componentName = node.componentName
  if (isComponentInstance && !componentName && currentPath.includes(' > ')) {
    const pathParts = currentPath.split(' > ')
    // Look for the component name in the path (usually the component instance name)
    // Skip generic layer names
    const genericLayerNames = /^(Layer|Frame|Group|Rectangle|Text|Button|Input|Card|Modal|Dialog|Header|Footer|Sidebar|Nav|Menu|List|Grid|Container|Wrapper|Box|Div|Span|P|H[1-6]|A|Img|Icon|Logo|Avatar|Badge|Tag|Label|Field|Form|Section|Article|Aside|Main|Outlet|Media area|Instance)$/i
    
    // The component name is usually the name of the component instance itself
    if (!genericLayerNames.test(node.name)) {
      componentName = node.name
    } else {
      // Look in the path for a meaningful component name
      for (let i = pathParts.length - 1; i >= 0; i--) {
        const part = pathParts[i]
        if (!genericLayerNames.test(part) && !part.match(/^Component \d+:\d+$/) && !part.match(/^\d+:\d+$/)) {
          componentName = part
          break
        }
      }
    }
  }

  const isParentFrame = context.parentFrames.some((frame) => frame.id === node.id)
  if (isParentFrame) {
    currentFrame = {
      id: node.id,
      name: node.name,
      path: currentPath,
    }

    initializeFrameAnalysis(node.id, node.name, currentPath, context.figmaUrl, context.frameAnalyses)
  }

  // Create a new context for child nodes with updated component tracking
  const childContext = {
    ...context,
    isInsideComponent: newIsInsideComponent,
    currentComponentId: newCurrentComponentId,
  }

  // Update the node with component name if we found one
  const nodeWithComponentName = {
    ...node,
    componentName: componentName || node.componentName,
  }

  const nodeTokenizationInfo = extractNodeValues(nodeWithComponentName, currentPath, currentFrame, childContext.hardcodedValues, childContext.styleIdToStyle, childContext)

  // Update tokenization stats - track at property level, not element level
  // We count each property that is tokenized, not just elements with any tokenized properties
  if (nodeTokenizationInfo.hasAnyTokenizedProperties) {
    // Count individual tokenized properties (this is a simplified approach)
    // In a more detailed implementation, we would count each property individually
    context.stats.tokenizedProperties += 1
  }
  
  // Count hardcoded properties found
  context.stats.hardcodedProperties += nodeTokenizationInfo.hardcodedPropertiesFound || 0

  // Update frame-specific tokenization stats
  if (currentFrame) {
    const frameAnalysis = context.frameAnalyses.get(currentFrame.id)
    if (frameAnalysis) {
      frameAnalysis.totalElements++
      if (nodeTokenizationInfo.hasAnyTokenizedProperties) {
        frameAnalysis.tokenizedProperties = (frameAnalysis.tokenizedProperties || 0) + 1
      }
    }
  }

  if (node.children) {
    node.children.forEach((child) => {
      // Pass the component name context to child nodes
      const childWithComponentContext = {
        ...child,
        componentName: componentName || child.componentName,
      }
      traverseDocumentNodes(childWithComponentContext, childContext, currentPath, currentFrame)
    })
  }
}

function initializeFrameAnalysis(
  frameId: string,
  frameName: string,
  framePath: string,
  figmaUrl: string,
  frameAnalyses: Map<string, FrameAnalysis>,
): void {
  if (!frameAnalyses.has(frameId)) {
    frameAnalyses.set(frameId, {
      frameId,
      frameName,
      framePath,
      figmaUrl: generateFigmaFrameUrl(figmaUrl, frameId),
      rawValues: [],
      totalElements: 0,
      tokenizedProperties: 0,
      tokenizationRate: 0,
    })
  }
}

interface NodeTokenizationInfo {
  hasAnyTokenizedProperties: boolean
  hardcodedPropertiesFound: number
}

function extractNodeValues(
  node: FigmaNode,
  currentPath: string,
  currentFrame: FrameInfo | undefined,
  hardcodedValues: HardcodedValue[],
  styleIdToStyle?: Record<string, any>,
  context?: TraversalContext, // Add context parameter
): NodeTokenizationInfo {
  let hasAnyTokenizedProperties = false
  let hardcodedPropertiesFound = 0

  console.log(`\n=== Processing node: "${node.name}" (type: ${node.type}) ===`);
  console.log(`  - Path: ${currentPath}`);
  console.log(`  - Component ID: ${node.componentId || 'none'}`);
  console.log(`  - Is inside component: ${context?.isInsideComponent || false}`);

  // Extract colors from fills and strokes
  const colorTokenizationInfo = extractColorsFromNode(node, currentPath, currentFrame, hardcodedValues, styleIdToStyle, context)
  hasAnyTokenizedProperties = hasAnyTokenizedProperties || colorTokenizationInfo.hasAnyTokenizedProperties
  hardcodedPropertiesFound += colorTokenizationInfo.hardcodedPropertiesFound || 0

  // Extract spacing values (check each property individually)
  const spacingProperties = [
    { value: node.itemSpacing, name: "itemSpacing", boundVariable: node.boundVariables?.itemSpacing },
  ]
  spacingProperties.forEach(({ value, boundVariable, name }) => {
    if (value !== undefined && boundVariable === undefined && node.boundVariables?.[name] === undefined) {
      console.log(`Adding hardcoded spacing: ${value}px for "${node.name}"`);
      addHardcodedValue(`${value}px`, "spacing", currentPath, currentFrame, hardcodedValues, node.id, node, context)
      hardcodedPropertiesFound++
    } else if (boundVariable !== undefined || node.boundVariables?.[name] !== undefined) {
      console.log(`Skipping spacing for "${node.name}" - has tokenized properties`);
      hasAnyTokenizedProperties = true
    }
  })

  // Extract padding values specifically (check each property individually)
  const paddingProperties = [
    { value: node.paddingLeft, name: "paddingLeft", boundVariable: node.boundVariables?.paddingLeft },
    { value: node.paddingRight, name: "paddingRight", boundVariable: node.boundVariables?.paddingRight },
    { value: node.paddingTop, name: "paddingTop", boundVariable: node.boundVariables?.paddingTop },
    { value: node.paddingBottom, name: "paddingBottom", boundVariable: node.boundVariables?.paddingBottom },
  ]
  paddingProperties.forEach(({ value, boundVariable, name }) => {
    if (value !== undefined && boundVariable === undefined && node.boundVariables?.[name] === undefined) {
      console.log(`Adding hardcoded padding: ${value}px for "${node.name}"`);
      addHardcodedValue(`${value}px`, "padding", currentPath, currentFrame, hardcodedValues, node.id, node, context)
      hardcodedPropertiesFound++
    } else if (boundVariable !== undefined || node.boundVariables?.[name] !== undefined) {
      console.log(`Skipping padding for "${node.name}" - has tokenized properties`);
      hasAnyTokenizedProperties = true
    }
  })

  // Extract border radius (check for bound variables individually)
  if (node.cornerRadius !== undefined) {
    const hasCornerRadiusVariable = node.boundVariables?.cornerRadius !== undefined
    
    console.log(`Border radius check for "${node.name}": cornerRadius=${node.cornerRadius}, hasVariable=${hasCornerRadiusVariable}`);
    console.log(`  - boundVariables:`, node.boundVariables);
    console.log(`  - node.boundVariables?.cornerRadius:`, node.boundVariables?.cornerRadius);
    
    if (!hasCornerRadiusVariable && node.boundVariables?.cornerRadius === undefined) {
      console.log(`Adding hardcoded border radius: ${node.cornerRadius}px for "${node.name}"`);
      addHardcodedValue(`${node.cornerRadius}px`, "border-radius", currentPath, currentFrame, hardcodedValues, node.id, node, context)
      hardcodedPropertiesFound++
    } else {
      console.log(`Skipping border radius for "${node.name}" - has tokenized properties`);
      hasAnyTokenizedProperties = true
    }
  }

  // Only extract typography for TEXT nodes
  let typographyTokenizationInfo = { hasAnyTokenizedProperties: false, hardcodedPropertiesFound: 0 }
  if (node.type === 'TEXT') {
    typographyTokenizationInfo = extractTypographyFromNode(node, currentPath, currentFrame, hardcodedValues, styleIdToStyle, context)
    hasAnyTokenizedProperties = hasAnyTokenizedProperties || typographyTokenizationInfo.hasAnyTokenizedProperties
    hardcodedPropertiesFound += typographyTokenizationInfo.hardcodedPropertiesFound || 0
  }

  console.log(`=== Finished processing "${node.name}" - hasAnyTokenizedProperties: ${hasAnyTokenizedProperties}, hardcodedPropertiesFound: ${hardcodedPropertiesFound} ===\n`);

  return { hasAnyTokenizedProperties, hardcodedPropertiesFound }
}

interface ColorTokenizationInfo {
  hasAnyTokenizedProperties: boolean
  hardcodedPropertiesFound: number
}

function extractColorsFromNode(
  node: FigmaNode,
  currentPath: string,
  currentFrame: FrameInfo | undefined,
  hardcodedValues: HardcodedValue[],
  styleIdToStyle?: Record<string, any>,
  context?: TraversalContext, // Add context parameter
): ColorTokenizationInfo {
  let hasAnyTokenizedProperties = false
  let hardcodedPropertiesFound = 0

  console.log(`Color extraction for "${node.name}":`);
  console.log(`  - Node type: ${node.type}`);
  console.log(`  - Component ID: ${node.componentId || 'none'}`);
  console.log(`  - Is inside component: ${context?.isInsideComponent || false}`);
  console.log(`  - fills:`, node.fills);
  console.log(`  - strokes:`, node.strokes);
  console.log(`  - boundVariables:`, node.boundVariables);

  // Special debugging for detached components
  if (node.type === 'RECTANGLE' || node.type === 'FRAME' || node.type === 'GROUP') {
    console.log(`  - Potential detached component detected`);
    console.log(`  - Has component-like properties but no componentId`);
  }

  // If node has any style applied, skip color extraction (styles override local colors)
  if (hasNodeOrParentStyles(node, styleIdToStyle, context)) {
    console.log(`Skipping color extraction for "${node.name}" - has styles applied`);
    return { hasAnyTokenizedProperties: true, hardcodedPropertiesFound: 0 };
  }

  const isColorBound = (fillOrStroke: any) => {
    // Check if this specific fill/stroke has bound color variables
    const fillBound = fillOrStroke.boundVariables?.color !== undefined;
    
    // Check if the node has bound color variables (for fills/strokes)
    const nodeColorBound = node.boundVariables?.color !== undefined;
    
    // Check if the node has fill-specific bound variables
    const nodeFillBound = node.boundVariables?.fills !== undefined;
    
    const result = fillBound || nodeColorBound || nodeFillBound;
    console.log(`  - isColorBound check for "${node.name}":`);
    console.log(`    fillBound=${fillBound}, nodeColorBound=${nodeColorBound}, nodeFillBound=${nodeFillBound}`);
    console.log(`    fill.boundVariables:`, fillOrStroke.boundVariables);
    console.log(`    node.boundVariables:`, node.boundVariables);
    console.log(`    result=${result}`);
    return result;
  }

  // Process fills - distinguish from strokes
  if (node.fills && node.fills.length > 0) {
    console.log(`  - Processing ${node.fills.length} fills`);
    node.fills.forEach((fill, index) => {
      console.log(`  - Fill ${index}:`, fill);
      if (fill.type === "SOLID" && fill.color && (fill.visible !== false)) {
        console.log(`  - Processing solid fill ${index} with color:`, fill.color);
        if (!isColorBound(fill)) {
          const color = rgbToHex(fill.color)
          console.log(`  - Adding hardcoded fill: ${color} for "${node.name}"`);
          addHardcodedValue(color, "fill", currentPath, currentFrame, hardcodedValues, node.id, node, context)
          hardcodedPropertiesFound++
        } else {
          console.log(`  - Skipping fill ${index} for "${node.name}" - has tokenized properties`);
          hasAnyTokenizedProperties = true
        }
      } else {
        console.log(`  - Skipping fill ${index} - not a visible solid fill`);
      }
    })
  } else {
    console.log(`  - No fills to process`);
  }

  // Process strokes - distinguish from fills
  if (node.strokes && node.strokes.length > 0 && (node as any).strokeWeight > 0) {
    console.log(`  - Processing ${node.strokes.length} strokes`);
    node.strokes.forEach((stroke, index) => {
      console.log(`  - Stroke ${index}:`, stroke);
      if (stroke.type === "SOLID" && stroke.color && (stroke.visible !== false)) {
        console.log(`  - Processing solid stroke ${index} with color:`, stroke.color);
        if (!isColorBound(stroke)) {
          const color = rgbToHex(stroke.color)
          console.log(`  - Adding hardcoded stroke: ${color} for "${node.name}"`);
          addHardcodedValue(color, "stroke", currentPath, currentFrame, hardcodedValues, node.id, node, context)
          hardcodedPropertiesFound++
        } else {
          console.log(`  - Skipping stroke ${index} for "${node.name}" - has tokenized properties`);
          hasAnyTokenizedProperties = true
        }
      } else {
        console.log(`  - Skipping stroke ${index} - not a visible solid stroke`);
      }
    })
  } else {
    console.log(`  - No strokes to process`);
  }

  return { hasAnyTokenizedProperties, hardcodedPropertiesFound }
}

interface TypographyAnalysisInfo {
  hasAnyTokenizedProperties: boolean
  hardcodedPropertiesFound: number
}

function addHardcodedValue(
  value: string,
  type: "fill" | "stroke" | "spacing" | "padding" | "typography" | "border-radius",
  location: string,
  currentFrame: FrameInfo | undefined,
  hardcodedValues: HardcodedValue[],
  nodeId?: string,
  node?: FigmaNode, // Add node parameter to access component information
  context?: TraversalContext, // Add context parameter for component tracking
): void {
  const existingOccurrence = hardcodedValues.find((v) => v.value === value && v.type === type)

  // Determine if this is a component instance based on context or node properties
  const isComponentInstance = context?.isInsideComponent || 
    node?.type === 'COMPONENT' || 
    node?.type === 'INSTANCE' || 
    node?.componentId !== undefined

  const locationData = {
    path: location,
    nodeId: nodeId,
    frameId: currentFrame?.id,
    frameName: currentFrame?.name,
    framePath: currentFrame?.path,
    // Component-related information
    isComponentInstance: isComponentInstance,
    componentId: context?.currentComponentId || node?.componentId,
    componentName: node?.componentName,
  }

  if (existingOccurrence) {
    existingOccurrence.locations.push(locationData)
  } else {
    hardcodedValues.push({
      type,
      value,
      locations: [locationData],
    })
  }
}

function convertToHardcodedValuesFormat(hardcodedValues: HardcodedValue[]) {
  return hardcodedValues.map((occurrence) => ({
    type: occurrence.type,
    value: occurrence.value,
    count: occurrence.locations.length,
    locations: occurrence.locations.map((loc) => loc.path),
    nodeIds: occurrence.locations.map((loc) => loc.nodeId),
    frameNames: occurrence.locations.map((loc) => loc.frameName),
    framePaths: occurrence.locations.map((loc) => loc.framePath),
    frameIds: occurrence.locations.map((loc) => loc.frameId),
    // Component information
    isComponentInstances: occurrence.locations.map((loc) => loc.isComponentInstance),
    componentIds: occurrence.locations.map((loc) => loc.componentId),
    componentNames: occurrence.locations.map((loc) => loc.componentName),
  }))
}

function enhanceFrameAnalysesWithRecommendations(
  frameAnalyses: Map<string, FrameAnalysis>,
  hardcodedValues: HardcodedValue[],
  resolvedTokens: Record<string, ResolvedToken>,
): void {
  // Group value occurrences by frame
  const frameValueMap = new Map<string, HardcodedValue[]>()

  hardcodedValues.forEach((occurrence) => {
    occurrence.locations.forEach((location) => {
      if (location.frameId) {
        if (!frameValueMap.has(location.frameId)) {
          frameValueMap.set(location.frameId, [])
        }
        frameValueMap.get(location.frameId)!.push(occurrence)
      }
    })
  })

  // Enhance each frame analysis with recommendations
  frameAnalyses.forEach((frameAnalysis, frameId) => {
    const frameValues = frameValueMap.get(frameId) || []
    const uniqueValues = new Map<string, HardcodedValue>()

    // Deduplicate values within the frame
    frameValues.forEach((value) => {
      const key = `${value.type}-${value.value}`
      if (!uniqueValues.has(key)) {
        uniqueValues.set(key, value)
      }
    })

    // Generate recommendations for each unique value
    frameAnalysis.rawValues = Array.from(uniqueValues.values()).map((occurrence) => {
      const recommendations = getRecommendationsForValue(occurrence.value, occurrence.type, resolvedTokens)

      // Filter locations to only include those that belong to this frame
      const frameLocations = occurrence.locations.filter(loc => loc.frameId === frameId)
      
      return {
        type: occurrence.type,
        value: occurrence.value,
        count: frameLocations.length, // Count only frame-specific occurrences
        locations: frameLocations.map((loc) => loc.path),
        nodeIds: frameLocations.map((loc) => loc.nodeId).filter((id): id is string => id !== undefined),
        layerNames: frameLocations.map((loc) => loc.path.split(' > ').pop() || 'Unknown Layer'), // Extract layer name from path
        // Component information
        isComponentInstances: frameLocations.map((loc) => loc.isComponentInstance || false),
        componentIds: frameLocations.map((loc) => loc.componentId),
        componentNames: frameLocations.map((loc) => loc.componentName),
        recommendations: recommendations.map((rec) => ({
          tokenName: rec.tokenName,
          tokenValue: rec.tokenValue,
          confidence: rec.confidence,
          isSemanticToken: rec.isSemanticToken,
          originalReference: rec.originalReference,
          tokenType: rec.tokenType,
          fullTokenPath: rec.fullTokenPath,
        })),
      }
    })

    // Calculate total issues (total occurrences) for this frame
    const totalFrameIssues = frameValues.reduce((sum, occurrence) => {
      // Count occurrences that belong to this frame
      const frameOccurrences = occurrence.locations.filter(loc => loc.frameId === frameId).length
      return sum + frameOccurrences
    }, 0)

    // Add total issues count to frame analysis
    frameAnalysis.totalIssues = totalFrameIssues

    // Calculate tokenization rate based on actual tokenized properties vs total properties
    frameAnalysis.tokenizationRate = frameAnalysis.totalElements > 0 
      ? ((frameAnalysis.tokenizedProperties || 0) / frameAnalysis.totalElements) * 100 
      : 0
  })
}