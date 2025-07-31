// Core type definitions
export interface TokenValue {
  $value?: string | number
  $type?: string
  value?: string | number
  type?: string
}

export interface DesignToken {
  [key: string]: TokenValue | DesignToken
}

export interface Theme {
  id: string
  name: string
  selectedTokenSets: Record<string, string>
}

export interface ResolvedToken {
  value: string
  isReference: boolean
  originalReference?: string
  referenceChain?: string[]
  tokenType?: string
}

export interface FigmaColor {
  r: number
  g: number
  b: number
  a: number
}

export interface FigmaFill {
  type: string
  color?: FigmaColor
  boundVariables?: BoundVariables
  visible?: boolean // Add visible property for fills/strokes
}

export interface FigmaStyle {
  fontSize?: number
  fontFamily?: string
  fontWeight?: number
  lineHeightPx?: number
}

export interface FigmaNode {
  id: string
  name: string
  type: string
  fills?: FigmaFill[]
  strokes?: FigmaFill[]
  cornerRadius?: number
  itemSpacing?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  style?: FigmaStyle
  children?: FigmaNode[]
  boundVariables?: BoundVariables
  visible?: boolean // Add visible property for nodes
  styles?: {
    text?: string
    fill?: string
    effect?: string
    stroke?: string
    [key: string]: string | undefined
  }
  // Component-related properties
  componentId?: string // ID of the component this instance is based on
  componentName?: string // Name of the component this instance is based on
  componentProperties?: Record<string, any> // Component instance properties
  isComponentInstance?: boolean // Flag to identify component instances
}

export interface ValueLocation {
  path: string
  nodeId?: string
  componentId?: string // Separate from nodeId for component instances
  frameId?: string
  frameName?: string
  framePath?: string
  // Component-related information
  isComponentInstance?: boolean
  componentName?: string
  componentType?: 'EXTERNAL_INSTANCE' | 'LOCAL_COMPONENT' | 'LOCAL_INSTANCE' | 'REGULAR_NODE'
  shouldShowIssues?: boolean
}

export interface HardcodedValue {
  type: "fill" | "stroke" | "spacing" | "padding" | "typography" | "border-radius"
  value: string
  locations: ValueLocation[]
}

export interface TokenMatch {
  figmaValue: string
  tokenName: string
  tokenValue: string
  confidence: number
  suggestions: string[]
  isSemanticToken: boolean
  referenceChain?: string[]
  originalReference?: string
  tokenType?: string
  nodeIds?: string[]
  fullTokenPath?: string
}

export interface UnmatchedValue {
  value: string
  type: string
  count: number
}

export interface FrameInfo {
  id: string
  name: string
  path: string
}

export interface AnalysisResult {
  figmaAnalysis: {
    hardcodedValues: Array<{
      type: "fill" | "stroke" | "spacing" | "padding" | "typography" | "border-radius"
      value: string
      count: number
      locations: string[]
      nodeIds?: string[]
    }>
    totalElements: number
    tokenizedProperties?: number
    frameAnalyses?: FrameAnalysis[]
    allComponents?: Array<{
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
    rootNodeType?: string // Add the root node type for display
  }
  tokenMatches: TokenMatch[]
  unmatchedValues: UnmatchedValue[]
  selectedTheme?: Theme
  availableThemes?: Theme[]
  debugInfo?: {
    totalResolvedTokens: number
    semanticTokensCount: number
    rawTokensCount: number
  }
}

export interface FrameAnalysis {
  frameId: string
  frameName: string
  framePath: string
  figmaUrl: string
  rawValues: Array<{
    type: "fill" | "stroke" | "spacing" | "padding" | "typography" | "border-radius"
    value: string
    count: number
    locations: string[]
    nodeIds?: string[]
    layerNames?: string[]
    // Component information
    isComponentInstances?: boolean[]
    componentIds?: (string | undefined)[]
    componentNames?: (string | undefined)[]
    componentTypes?: ('EXTERNAL_INSTANCE' | 'LOCAL_COMPONENT' | 'LOCAL_INSTANCE' | 'REGULAR_NODE')[]
    shouldShowIssues?: boolean[]
    recommendations: Array<{
      tokenName: string
      tokenValue: string
      confidence: number
      isSemanticToken: boolean
      originalReference?: string
      tokenType?: string
      fullTokenPath?: string
    }>
  }>
  totalElements: number
  tokenizedProperties?: number
  tokenizationRate: number
  totalIssues?: number
}

export interface BoundVariable {
  type: string
  id: string
}

export interface BoundVariables {
  color?: BoundVariable
  fontSize?: BoundVariable
  fontFamily?: BoundVariable
  fontWeight?: BoundVariable
  lineHeight?: BoundVariable
  cornerRadius?: BoundVariable
  itemSpacing?: BoundVariable
  paddingLeft?: BoundVariable
  paddingRight?: BoundVariable
  paddingTop?: BoundVariable
  paddingBottom?: BoundVariable
  [key: string]: BoundVariable | undefined // Allow dynamic property access
}

// Enhanced detached component detection types
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
