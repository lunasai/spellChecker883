import { generateFigmaFrameUrl } from "./figma-utils"
import { rgbToHex } from "./color-utils"
import { getRecommendationsForValue } from "./token-matcher"
import type { FigmaNode, ValueOccurrence, FrameAnalysis, FrameInfo, ResolvedToken } from "./types"
import axios from "axios"

// --- Figma Style Fetching and Mapping ---

export async function fetchFigmaTextStyles(figmaFileKey: string, personalAccessToken: string) {
  const stylesUrl = `https://api.figma.com/v1/files/${figmaFileKey}/styles`;
  const fileUrl = `https://api.figma.com/v1/files/${figmaFileKey}`;
  const headers = { 'X-Figma-Token': personalAccessToken };

  // Fetch styles metadata
  const stylesRes = await axios.get(stylesUrl, { headers });
  const styles = stylesRes.data.meta.styles;
  const textStyleIds = styles.filter((s: any) => s.style_type === 'TEXT').map((s: any) => s.node_id);

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
  textStyleIds.forEach((id: string) => {
    if (nodeMap[id]) styleIdToStyle[id] = nodeMap[id];
  });
  return styleIdToStyle;
}

// --- Updated Typography Extraction ---

function extractTypographyFromNode(
  node: FigmaNode,
  currentPath: string,
  currentFrame: FrameInfo | undefined,
  valueOccurrences: ValueOccurrence[],
  styleIdToStyle?: Record<string, any>,
  context?: TraversalContext, // Add context parameter
): TypographyTokenizationInfo {
  let hasTokenizedProperties = false

  if (!node.style) {
    return { hasTokenizedProperties }
  }

  // If node has any style in styles and style map is provided, skip adding any value occurrences (hide from results)
  // @ts-ignore
  if ((node as any).styles && styleIdToStyle) {
    const stylesObj = (node as any).styles;
    for (const key in stylesObj) {
      if (stylesObj[key] && styleIdToStyle[stylesObj[key]]) {
        return { hasTokenizedProperties: true };
      }
    }
  }

  // Gather style bound variables if present
  let styleBoundVariables: any = {};
  // @ts-ignore
  if ((node as any).styles && (node as any).styles.text && styleIdToStyle && styleIdToStyle[(node as any).styles.text]) {
    styleBoundVariables = styleIdToStyle[(node as any).styles.text].boundVariables || {};
  }

  // If any typography property is bound to a variable (node or style), skip adding value occurrences (hide from results)
  const typographyKeys = ["fontSize", "fontFamily", "fontWeight", "lineHeight"];
  for (const key of typographyKeys) {
    if ((node.boundVariables && node.boundVariables[key]) || (styleBoundVariables && styleBoundVariables[key])) {
      return { hasTokenizedProperties: true };
    }
  }

  // Check for text fill bound variables (for text color)
  if (node.fills) {
    node.fills.forEach((fill) => {
      if (fill.type === "SOLID" && fill.color) {
        const hasBoundVariable = (fill.boundVariables?.color !== undefined) || (node.boundVariables?.color !== undefined)
        if (hasBoundVariable) {
          hasTokenizedProperties = true
        }
      }
    })
  }

  // Check typography properties for hardcoded values only
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

  typographyProperties.forEach(({ value, suffix }) => {
    if (value !== undefined) {
      const formattedValue = suffix ? `${value}${suffix}` : String(value)
      addValueOccurrence(formattedValue, "typography", currentPath, currentFrame, valueOccurrences, node.id, node, context)
    }
  })

  return { hasTokenizedProperties }
}

export interface FigmaAnalysisResult {
  nonTokenizedValues: Array<{
    type: "fill" | "stroke" | "spacing" | "padding" | "typography" | "border-radius"
    value: string
    count: number
    locations: string[]
  }>
  frameAnalyses: FrameAnalysis[]
  totalElements: number
  tokenizedElements: number
  valueOccurrences: ValueOccurrence[]
}

interface NodeAnalysisStats {
  totalElements: number
  tokenizedElements: number
}

export function analyzeFigmaFileByFrames(
  document: FigmaNode,
  figmaUrl: string,
  resolvedTokens?: Record<string, ResolvedToken>,
  styleIdToStyle?: Record<string, any>,
): FigmaAnalysisResult {
  const valueOccurrences: ValueOccurrence[] = []
  const frameAnalyses: Map<string, FrameAnalysis> = new Map()
  const stats: NodeAnalysisStats = { totalElements: 0, tokenizedElements: 0 }

  const parentFrames = findParentFrames(document)

  traverseDocumentNodes(document, {
    valueOccurrences,
    frameAnalyses,
    parentFrames,
    figmaUrl,
    resolvedTokens,
    stats,
    styleIdToStyle,
    isInsideComponent: false, // Start outside any component
  })

  const nonTokenizedValues = convertToNonTokenizedFormat(valueOccurrences)

  // Enhance frame analyses with recommendations if tokens are provided
  if (resolvedTokens) {
    enhanceFrameAnalysesWithRecommendations(frameAnalyses, valueOccurrences, resolvedTokens)
  }

  return {
    nonTokenizedValues,
    frameAnalyses: Array.from(frameAnalyses.values()),
    totalElements: stats.totalElements,
    tokenizedElements: stats.tokenizedElements,
    valueOccurrences,
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
  valueOccurrences: ValueOccurrence[]
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

  const nodeTokenizationInfo = extractNodeValues(nodeWithComponentName, currentPath, currentFrame, childContext.valueOccurrences, childContext.styleIdToStyle, childContext)

  // Update tokenization stats
  if (nodeTokenizationInfo.hasTokenizedProperties) {
    context.stats.tokenizedElements++
  }

  // Update frame-specific tokenization stats
  if (currentFrame) {
    const frameAnalysis = context.frameAnalyses.get(currentFrame.id)
    if (frameAnalysis) {
      frameAnalysis.totalElements++
      if (nodeTokenizationInfo.hasTokenizedProperties) {
        frameAnalysis.tokenizedElements = (frameAnalysis.tokenizedElements || 0) + 1
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
      tokenizedElements: 0,
      tokenizationRate: 0,
    })
  }
}

interface NodeTokenizationInfo {
  hasTokenizedProperties: boolean
}

function extractNodeValues(
  node: FigmaNode,
  currentPath: string,
  currentFrame: FrameInfo | undefined,
  valueOccurrences: ValueOccurrence[],
  styleIdToStyle?: Record<string, any>,
  context?: TraversalContext, // Add context parameter
): NodeTokenizationInfo {
  let hasTokenizedProperties = false

  // Extract colors from fills and strokes
  const colorTokenizationInfo = extractColorsFromNode(node, currentPath, currentFrame, valueOccurrences, context)
  hasTokenizedProperties = hasTokenizedProperties || colorTokenizationInfo.hasTokenizedProperties

  // Extract spacing values (these typically don't have bound variables in current Figma API)
  const spacingProperties = [
    { value: node.itemSpacing, name: "itemSpacing", boundVariable: node.boundVariables?.itemSpacing },
  ]
  spacingProperties.forEach(({ value, boundVariable, name }) => {
    if (value !== undefined && boundVariable === undefined && node.boundVariables?.[name] === undefined) {
      addValueOccurrence(`${value}px`, "spacing", currentPath, currentFrame, valueOccurrences, node.id, node, context)
    } else if (boundVariable !== undefined || node.boundVariables?.[name] !== undefined) {
      hasTokenizedProperties = true
    }
  })

  // Extract padding values specifically
  const paddingProperties = [
    { value: node.paddingLeft, name: "paddingLeft", boundVariable: node.boundVariables?.paddingLeft },
    { value: node.paddingRight, name: "paddingRight", boundVariable: node.boundVariables?.paddingRight },
    { value: node.paddingTop, name: "paddingTop", boundVariable: node.boundVariables?.paddingTop },
    { value: node.paddingBottom, name: "paddingBottom", boundVariable: node.boundVariables?.paddingBottom },
  ]
  paddingProperties.forEach(({ value, boundVariable, name }) => {
    if (value !== undefined && boundVariable === undefined && node.boundVariables?.[name] === undefined) {
      addValueOccurrence(`${value}px`, "padding", currentPath, currentFrame, valueOccurrences, node.id, node, context)
    } else if (boundVariable !== undefined || node.boundVariables?.[name] !== undefined) {
      hasTokenizedProperties = true
    }
  })

  // Extract border radius (check for bound variables if available)
  if (node.cornerRadius !== undefined) {
    const hasCornerRadiusVariable = node.boundVariables?.cornerRadius !== undefined
    if (!hasCornerRadiusVariable && node.boundVariables?.cornerRadius === undefined) {
      addValueOccurrence(`${node.cornerRadius}px`, "border-radius", currentPath, currentFrame, valueOccurrences, node.id, node, context)
    } else {
      hasTokenizedProperties = true
    }
  }

  // Only extract typography for TEXT nodes
  let typographyTokenizationInfo = { hasTokenizedProperties: false }
  if (node.type === 'TEXT') {
    typographyTokenizationInfo = extractTypographyFromNode(node, currentPath, currentFrame, valueOccurrences, styleIdToStyle, context)
    hasTokenizedProperties = hasTokenizedProperties || typographyTokenizationInfo.hasTokenizedProperties
  }

  return { hasTokenizedProperties }
}

interface ColorTokenizationInfo {
  hasTokenizedProperties: boolean
}

function extractColorsFromNode(
  node: FigmaNode,
  currentPath: string,
  currentFrame: FrameInfo | undefined,
  valueOccurrences: ValueOccurrence[],
  context?: TraversalContext, // Add context parameter
): ColorTokenizationInfo {
  let hasTokenizedProperties = false

  const isColorBound = (fillOrStroke: any) => {
    return (
      (fillOrStroke.boundVariables?.color !== undefined) ||
      (node.boundVariables?.color !== undefined)
    )
  }

  // Process fills - distinguish from strokes
  if (node.fills && node.fills.length > 0) {
    node.fills.forEach((fill, index) => {
      if (fill.type === "SOLID" && fill.color && (fill.visible !== false)) {
        if (!isColorBound(fill)) {
          const color = rgbToHex(fill.color)
          addValueOccurrence(color, "fill", currentPath, currentFrame, valueOccurrences, node.id, node, context)
        } else {
          hasTokenizedProperties = true
        }
      }
    })
  }

  // Process strokes - distinguish from fills
  if (node.strokes && node.strokes.length > 0 && (node as any).strokeWeight > 0) {
    node.strokes.forEach((stroke, index) => {
      if (stroke.type === "SOLID" && stroke.color && (stroke.visible !== false)) {
        if (!isColorBound(stroke)) {
          const color = rgbToHex(stroke.color)
          addValueOccurrence(color, "stroke", currentPath, currentFrame, valueOccurrences, node.id, node, context)
        } else {
          hasTokenizedProperties = true
        }
      }
    })
  }

  return { hasTokenizedProperties }
}

function extractSpacingFromNode(
  node: FigmaNode,
  currentPath: string,
  currentFrame: FrameInfo | undefined,
  valueOccurrences: ValueOccurrence[],
): void {
  const spacingProperties = [
    { value: node.itemSpacing, name: "itemSpacing", boundVariable: node.boundVariables?.itemSpacing },
  ]

  spacingProperties.forEach(({ value, boundVariable }) => {
    if (value !== undefined && !boundVariable) {
      addValueOccurrence(`${value}px`, "spacing", currentPath, currentFrame, valueOccurrences, node.id)
    }
  })

  // Extract padding values specifically
  const paddingProperties = [
    { value: node.paddingLeft, name: "paddingLeft", boundVariable: node.boundVariables?.paddingLeft },
    { value: node.paddingRight, name: "paddingRight", boundVariable: node.boundVariables?.paddingRight },
    { value: node.paddingTop, name: "paddingTop", boundVariable: node.boundVariables?.paddingTop },
    { value: node.paddingBottom, name: "paddingBottom", boundVariable: node.boundVariables?.paddingBottom },
  ]

  paddingProperties.forEach(({ value, boundVariable }) => {
    if (value !== undefined && !boundVariable) {
      addValueOccurrence(`${value}px`, "padding", currentPath, currentFrame, valueOccurrences, node.id)
    }
  })
}

interface TypographyTokenizationInfo {
  hasTokenizedProperties: boolean
}

function addValueOccurrence(
  value: string,
  type: "fill" | "stroke" | "spacing" | "padding" | "typography" | "border-radius",
  location: string,
  currentFrame: FrameInfo | undefined,
  valueOccurrences: ValueOccurrence[],
  nodeId?: string,
  node?: FigmaNode, // Add node parameter to access component information
  context?: TraversalContext, // Add context parameter for component tracking
): void {
  const existingOccurrence = valueOccurrences.find((v) => v.value === value && v.type === type)

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
    valueOccurrences.push({
      type,
      value,
      locations: [locationData],
    })
  }
}

function convertToNonTokenizedFormat(valueOccurrences: ValueOccurrence[]) {
  return valueOccurrences.map((occurrence) => ({
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
  valueOccurrences: ValueOccurrence[],
  resolvedTokens: Record<string, ResolvedToken>,
): void {
  // Group value occurrences by frame
  const frameValueMap = new Map<string, ValueOccurrence[]>()

  valueOccurrences.forEach((occurrence) => {
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
    const uniqueValues = new Map<string, ValueOccurrence>()

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

    // Calculate tokenization rate based on actual tokenized elements vs total elements
    frameAnalysis.tokenizationRate = frameAnalysis.totalElements > 0 
      ? ((frameAnalysis.tokenizedElements || 0) / frameAnalysis.totalElements) * 100 
      : 0
  })
}
