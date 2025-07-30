import { rgbToHex } from "./color-utils"
import { getRecommendationsForValue } from "./token-matcher"
import { generateFigmaFrameUrl } from "./figma-utils"
import type { FigmaNode, HardcodedValue, FrameAnalysis, FrameInfo, ResolvedToken } from "./types"
import axios from "axios"

// --- Logging Configuration ---
// Set these to true when you need detailed debugging information
// DEBUG_MODE: Controls detailed node processing logs
// LOG_COMPONENT_ANALYSIS: Controls component analysis logs
const DEBUG_MODE = false; // Set to true for detailed debugging
const LOG_COMPONENT_ANALYSIS = false; // Set to true to see component analysis details

function logDebug(message: string, ...args: any[]) {
  if (DEBUG_MODE) {
    console.log(message, ...args);
  }
}

function logComponent(message: string, ...args: any[]) {
  if (LOG_COMPONENT_ANALYSIS) {
    console.log(message, ...args);
  }
}

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
      logDebug(`Mapped style ${id}: ${nodeMap[id].name} (${nodeMap[id].type})`);
      
      // Log more details about EFFECT styles specifically
      if (nodeMap[id].type === 'RECTANGLE' && nodeMap[id].cornerRadius !== undefined) {
        logDebug(`  - EFFECT style has cornerRadius: ${nodeMap[id].cornerRadius}px`);
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
    logDebug(`Checking styles for node "${node.name}":`, stylesObj);
    for (const key in stylesObj) {
      if (stylesObj[key] && styleIdToStyle[stylesObj[key]]) {
        logDebug(`Node "${node.name}" has style "${key}" applied: ${stylesObj[key]}`);
        return true;
      }
    }
  }

  // Check if this is a component instance and has component properties that might include styles
  if (node.type === 'INSTANCE' && node.componentProperties) {
    logDebug(`Checking component properties for "${node.name}":`, node.componentProperties);
    // Component instances can have overridden properties that include styles
    for (const [key, value] of Object.entries(node.componentProperties)) {
      if (value && typeof value === 'object' && 'type' in value) {
        // Check if the property value is a style reference
        if (value.type === 'STYLE' && value.value && styleIdToStyle && styleIdToStyle[value.value]) {
          logDebug(`Node "${node.name}" has component property "${key}" with style: ${value.value}`);
          return true;
        }
      }
    }
  }

  // Note: We removed the broad boundVariables check here because it was causing issues
  // with detached components that have some bound variables but detached fills
  // Instead, we check bound variables per property in the specific extraction functions

  logDebug(`Node "${node.name}" has no styles or component properties with styles`);
  return false;
}

// Enhanced function to check for styles including component hierarchy
function hasNodeOrParentStyles(node: FigmaNode, styleIdToStyle?: Record<string, any>, context?: TraversalContext): boolean {
  // First check if the current node has styles
  if (hasNodeStyles(node, styleIdToStyle)) {
    return true;
  }

  // If we're inside a component context, check if the parent component has styles
  if (context?.isInsideComponent && context.currentComponentId) {
    // This would require additional logic to check parent component styles
    // For now, we'll just check the current node
    return false;
  }

  return false;
}

// Component type cache to avoid repeated analysis
const componentTypeCache = new Map<string, any>();

// Component issue analysis cache
const componentIssueCache = new Map<string, any>();

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

  logDebug(`Typography extraction for "${node.name}":`);
  logDebug(`  - style:`, node.style);
  logDebug(`  - boundVariables:`, node.boundVariables);

  // For typography, if there's a style applied, treat it as fully tokenized
  // This is because typography styles in Figma work as cohesive units
  if (hasNodeOrParentStyles(node, styleIdToStyle, context)) {
    logDebug(`Typography style detected for "${node.name}" - treating as fully tokenized`);
    return { hasAnyTokenizedProperties: true, hardcodedPropertiesFound: 0 };
  }

  // Check if the current frame has typography styles applied
  // This is important because frames can have typography styles that affect all text nodes within them
  if (currentFrame && context?.parentFrames) {
    const parentFrame = context.parentFrames.find(frame => frame.id === currentFrame?.id);
    if (parentFrame && hasNodeStyles(parentFrame, styleIdToStyle)) {
      logDebug(`Parent frame "${parentFrame.name}" has styles applied - treating typography as tokenized`);
      return { hasAnyTokenizedProperties: true, hardcodedPropertiesFound: 0 };
    }
  }

  // Gather style bound variables if present
  let styleBoundVariables: any = {};
  // @ts-ignore
  if ((node as any).styles && (node as any).styles.text && styleIdToStyle && styleIdToStyle[(node as any).styles.text]) {
    styleBoundVariables = styleIdToStyle[(node as any).styles.text].boundVariables || {};
    logDebug(`  - styleBoundVariables:`, styleBoundVariables);
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
      logDebug(`Typography property "${key}" has bound variables for "${node.name}" - treating as tokenized`);
      hasAnyTypographyBoundVariables = true;
      break; // If any typography property is bound, treat all as tokenized
    }
  }

  // If any typography property is bound, skip adding value occurrences (hide from results)
  if (hasAnyTypographyBoundVariables) {
    logDebug(`Typography has bound variables for "${node.name}" - treating as fully tokenized`);
    return { hasAnyTokenizedProperties: true, hardcodedPropertiesFound: 0 };
  }

  // Check if this node is inside a component that might have typography styles
  // Component instances often inherit typography from their main component
  if (context?.isInsideComponent || node.type === 'INSTANCE') {
    logDebug(`Node "${node.name}" is inside a component - checking for inherited typography styles`);
    
    // Check if any typography properties have values that suggest they're from a style
    // This is a heuristic: if all typography properties are set and consistent, they might be from a style
    const hasFontSize = node.style.fontSize !== undefined;
    const hasFontFamily = node.style.fontFamily !== undefined;
    const hasFontWeight = node.style.fontWeight !== undefined;
    const hasLineHeight = node.style.lineHeightPx !== undefined;
    
    // If we have a complete typography set, it's likely from a style
    if (hasFontSize && hasFontFamily && hasFontWeight) {
      logDebug(`Node "${node.name}" has complete typography set - likely from inherited style, treating as tokenized`);
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
      logDebug(`  - Adding hardcoded typography: ${formattedValue} (${name}) for "${node.name}"`);
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
  allComponents: Array<{
    componentId: string
    componentName: string
    componentType: 'EXTERNAL_INSTANCE' | 'LOCAL_COMPONENT' | 'LOCAL_INSTANCE' | 'REGULAR_NODE'
    instances: Array<{
      nodeId: string
      layerName: string
      frameId: string
      frameName: string
      framePath: string
      figmaUrl: string
      hasOverwrittenProperties: boolean
      overwrittenProperties: string[]
      isDetached: boolean
    }>
  }>
  detachedComponents?: DetachedComponentInfo[]
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
  const context = {
    hardcodedValues,
    frameAnalyses,
    parentFrames,
    figmaUrl,
    resolvedTokens,
    stats,
    styleIdToStyle,
    isInsideComponent: false, // Start outside any component
    allComponents: new Map(), // Initialize component collection
  }

  // Enhanced detached component detection
  logComponent("🔍 Starting enhanced detached component detection...")
  const detachedComponents = detectDetachedComponents(document, figmaUrl)
  
  // Create a set of known component names from the detected components
  const knownComponentNames = new Set<string>()
  detachedComponents.forEach(detached => {
    if (detached.componentName) {
      knownComponentNames.add(detached.componentName)
    }
    // Also add the node name as it might be a component name
    knownComponentNames.add(detached.nodeName)
  })
  
  logComponent(`📋 Found ${detachedComponents.length} detached components. Known component names: ${Array.from(knownComponentNames).join(', ')}`)

  traverseDocumentNodes(document, context)

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
    allComponents: Array.from(context.allComponents.values()),
    detachedComponents: detachedComponents,
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
  currentComponentName?: string
  isInsideComponent: boolean
  // Component collection for usage analysis
  allComponents: Map<string, {
    componentId: string
    componentName: string
    componentType: 'EXTERNAL_INSTANCE' | 'LOCAL_COMPONENT' | 'LOCAL_INSTANCE' | 'REGULAR_NODE'
    instances: Array<{
      nodeId: string
      layerName: string
      frameId: string
      frameName: string
      framePath: string
      figmaUrl: string
      hasOverwrittenProperties: boolean
      overwrittenProperties: string[]
      isDetached: boolean
    }>
  }>
}

// Helper function to check if a node has any bound variables or is a component instance
function hasTokenizedProperties(node: FigmaNode, context?: TraversalContext): boolean {
  // Check if it's a component instance
  const isComponentInstance = node.type === 'INSTANCE' || node.componentId !== undefined || (context?.isInsideComponent || false)
  
  // Check if it has any bound variables
  const hasBoundVariables = !!(node.boundVariables && Object.keys(node.boundVariables).length > 0)
  
  // Check if it has any fills with bound variables
  const hasBoundFills = !!(node.fills && node.fills.some((fill: any) => 
    fill.boundVariables && Object.keys(fill.boundVariables).length > 0
  ))
  
  // Check if it has any strokes with bound variables
  const hasBoundStrokes = !!(node.strokes && node.strokes.some((stroke: any) => 
    stroke.boundVariables && Object.keys(stroke.boundVariables).length > 0
  ))
  
  return isComponentInstance || hasBoundVariables || hasBoundFills || hasBoundStrokes
}

// Helper function to determine component type and whether to show issues
function getComponentType(node: FigmaNode, context?: TraversalContext): {
  type: 'EXTERNAL_INSTANCE' | 'LOCAL_COMPONENT' | 'LOCAL_INSTANCE' | 'REGULAR_NODE'
  shouldShowIssues: boolean
  isComponentInstance: boolean
} {
  // Create cache key based on node properties that affect component type
  const cacheKey = `${node.id}-${node.type}-${node.componentId}-${context?.isInsideComponent}-${context?.currentComponentId}`;
  
  if (componentTypeCache.has(cacheKey)) {
    return componentTypeCache.get(cacheKey);
  }

  logComponent(`🔍 GETTING COMPONENT TYPE for "${node.name}":`)
  logComponent(`   Node type: ${node.type}`)
  logComponent(`   Component ID: ${node.componentId}`)
  logComponent(`   Has bound variables: ${!!(node.boundVariables && Object.keys(node.boundVariables).length > 0)}`)
  logComponent(`   Is inside component: ${context?.isInsideComponent || false}`)
  logComponent(`   Current component context: ${context?.currentComponentName || 'none'}`)
  
  // Check if it's a component instance (has componentId)
  const isComponentInstance = node.type === 'INSTANCE' || node.componentId !== undefined
  const isComponentDefinition = node.type === 'COMPONENT'
  const isInsideComponent = context?.isInsideComponent || false
  
  if (isComponentInstance) {
    // If it has a componentId, it's an instance of some component
    // We need to determine if it's from an external library or local
    
    // Check for bound variables (indicates external library)
    const hasBoundVariables = !!(node.boundVariables && Object.keys(node.boundVariables).length > 0)
    const hasBoundFills = !!(node.fills && node.fills.some((fill: any) => 
      fill.boundVariables && Object.keys(fill.boundVariables).length > 0
    ))
    const hasBoundStrokes = !!(node.strokes && node.strokes.some((stroke: any) => 
      stroke.boundVariables && Object.keys(stroke.boundVariables).length > 0
    ))
    
    // Check if we're inside an external library component context
    const isInsideExternalComponent = context?.currentComponentId && 
      context.allComponents.has(context.currentComponentId) &&
      context.allComponents.get(context.currentComponentId)?.componentType === 'EXTERNAL_INSTANCE'
    
    // Check componentId pattern for external library indicators
    const hasExternalComponentIdPattern = node.componentId && 
      typeof node.componentId === 'string' && 
      (node.componentId.includes(':') || node.componentId.includes('_') || node.componentId.length > 20)
    
          // Enhanced external library detection
      if (hasBoundVariables || hasBoundFills || hasBoundStrokes || isInsideExternalComponent || hasExternalComponentIdPattern) {
        // External library instance - don't show issues
        const result = {
          type: 'EXTERNAL_INSTANCE' as const,
          shouldShowIssues: false,
          isComponentInstance: true
        }
        logComponent(`✅ COMPONENT TYPE RESULT for "${node.name}": ${result.type} (External Library)`)
        
        // Cache the result
        componentTypeCache.set(cacheKey, result);
        return result
      } else {
        // Local component instance - show issues
        const result = {
          type: 'LOCAL_INSTANCE' as const,
          shouldShowIssues: true,
          isComponentInstance: true
        }
        logComponent(`✅ COMPONENT TYPE RESULT for "${node.name}": ${result.type} (Local Instance)`)
        
        // Cache the result
        componentTypeCache.set(cacheKey, result);
        return result
      }
  } else if (isComponentDefinition) {
    // Local component definition - show issues
    const result = {
      type: 'LOCAL_COMPONENT' as const,
      shouldShowIssues: true,
      isComponentInstance: false
    }
    logComponent(`✅ COMPONENT TYPE RESULT for "${node.name}": ${result.type} (Local Component)`)
    
    // Cache the result
    componentTypeCache.set(cacheKey, result);
    return result
  } else if (isInsideComponent) {
    // We're inside a component context - this is part of a local component or instance
    // Determine if the parent component is external or local
    const parentComponentId = context?.currentComponentId
    const parentComponentName = context?.currentComponentName
    
    // Check if parent is external library
    if (parentComponentId && context?.allComponents.has(parentComponentId)) {
      const parentComponent = context.allComponents.get(parentComponentId)!
      if (parentComponent.componentType === 'EXTERNAL_INSTANCE') {
        // Inherit external library status from parent
        const result = {
          type: 'EXTERNAL_INSTANCE' as const,
          shouldShowIssues: false,
          isComponentInstance: true
        }
        logComponent(`✅ COMPONENT TYPE RESULT for "${node.name}": ${result.type} (Inherited from External Parent)`)
        
        // Cache the result
        componentTypeCache.set(cacheKey, result);
        return result
      }
    }
    
          // Default to local instance if we're inside a component context
      const result = {
        type: 'LOCAL_INSTANCE' as const,
        shouldShowIssues: true,
        isComponentInstance: true
      }
      logComponent(`✅ COMPONENT TYPE RESULT for "${node.name}": ${result.type} (Inside Component Context)`)
      
      // Cache the result
      componentTypeCache.set(cacheKey, result);
      return result
      } else {
      // Regular node - show issues
      const result = {
        type: 'REGULAR_NODE' as const,
        shouldShowIssues: true,
        isComponentInstance: false
      }
      logComponent(`✅ COMPONENT TYPE RESULT for "${node.name}": ${result.type} (Regular Node)`)
      
      // Cache the result
      componentTypeCache.set(cacheKey, result);
      return result
    }
  }

// Helper function to analyze component issues based on the new rules
function analyzeComponentIssues(
  node: FigmaNode,
  componentType: 'EXTERNAL_INSTANCE' | 'LOCAL_COMPONENT' | 'LOCAL_INSTANCE' | 'REGULAR_NODE'
): {
  hasOverwrittenProperties: boolean
  overwrittenProperties: string[]
  isDetached: boolean
  shouldShowIssues: boolean
} {
  // Create cache key
  const cacheKey = `${node.id}-${node.type}-${node.componentId}-${componentType}`;
  
  if (componentIssueCache.has(cacheKey)) {
    return componentIssueCache.get(cacheKey);
  }

  // PROMINENT LOGGING - This should always appear
  logComponent(`🔍 ANALYZING COMPONENT ISSUES: "${node.name}" (${componentType})`)
  logComponent(`   Node type: ${node.type}`)
  logComponent(`   Component ID: ${node.componentId}`)
  logComponent(`   Component ID type: ${typeof node.componentId}`)
  
  // Enhanced detached component detection
  // A detached instance is when a component instance has lost its connection to the master component
  // This can happen when the original component is deleted or the instance is "detached" in Figma
  let isDetached = false
  
  if (node.type === 'INSTANCE') {
    // Method 1: Check if this instance has a valid componentId (not detached)
    if (!node.componentId) {
      // No componentId means it's detached
      isDetached = true
      logComponent(`   ❌ DETACHED: No componentId found`)
    } else {
      // For external library components, be more lenient with componentId validation
      if (componentType === 'EXTERNAL_INSTANCE') {
        // External library components might have different componentId patterns
        // Only mark as detached if componentId is clearly invalid
        const isValidComponentId = node.componentId && 
                                  typeof node.componentId === 'string' && 
                                  node.componentId.length > 0
        
        if (!isValidComponentId) {
          isDetached = true
          logComponent(`   ❌ DETACHED: Invalid componentId for external library component`)
        } else {
          isDetached = false
          logComponent(`   ✅ NOT DETACHED: Valid componentId for external library component`)
        }
      } else {
        // For local components, use stricter validation
        // Check if the componentId follows the expected pattern (usually "componentId:versionId")
        const isValidComponentId = node.componentId && 
                                  typeof node.componentId === 'string' && 
                                  node.componentId.length > 0 &&
                                  node.componentId.includes(':')
        
        if (!isValidComponentId) {
          // Invalid componentId format might indicate detachment
          isDetached = true
          logComponent(`   ❌ DETACHED: Invalid componentId format for local component`)
        } else {
          // Valid componentId, not detached
          isDetached = false
          logComponent(`   ✅ NOT DETACHED: Valid componentId format for local component`)
        }
      }
    }
  } else if (node.type === 'FRAME' || node.type === 'GROUP') {
    // Method 2: Check if this FRAME/GROUP might be a detached component
    // Use heuristic detection for non-INSTANCE nodes that might be detached components
    const heuristicScore = calculateDetachedHeuristicScore(node)
    
    if (heuristicScore >= 0.8) {
      isDetached = true
      logComponent(`   ❌ DETACHED: FRAME/GROUP with high component likelihood (score: ${heuristicScore.toFixed(2)})`)
    } else if (heuristicScore >= 0.6) {
      // Medium confidence - mark as potentially detached
      isDetached = true
      logComponent(`   ⚠️ POTENTIALLY DETACHED: FRAME/GROUP with medium component likelihood (score: ${heuristicScore.toFixed(2)})`)
    } else {
      isDetached = false
      logComponent(`   ✅ NOT DETACHED: FRAME/GROUP with low component likelihood (score: ${heuristicScore.toFixed(2)})`)
    }
  } else {
    // Not an instance or frame/group, so not detached
    isDetached = false
    logComponent(`   ✅ NOT DETACHED: Not a component instance or frame/group`)
  }

  // Check for overwritten properties
  // We need to detect when someone has changed a variable/token value from its original
  let hasOverwrittenProperties = false
  let overwrittenProperties: string[] = []
  
  // TEMPORARILY DISABLED: Set to false to avoid false positives while we debug
  // TODO: Implement proper detection of actual variable overrides
  hasOverwrittenProperties = false
  overwrittenProperties = []
  
  // Original logic (commented out for now):
  /*
  if (node.componentProperties && typeof node.componentProperties === 'object') {
    for (const [key, value] of Object.entries(node.componentProperties)) {
      // Check if this is an actual override (not just a default property)
      if (value !== null && value !== undefined && typeof value === 'object' && 'type' in value) {
        // For component properties, we need to check if this represents a variable override
        // Look for properties that have been changed from their original token/variable values
        
        // Check if this property has been modified from its original value
        // This could be detected by checking if the value differs from the component's default
        // or if it's a hardcoded value instead of a token reference
        
        // For now, let's be more conservative and only flag obvious overrides
        // We'll need to refine this based on the actual Figma API structure
        const isOverride = checkIfPropertyIsOverridden(key, value, node)
        if (isOverride) {
          hasOverwrittenProperties = true
          overwrittenProperties.push(key)
        }
      }
    }
  }
  */

  // Apply the new rules for flagging issues
  let shouldShowIssues = false
  
  if (componentType === 'EXTERNAL_INSTANCE') {
    // External library components: only flag as issue if detached or properties overwritten
    shouldShowIssues = isDetached || hasOverwrittenProperties
    logComponent(`   📋 EXTERNAL LIBRARY: shouldShowIssues = ${shouldShowIssues} (detached: ${isDetached}, overwritten: ${hasOverwrittenProperties})`)
  } else if (componentType === 'LOCAL_COMPONENT' || componentType === 'LOCAL_INSTANCE') {
    // Local components: flag as issue if they meet design token analysis checks
    // For now, we'll assume they should show issues (token analysis will handle the rest)
    shouldShowIssues = true
    logComponent(`   📋 LOCAL COMPONENT: shouldShowIssues = true`)
  } else {
    // Regular nodes: show issues
    shouldShowIssues = true
    logComponent(`   📋 REGULAR NODE: shouldShowIssues = true`)
  }

  // Debug logging for component issue analysis
  logComponent(`Component Issue Analysis for "${node.name}" (${componentType}):`, {
    isDetached,
    hasOverwrittenProperties,
    overwrittenProperties,
    shouldShowIssues,
    nodeType: node.type,
    componentId: node.componentId,
    hasComponentProperties: !!node.componentProperties,
    componentPropertiesKeys: node.componentProperties ? Object.keys(node.componentProperties) : []
  })
  
  // More comprehensive logging to understand the node structure
  logComponent(`=== FULL NODE STRUCTURE for "${node.name}" ===`)
  logComponent('Node type:', node.type)
  logComponent('Component ID:', node.componentId)
  logComponent('Component Properties:', node.componentProperties)
  logComponent('Component Properties Type:', typeof node.componentProperties)
  logComponent('All node keys:', Object.keys(node))
  
  const result = {
    hasOverwrittenProperties,
    overwrittenProperties,
    isDetached,
    shouldShowIssues
  }
  
  // Cache the result
  componentIssueCache.set(cacheKey, result);
  return result
}

// Helper function to check if a component property has been overridden from its original token value
function checkIfPropertyIsOverridden(propertyKey: string, propertyValue: any, node: FigmaNode): boolean {
  // For now, let's be very conservative and only flag obvious cases
  // We'll need to refine this based on actual Figma API behavior
  
  // Check if the property value represents a hardcoded value instead of a token reference
  if (propertyValue && typeof propertyValue === 'object') {
    // If it has a 'value' property that looks like a hardcoded value (not a token reference)
    if ('value' in propertyValue) {
      const value = propertyValue.value
      
      // Check if this looks like a hardcoded value rather than a token reference
      // Token references typically have specific patterns or are bound to variables
      
      // For now, let's assume that if the property exists and has a value,
      // it might be an override. We'll need to refine this logic based on
      // the actual Figma API structure and how tokens are represented
      
      // This is a placeholder - we need to understand the actual structure
      // of component properties in the Figma API to properly detect overrides
      return false // Temporarily return false to avoid false positives
    }
  }
  
  return false
}

function traverseDocumentNodes(node: FigmaNode, context: TraversalContext & { styleIdToStyle?: Record<string, any> }, path = "", currentFrame?: FrameInfo): void {
  // Skip hidden nodes
  if (node.visible === false) {
    return
  }
  context.stats.totalElements++
  const currentPath = path ? `${path} > ${node.name}` : node.name

  // Check if this node is a component instance or component definition
  const isComponentInstance = node.type === 'INSTANCE' || node.componentId !== undefined
  const isComponentDefinition = node.type === 'COMPONENT'
  const newIsInsideComponent = context.isInsideComponent || isComponentInstance || isComponentDefinition
  
  // Track the current component context
  let newCurrentComponentId = context.currentComponentId
  let newCurrentComponentName = context.currentComponentName
  
  if (isComponentInstance || isComponentDefinition) {
    newCurrentComponentId = node.id
    newCurrentComponentName = node.name
    logComponent(`Component context set: "${node.name}" (type: ${node.type}, componentId: ${node.componentId})`);
  }

  // Collect component information for usage analysis
  if (isComponentInstance || isComponentDefinition) {
    const componentInfo = getComponentType(node, context)
    const componentId = node.componentId || node.id
    const componentName = node.componentName || node.name
    
    logComponent(`Component detected for collection: "${componentName}" (${componentId}) - Type: ${componentInfo.type}`)
    
    if (!context.allComponents.has(componentId)) {
      context.allComponents.set(componentId, {
        componentId,
        componentName,
        componentType: componentInfo.type,
        instances: []
      })
    }
    
    const component = context.allComponents.get(componentId)!
    
    // Add this instance to the component
    if (currentFrame) {
      const issueAnalysis = analyzeComponentIssues(node, componentInfo.type)
      
      component.instances.push({
        nodeId: node.id,
        layerName: node.name,
        frameId: currentFrame.id,
        frameName: currentFrame.name,
        framePath: currentFrame.path,
        figmaUrl: context.figmaUrl,
        hasOverwrittenProperties: issueAnalysis.hasOverwrittenProperties,
        overwrittenProperties: issueAnalysis.overwrittenProperties,
        isDetached: issueAnalysis.isDetached
      })
    }
  }

  if (isComponentInstance) {
    logComponent(`Component instance detected: "${node.name}" (type: ${node.type}, componentId: ${node.componentId})`);
  } else if (isComponentDefinition) {
    logComponent(`Component definition detected: "${node.name}" (type: ${node.type})`);
  } else if (newIsInsideComponent) {
    logComponent(`Inside component context: "${node.name}" (parent: ${newCurrentComponentName})`);
  } else if (node.type === 'RECTANGLE' || node.type === 'FRAME' || node.type === 'GROUP') {
    // Check if this might be a detached component (has component-like properties but no componentId)
    logComponent(`Regular node: "${node.name}" (type: ${node.type}, componentId: ${node.componentId || 'none'})`);
    
    // Check for any properties that might indicate this was a former component
    if (node.fills && node.fills.length > 0) {
      logComponent(`  - Has fills: ${node.fills.length} fill(s)`);
      node.fills.forEach((fill, index) => {
        logComponent(`    Fill ${index}:`, fill);
        if (fill.boundVariables) {
          logComponent(`    Fill ${index} boundVariables:`, fill.boundVariables);
        }
      });
    }
    if (node.boundVariables && Object.keys(node.boundVariables).length > 0) {
      logComponent(`  - Has bound variables:`, node.boundVariables);
    }
  }

  // Try to extract component name from the node path
  let componentName = node.componentName
  if (isComponentInstance && !componentName && currentPath.includes(' > ')) {
    const pathParts = currentPath.split(' > ')
    // Look for the component name in the path (usually the component instance name)
    // Skip generic layer names
    const genericLayerNames = /^(Layer|Frame|Group|Rectangle|Text|Button|Input|Card|Modal|Dialog|Header|Footer|Sidebar|Nav|Menu|List|Grid|Container|Wrapper|Box|Div|Span|P|H[1-6]|A|Img|Icon|Logo|Avatar|Badge|Tag|Label|Field|Form|Section|Article|Aside|Main|Outlet|Media area|Instance|Right column|Left column)$/i
    
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

  // Additional check: if we're inside a component but don't have a component name,
  // try to find the component name from the path
  if (newIsInsideComponent && !componentName && currentPath.includes(' > ')) {
    const pathParts = currentPath.split(' > ')
    // Look for component-like names in the path
    for (let i = pathParts.length - 1; i >= 0; i--) {
      const part = pathParts[i]
      // Skip generic names and look for more specific component names
      if (!/^(Layer|Frame|Group|Rectangle|Text|Button|Input|Card|Modal|Dialog|Header|Footer|Sidebar|Nav|Menu|List|Grid|Container|Wrapper|Box|Div|Span|P|H[1-6]|A|Img|Icon|Logo|Avatar|Badge|Tag|Label|Field|Form|Section|Article|Aside|Main|Outlet|Media area|Instance|Right column|Left column)$/i.test(part) &&
          !part.match(/^Component \d+:\d+$/) && 
          !part.match(/^\d+:\d+$/) &&
          part.length > 2) {
        componentName = part
        break
      }
    }
  }

  // If we're inside a component context, use the parent component name
  if (newIsInsideComponent && !componentName && newCurrentComponentName) {
    componentName = newCurrentComponentName
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
    currentComponentName: newCurrentComponentName,
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

  // Recursively process child nodes
  if (node.children) {
    node.children.forEach((child) => {
      traverseDocumentNodes(child, childContext, currentPath, currentFrame)
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

  logDebug(`\n=== Processing node: "${node.name}" (type: ${node.type}) ===`);
  logDebug(`  - Path: ${currentPath}`);
  logDebug(`  - Component ID: ${node.componentId || 'none'}`);
  logDebug(`  - Is inside component: ${context?.isInsideComponent || false}`);

  // Determine component type and whether to show issues
  const componentInfo = getComponentType(node, context)
  logDebug(`  - Component type: ${componentInfo.type}, shouldShowIssues: ${componentInfo.shouldShowIssues}`);

  // If this is an external library instance, skip adding hardcoded values
  if (!componentInfo.shouldShowIssues) {
    logDebug(`  - Skipping external library instance "${node.name}" - no issues to show`);
    return {
      hasAnyTokenizedProperties: true, // Mark as tokenized to avoid counting as hardcoded
      hardcodedPropertiesFound: 0
    }
  }

  // Extract colors from fills and strokes
  const colorTokenizationInfo = extractColorsFromNode(node, currentPath, currentFrame, hardcodedValues, styleIdToStyle, context)
  hasAnyTokenizedProperties = hasAnyTokenizedProperties || colorTokenizationInfo.hasAnyTokenizedProperties
  hardcodedPropertiesFound += colorTokenizationInfo.hardcodedPropertiesFound || 0

  // Extract spacing values (check each property individually)
  const spacingProperties = [
    { value: node.itemSpacing, name: "itemSpacing", boundVariable: node.boundVariables?.itemSpacing },
  ]
  spacingProperties.forEach(({ value, boundVariable, name }) => {
    const hasTokenizedProps = hasTokenizedProperties(node, context)
    
    if (value !== undefined && boundVariable === undefined && node.boundVariables?.[name] === undefined && !hasTokenizedProps) {
      logDebug(`Adding hardcoded spacing: ${value}px for "${node.name}"`);
      addHardcodedValue(`${value}px`, "spacing", currentPath, currentFrame, hardcodedValues, node.id, node, context)
      hardcodedPropertiesFound++
    } else if (boundVariable !== undefined || node.boundVariables?.[name] !== undefined || hasTokenizedProps) {
      logDebug(`Skipping spacing for "${node.name}" - has tokenized properties or is component instance`);
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
    const hasTokenizedProps = hasTokenizedProperties(node, context)
    
    if (value !== undefined && boundVariable === undefined && node.boundVariables?.[name] === undefined && !hasTokenizedProps) {
      logDebug(`Adding hardcoded padding: ${value}px for "${node.name}"`);
      addHardcodedValue(`${value}px`, "padding", currentPath, currentFrame, hardcodedValues, node.id, node, context)
      hardcodedPropertiesFound++
    } else if (boundVariable !== undefined || node.boundVariables?.[name] !== undefined || hasTokenizedProps) {
      logDebug(`Skipping padding for "${node.name}" - has tokenized properties or is component instance`);
      hasAnyTokenizedProperties = true
    }
  })

  // Extract border radius (check for bound variables individually)
  if (node.cornerRadius !== undefined) {
    const hasCornerRadiusVariable = node.boundVariables?.cornerRadius !== undefined
    const hasTokenizedProps = hasTokenizedProperties(node, context)
    
    logDebug(`Border radius check for "${node.name}": cornerRadius=${node.cornerRadius}, hasVariable=${hasCornerRadiusVariable}`);
    logDebug(`  - boundVariables:`, node.boundVariables);
    logDebug(`  - node.boundVariables?.cornerRadius:`, node.boundVariables?.cornerRadius);
    
    if (!hasCornerRadiusVariable && !hasTokenizedProps) {
      logDebug(`Adding hardcoded border radius: ${node.cornerRadius}px for "${node.name}"`);
      addHardcodedValue(`${node.cornerRadius}px`, "border-radius", currentPath, currentFrame, hardcodedValues, node.id, node, context)
      hardcodedPropertiesFound++
    } else {
      logDebug(`Skipping border radius for "${node.name}" - has tokenized properties or is component instance`);
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

  logDebug(`=== Finished processing "${node.name}" - hasAnyTokenizedProperties: ${hasAnyTokenizedProperties}, hardcodedPropertiesFound: ${hardcodedPropertiesFound} ===\n`);

  return {
    hasAnyTokenizedProperties,
    hardcodedPropertiesFound,
  }
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

  logDebug(`Color extraction for "${node.name}":`);
  logDebug(`  - Node type: ${node.type}`);
  logDebug(`  - Component ID: ${node.componentId || 'none'}`);
  logDebug(`  - Is inside component: ${context?.isInsideComponent || false}`);
  logDebug(`  - fills:`, node.fills);
  logDebug(`  - strokes:`, node.strokes);
  logDebug(`  - boundVariables:`, node.boundVariables);

  // Special debugging for detached components
  if (node.type === 'RECTANGLE' || node.type === 'FRAME' || node.type === 'GROUP') {
    logDebug(`  - Potential detached component detected`);
    logDebug(`  - Has component-like properties but no componentId`);
  }

  // If node has any style applied, skip color extraction (styles override local colors)
  if (hasNodeOrParentStyles(node, styleIdToStyle, context)) {
    logDebug(`Skipping color extraction for "${node.name}" - has styles applied`);
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
    logDebug(`  - isColorBound check for "${node.name}":`);
    logDebug(`    fillBound=${fillBound}, nodeColorBound=${nodeColorBound}, nodeFillBound=${nodeFillBound}`);
    logDebug(`    fill.boundVariables:`, fillOrStroke.boundVariables);
    logDebug(`    node.boundVariables:`, node.boundVariables);
    logDebug(`    result=${result}`);
    return result;
  }

  // Process fills - distinguish from strokes
  if (node.fills && node.fills.length > 0) {
    logDebug(`  - Processing ${node.fills.length} fills`);
    node.fills.forEach((fill, index) => {
      logDebug(`  - Fill ${index}:`, fill);
      if (fill.type === "SOLID" && fill.color && (fill.visible !== false)) {
        logDebug(`  - Processing solid fill ${index} with color:`, fill.color);
        if (!isColorBound(fill)) {
          const color = rgbToHex(fill.color)
          logDebug(`  - Adding hardcoded fill: ${color} for "${node.name}"`);
          addHardcodedValue(color, "fill", currentPath, currentFrame, hardcodedValues, node.id, node, context)
          hardcodedPropertiesFound++
        } else {
          logDebug(`  - Skipping fill ${index} for "${node.name}" - has tokenized properties`);
          hasAnyTokenizedProperties = true
        }
      } else {
        logDebug(`  - Skipping fill ${index} - not a visible solid fill`);
      }
    })
  } else {
    logDebug(`  - No fills to process`);
  }

  // Process strokes - distinguish from fills
  if (node.strokes && node.strokes.length > 0 && (node as any).strokeWeight > 0) {
    logDebug(`  - Processing ${node.strokes.length} strokes`);
    node.strokes.forEach((stroke, index) => {
      logDebug(`  - Stroke ${index}:`, stroke);
      if (stroke.type === "SOLID" && stroke.color && (stroke.visible !== false)) {
        logDebug(`  - Processing solid stroke ${index} with color:`, stroke.color);
        if (!isColorBound(stroke)) {
          const color = rgbToHex(stroke.color)
          logDebug(`  - Adding hardcoded stroke: ${color} for "${node.name}"`);
          addHardcodedValue(color, "stroke", currentPath, currentFrame, hardcodedValues, node.id, node, context)
          hardcodedPropertiesFound++
        } else {
          logDebug(`  - Skipping stroke ${index} for "${node.name}" - has tokenized properties`);
          hasAnyTokenizedProperties = true
        }
      } else {
        logDebug(`  - Skipping stroke ${index} - not a visible solid stroke`);
      }
    })
  } else {
    logDebug(`  - No strokes to process`);
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

  // Determine component type and whether to show issues
  const componentInfo = node ? getComponentType(node, context) : {
    type: 'REGULAR_NODE' as const,
    shouldShowIssues: true,
    isComponentInstance: false
  }

  // Determine if this is a component instance based on context or node properties
  const isComponentInstance = componentInfo.isComponentInstance

  // Use the component name from context if available, otherwise from node
  const componentName = context?.currentComponentName || node?.componentName

  const locationData = {
    path: location,
    nodeId: nodeId,
    componentId: context?.currentComponentId || node?.componentId, // Store componentId separately
    frameId: currentFrame?.id,
    frameName: currentFrame?.name,
    framePath: currentFrame?.path,
    // Component-related information
    isComponentInstance: isComponentInstance,
    componentName: componentName,
    componentType: componentInfo.type,
    shouldShowIssues: componentInfo.shouldShowIssues,
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
    componentTypes: occurrence.locations.map((loc) => loc.componentType),
    shouldShowIssues: occurrence.locations.map((loc) => loc.shouldShowIssues),
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

      // Filter locations to only include those that belong to this frame AND should show issues
      const frameLocations = occurrence.locations.filter(loc => 
        loc.frameId === frameId && (loc.shouldShowIssues !== false) // Default to true if not specified
      )
      
      // If no locations should show issues, skip this value entirely
      if (frameLocations.length === 0) {
        return null
      }
      
      return {
        type: occurrence.type,
        value: occurrence.value,
        count: frameLocations.length, // Count only frame-specific occurrences that should show issues
        locations: frameLocations.map((loc) => loc.path),
        nodeIds: frameLocations.map((loc) => loc.nodeId).filter((id): id is string => id !== undefined),
        layerNames: frameLocations.map((loc) => {
          // If we're inside a component context, show the component name instead of just the layer name
          if (loc.componentName && loc.isComponentInstance) {
            return loc.componentName
          }
          // Otherwise, extract the layer name from the path
          return loc.path.split(' > ').pop() || 'Unknown Layer'
        }),
        // Component information
        isComponentInstances: frameLocations.map((loc) => loc.isComponentInstance || false),
        componentIds: frameLocations.map((loc) => loc.componentId),
        componentNames: frameLocations.map((loc) => loc.componentName),
        componentTypes: frameLocations.map((loc) => loc.componentType || 'REGULAR_NODE'),
        shouldShowIssues: frameLocations.map((loc) => loc.shouldShowIssues !== false), // Default to true
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
    }).filter((item): item is NonNullable<typeof item> => item !== null) // Remove null entries with proper typing

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

// Enhanced detached component detection
export interface DetachedComponentInfo {
  nodeId: string
  nodeName: string
  nodeType: string
  frameId?: string
  frameName?: string
  framePath?: string
  figmaUrl?: string
  confidence: 'high' | 'medium' | 'low'
  detectionMethod: 'api' | 'heuristic'
  reason: string
  componentName?: string
  hasComponentProperties?: boolean
  hasBoundVariables?: boolean
  hasComponentStyles?: boolean
}

/**
 * Detect detached components from a Figma file using the API and heuristics
 * @param document - The Figma document node
 * @param figmaUrl - The Figma file URL
 * @param knownComponentNames - Optional set of known component names for heuristic detection
 * @returns Array of suspected detached components
 */
export function detectDetachedComponents(
  document: FigmaNode,
  figmaUrl: string,
  knownComponentNames?: Set<string>
): DetachedComponentInfo[] {
  const detachedComponents: DetachedComponentInfo[] = []
  const componentDefinitions = new Map<string, string>() // componentId -> componentName
  const componentInstances = new Map<string, string>() // nodeId -> componentId
  
  // First pass: collect all component definitions and instances
  function collectComponentInfo(node: FigmaNode, path = ""): void {
    if (node.visible === false) return
    
    const currentPath = path ? `${path} > ${node.name}` : node.name
    
    // Collect component definitions
    if (node.type === 'COMPONENT') {
      componentDefinitions.set(node.id, node.name)
      logComponent(`Component definition found: "${node.name}" (${node.id})`)
    }
    
    // Collect component instances
    if (node.type === 'INSTANCE' && node.componentId) {
      componentInstances.set(node.id, node.componentId)
      logComponent(`Component instance found: "${node.name}" (${node.id}) -> componentId: ${node.componentId}`)
    }
    
    // Recursively process children
    if (node.children) {
      node.children.forEach(child => collectComponentInfo(child, currentPath))
    }
  }
  
  collectComponentInfo(document)
  
  // Second pass: detect detached components
  function detectDetachedInNode(node: FigmaNode, path = "", currentFrame?: FrameInfo): void {
    if (node.visible === false) return
    
    const currentPath = path ? `${path} > ${node.name}` : node.name
    
    // Method 1: API-based detection - Check for INSTANCE nodes without componentId
    if (node.type === 'INSTANCE') {
      if (!node.componentId) {
        detachedComponents.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          frameId: currentFrame?.id,
          frameName: currentFrame?.name,
          framePath: currentFrame?.path,
          figmaUrl: figmaUrl,
          confidence: 'high',
          detectionMethod: 'api',
          reason: 'INSTANCE node without componentId',
          componentName: node.componentName,
          hasComponentProperties: !!node.componentProperties,
          hasBoundVariables: !!(node.boundVariables && Object.keys(node.boundVariables).length > 0),
          hasComponentStyles: !!(node.styles && Object.keys(node.styles).length > 0)
        })
        logComponent(`🔍 HIGH CONFIDENCE DETACHED: "${node.name}" - INSTANCE without componentId`)
      } else {
        // Check if the componentId references a non-existent component
        if (!componentDefinitions.has(node.componentId) && !componentInstances.has(node.id)) {
          detachedComponents.push({
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            frameId: currentFrame?.id,
            frameName: currentFrame?.name,
            framePath: currentFrame?.path,
            figmaUrl: figmaUrl,
            confidence: 'high',
            detectionMethod: 'api',
            reason: `INSTANCE with invalid componentId: ${node.componentId}`,
            componentName: node.componentName,
            hasComponentProperties: !!node.componentProperties,
            hasBoundVariables: !!(node.boundVariables && Object.keys(node.boundVariables).length > 0),
            hasComponentStyles: !!(node.styles && Object.keys(node.styles).length > 0)
          })
          logComponent(`🔍 HIGH CONFIDENCE DETACHED: "${node.name}" - INSTANCE with invalid componentId: ${node.componentId}`)
        }
      }
    }
    
    // Method 2: Heuristic detection - Check for FRAME/GROUP nodes that look like detached components
    if ((node.type === 'FRAME' || node.type === 'GROUP') && !node.componentId) {
      const heuristicScore = calculateDetachedHeuristicScore(node, knownComponentNames)
      
      if (heuristicScore >= 0.7) {
        detachedComponents.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          frameId: currentFrame?.id,
          frameName: currentFrame?.name,
          framePath: currentFrame?.path,
          figmaUrl: figmaUrl,
          confidence: heuristicScore >= 0.9 ? 'high' : heuristicScore >= 0.8 ? 'medium' : 'low',
          detectionMethod: 'heuristic',
          reason: `FRAME/GROUP with component-like properties (score: ${heuristicScore.toFixed(2)})`,
          componentName: node.componentName,
          hasComponentProperties: !!node.componentProperties,
          hasBoundVariables: !!(node.boundVariables && Object.keys(node.boundVariables).length > 0),
          hasComponentStyles: !!(node.styles && Object.keys(node.styles).length > 0)
        })
        logComponent(`🔍 HEURISTIC DETACHED: "${node.name}" - Score: ${heuristicScore.toFixed(2)}`)
      }
    }
    
    // Recursively process children
    if (node.children) {
      node.children.forEach(child => detectDetachedInNode(child, currentPath, currentFrame))
    }
  }
  
  detectDetachedInNode(document)
  
  logComponent(`Detached component detection complete. Found ${detachedComponents.length} suspected detached components.`)
  return detachedComponents
}

/**
 * Calculate a heuristic score for whether a node might be a detached component
 * @param node - The node to analyze
 * @param knownComponentNames - Optional set of known component names
 * @returns Score between 0 and 1, where 1 is most likely to be detached
 */
function calculateDetachedHeuristicScore(node: FigmaNode, knownComponentNames?: Set<string>): number {
  let score = 0
  let totalChecks = 0
  
  // Check 1: Name matches known component patterns
  if (knownComponentNames && knownComponentNames.has(node.name)) {
    score += 0.4
    logComponent(`  Heuristic: Name matches known component "${node.name}" (+0.4)`)
  }
  totalChecks++
  
  // Check 2: Name contains component-like keywords
  const componentKeywords = /^(button|input|card|modal|dialog|header|footer|sidebar|nav|menu|list|grid|container|wrapper|box|avatar|badge|tag|label|field|form|section|article|aside|main|outlet|media|instance|component)/i
  if (componentKeywords.test(node.name)) {
    score += 0.2
    logComponent(`  Heuristic: Name contains component keywords "${node.name}" (+0.2)`)
  }
  totalChecks++
  
  // Check 3: Has component properties
  if (node.componentProperties && Object.keys(node.componentProperties).length > 0) {
    score += 0.3
    logComponent(`  Heuristic: Has component properties (+0.3)`)
  }
  totalChecks++
  
  // Check 4: Has bound variables (indicates it was connected to design tokens)
  if (node.boundVariables && Object.keys(node.boundVariables).length > 0) {
    score += 0.25
    logComponent(`  Heuristic: Has bound variables (+0.25)`)
  }
  totalChecks++
  
  // Check 5: Has component styles
  if (node.styles && Object.keys(node.styles).length > 0) {
    score += 0.15
    logComponent(`  Heuristic: Has component styles (+0.15)`)
  }
  totalChecks++
  
  // Check 6: Has fills with bound variables
  if (node.fills && node.fills.some(fill => fill.boundVariables && Object.keys(fill.boundVariables).length > 0)) {
    score += 0.2
    logComponent(`  Heuristic: Has fills with bound variables (+0.2)`)
  }
  totalChecks++
  
  // Check 7: Has strokes with bound variables
  if (node.strokes && node.strokes.some(stroke => stroke.boundVariables && Object.keys(stroke.boundVariables).length > 0)) {
    score += 0.2
    logComponent(`  Heuristic: Has strokes with bound variables (+0.2)`)
  }
  totalChecks++
  
  // Check 8: Complex structure (multiple children with consistent styling)
  if (node.children && node.children.length > 2) {
    const hasConsistentStyling = node.children.some(child => 
      child.boundVariables && Object.keys(child.boundVariables).length > 0
    )
    if (hasConsistentStyling) {
      score += 0.1
      logComponent(`  Heuristic: Complex structure with consistent styling (+0.1)`)
    }
  }
  totalChecks++
  
  // Check 9: Name follows component naming conventions
  const componentNamingPatterns = [
    /^[A-Z][a-zA-Z0-9]*$/, // PascalCase
    /^[a-z][a-zA-Z0-9]*$/, // camelCase
    /^[A-Z][a-zA-Z0-9]*\s*[A-Z][a-zA-Z0-9]*$/, // PascalCase with spaces
  ]
  
  const matchesNamingPattern = componentNamingPatterns.some(pattern => pattern.test(node.name))
  if (matchesNamingPattern && !/^(Layer|Frame|Group|Rectangle|Text)$/i.test(node.name)) {
    score += 0.1
    logComponent(`  Heuristic: Follows component naming conventions "${node.name}" (+0.1)`)
  }
  totalChecks++
  
  // Normalize score to 0-1 range
  const normalizedScore = Math.min(score, 1.0)
  
  logComponent(`  Final heuristic score for "${node.name}": ${normalizedScore.toFixed(2)}`)
  return normalizedScore
}