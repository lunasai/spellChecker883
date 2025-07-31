import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ExternalLink, Frame, ArrowRight, MapPin, AlertCircle, CheckCircle2, ChevronDown } from "lucide-react"
import {
  getTypeIcon,
  getPropertyDisplayName,
  UnmatchedBadge,
} from "./ui-helpers"
import { generateFigmaNodeUrl, generateFigmaComponentUrl } from "@/lib/figma-utils"
import type { FrameAnalysis, TokenMatch, UnmatchedValue } from "@/lib/types"
import { useState, useEffect, useRef } from "react"
import { getStatusColor, getConfidenceColor, VISUALIZATION_COLORS } from "@/lib/color-constants"

interface AllMatchesViewProps {
  frameAnalyses: FrameAnalysis[]
  tokenMatches: TokenMatch[]
  unmatchedValues: UnmatchedValue[]
}

export function AllMatchesView({ frameAnalyses, tokenMatches, unmatchedValues }: AllMatchesViewProps) {
  if (!frameAnalyses || frameAnalyses.length === 0) {
    return <EmptyMatchesMessage />
  }

  // Collect all raw values from all frames and group by type
  const allRawValues = frameAnalyses.flatMap(frame => 
    frame.rawValues.map(value => ({
      ...value,
      frameId: frame.frameId,
      frameName: frame.frameName,
      framePath: frame.framePath,
      figmaUrl: frame.figmaUrl
    }))
  )

  // Group by type
  const groupedByType = allRawValues.reduce((acc, value) => {
    if (!acc[value.type]) {
      acc[value.type] = []
    }
    acc[value.type].push(value)
    return acc
  }, {} as Record<string, typeof allRawValues>)

  const valueTypes = ["fill", "stroke", "spacing", "padding", "typography", "border-radius"]

  return (
    <div className="space-y-6">
      {valueTypes.map((type) => {
        const typeValues = groupedByType[type] || []
        
        if (typeValues.length === 0) return null

        return <TypeGroupCard key={type} type={type} typeValues={typeValues} />
      })}
    </div>
  )
}

function EmptyMatchesMessage() {
  return (
    <div className="text-center py-12">
      <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <AlertCircle className="w-12 h-12 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">No matches found</h3>
      <p className="text-gray-600">Run an analysis to see matches grouped by issue type.</p>
    </div>
  )
}

interface TypeGroupCardProps {
  type: string
  typeValues: Array<{
    type: "fill" | "stroke" | "spacing" | "padding" | "typography" | "border-radius"
    value: string
    count: number
    locations: string[]
    nodeIds?: string[]
    layerNames?: string[]
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
    frameId: string
    frameName: string
    framePath: string
    figmaUrl: string
  }>
}

function TypeGroupCard({ type, typeValues }: TypeGroupCardProps) {
  const totalTypeIssues = typeValues.reduce((sum, valueData) => sum + valueData.count, 0)
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Calculate statistics for this type
  const totalMatched = typeValues.reduce((sum, valueData) => {
    return sum + (valueData.recommendations && valueData.recommendations.length > 0 ? valueData.count : 0)
  }, 0)
  
  const totalUnmatched = typeValues.reduce((sum, valueData) => {
    return sum + (valueData.recommendations && valueData.recommendations.length > 0 ? 0 : valueData.count)
  }, 0)

  const totalAnalyzed = totalMatched + totalUnmatched
  
  // Calculate percentages
  const matchedPercentage = totalAnalyzed > 0 ? Math.round((totalMatched / totalAnalyzed) * 100) : 0
  const unmatchedPercentage = totalAnalyzed > 0 ? Math.round((totalUnmatched / totalAnalyzed) * 100) : 0

  // Determine overall status
  const hasUnmatched = totalUnmatched > 0
  const hasMatches = totalMatched > 0
  
  // Get status colors
  const statusColors = !hasUnmatched 
    ? getStatusColor('tokenized')
    : hasMatches 
    ? getStatusColor('matched')
    : getStatusColor('needs_attention')

  return (
    <Card className="overflow-hidden border border-gray-200/60 shadow-lg bg-white/80 backdrop-blur-sm">
      <CardHeader 
        className="bg-gradient-to-r from-gray-50/80 to-gray-100/60 border-b border-gray-200/60 cursor-pointer hover:bg-gray-100/80 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div 
                className="p-2 rounded-lg"
                style={{ 
                  backgroundColor: statusColors.light,
                  color: statusColors.dark
                }}
              >
                {!hasUnmatched ? <CheckCircle2 className="w-5 h-5" /> : hasMatches ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-gray-900 capitalize">
                  {getPropertyDisplayName(type)} • {totalTypeIssues} Issues
                </CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                  Across {typeValues.length} unique values
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-700 mb-1">
                {matchedPercentage}% matched • {totalMatched} matches
              </div>
              <div className="flex items-center gap-2">
                <div className="relative w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                  {/* Matched (green) */}
                  <div 
                    className="absolute left-0 top-0 h-full rounded-l-full"
                    style={{ 
                      width: `${matchedPercentage}%`,
                      backgroundColor: VISUALIZATION_COLORS.STATUS.MATCHED.primary
                    }}
                  />
                  {/* Unmatched (amber) */}
                  <div 
                    className="absolute top-0 h-full rounded-r-full"
                    style={{ 
                      left: `${matchedPercentage}%`, 
                      width: `${unmatchedPercentage}%`,
                      backgroundColor: VISUALIZATION_COLORS.STATUS.NEEDS_ATTENTION.primary
                    }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-600">• {matchedPercentage}%</span>
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
          </div>
        </div>
      </CardHeader>
      
      {!isCollapsed && (
        <CardContent className="p-0">
          <div className="divide-y divide-gray-100">
            {typeValues.map((valueData, index) => (
              <ValueMatchCard key={index} valueData={valueData} type={type} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function ValueMatchCard({ valueData, type }: { valueData: any; type: string }) {
  const hasRecommendations = valueData.recommendations && valueData.recommendations.length > 0
  const primaryRecommendation = hasRecommendations ? valueData.recommendations[0] : null
  const alternatives = hasRecommendations ? valueData.recommendations.slice(1, 3) : []

  return (
    <div className="bg-gray-50/80 rounded-lg p-4 border border-gray-200/60 shadow-sm">
      <ValueToMatchRelationship
        value={valueData.value}
        type={type}
        hasRecommendations={hasRecommendations}
        primaryRecommendation={primaryRecommendation}
        count={valueData.count}
        nodeIds={valueData.nodeIds}
        figmaUrl={valueData.figmaUrl}
        alternatives={alternatives}
        layerNames={valueData.layerNames}
        isComponentInstances={valueData.isComponentInstances}
        componentIds={valueData.componentIds}
        componentNames={valueData.componentNames}
        componentTypes={valueData.componentTypes}
        shouldShowIssues={valueData.shouldShowIssues}
        frameName={valueData.frameName}
        framePath={valueData.framePath}
      />
    </div>
  )
}

function ValueToMatchRelationship({
  value,
  type,
  hasRecommendations,
  primaryRecommendation,
  count,
  nodeIds,
  figmaUrl,
  alternatives,
  layerNames,
  isComponentInstances,
  componentIds,
  componentNames,
  componentTypes,
  shouldShowIssues,
  frameName,
  framePath,
}: {
  value: string
  type: string
  hasRecommendations: boolean
  primaryRecommendation?: any
  count: number
  nodeIds?: string[]
  figmaUrl: string
  alternatives?: any[]
  layerNames?: string[]
  isComponentInstances?: boolean[]
  componentIds?: (string | undefined)[]
  componentNames?: (string | undefined)[]
  componentTypes?: ('EXTERNAL_INSTANCE' | 'LOCAL_COMPONENT' | 'LOCAL_INSTANCE' | 'REGULAR_NODE')[]
  shouldShowIssues?: boolean[]
  frameName: string
  framePath: string
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <FigmaValueDisplay value={value} type={type} />
          <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <TokenInfoDisplay 
            hasRecommendations={hasRecommendations} 
            primaryRecommendation={primaryRecommendation} 
          />
        </div>
        <TokenBadgesDisplay 
          hasRecommendations={hasRecommendations}
          primaryRecommendation={primaryRecommendation} 
          alternatives={alternatives} 
        />
      </div>
      
      {/* Frame information */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Frame className="w-4 h-4" />
        <span className="font-medium">{frameName}</span>
        <span className="text-gray-400">•</span>
        <span>{framePath}</span>
      </div>
      
      <OccurrencesList 
        nodeIds={nodeIds} 
        layerNames={layerNames} 
        figmaUrl={figmaUrl}
        isComponentInstances={isComponentInstances}
        componentIds={componentIds}
        componentNames={componentNames}
        componentTypes={componentTypes}
        shouldShowIssues={shouldShowIssues}
      />
    </div>
  )
}

// Exact copy of components from FrameAnalysisView
function FigmaValueDisplay({ value, type }: { value: string; type: string }) {
  return (
    <div className="flex-shrink-0 min-w-0">
      <div className="flex items-center gap-2">
        {type === "fill" || type === "stroke" ? (
          <div className="flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded border border-gray-300" 
              style={{ backgroundColor: value }}
            />
            <span className="font-mono text-sm text-gray-900">{value}</span>
          </div>
        ) : (
          <span className="font-mono text-sm text-gray-900">{value}</span>
        )}
      </div>
    </div>
  )
}

function TokenInfoDisplay({
  hasRecommendations,
  primaryRecommendation,
}: {
  hasRecommendations: boolean
  primaryRecommendation?: any
}) {
  if (!hasRecommendations) {
    return <UnmatchedTokenDisplay count={0} />
  }

  return <TokenInfo recommendation={primaryRecommendation} />
}

function TokenBadgesDisplay({
  hasRecommendations,
  primaryRecommendation,
  alternatives,
}: {
  hasRecommendations: boolean
  primaryRecommendation?: any
  alternatives?: any[]
}) {
  if (!hasRecommendations) {
    return null
  }

  return <TokenBadges recommendation={primaryRecommendation} count={0} alternatives={alternatives} />
}

function TokenInfo({ recommendation }: { recommendation: any }) {
  return (
    <div className="min-w-0 flex-1">
      <div
        className="font-semibold text-gray-900 truncate cursor-help"
        title={recommendation.fullTokenPath ? `Full path: ${recommendation.fullTokenPath}` : undefined}
      >
        {recommendation.tokenName}
      </div>
      {recommendation.isSemanticToken && recommendation.originalReference ? (
        <div className="text-xs text-blue-600 mt-1">Reference: {recommendation.originalReference} • {recommendation.tokenValue}</div>
      ) : (
        <div className="text-xs text-blue-600 mt-1">{recommendation.tokenValue}</div>
      )}
    </div>
  )
}

function TokenBadges({ recommendation, count, alternatives }: { recommendation: any; count: number; alternatives?: any[] }) {
  const matchPercentage = Math.round(recommendation.confidence * 100)
  const [showAlternatives, setShowAlternatives] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  // Handle clicking outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAlternatives(false)
      }
    }
    
    if (showAlternatives) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showAlternatives])
  
  return (
    <div className="flex items-center gap-2">
      <Badge 
        variant="outline" 
        className="text-xs"
        style={{
          backgroundColor: getConfidenceColor(recommendation.confidence).light,
          color: getConfidenceColor(recommendation.confidence).text,
          borderColor: getConfidenceColor(recommendation.confidence).border
        }}
      >
        {matchPercentage}% match
      </Badge>
      {alternatives && alternatives.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <Badge 
            variant="outline" 
            className="text-xs cursor-pointer hover:bg-gray-50 flex items-center gap-1"
            onClick={() => setShowAlternatives(!showAlternatives)}
          >
            {alternatives.length} alternative{alternatives.length !== 1 ? 's' : ''}
            <ChevronDown className={`w-3 h-3 transition-transform ${showAlternatives ? 'rotate-180' : ''}`} />
          </Badge>
          {showAlternatives && (
            <div className="absolute top-full left-0 mt-1 bg-white/95 backdrop-blur-sm border border-gray-200/60 rounded-lg shadow-lg z-10 min-w-64 p-2 max-h-48 overflow-y-auto">
              <div className="text-xs font-medium text-gray-700 mb-2">Alternative Tokens:</div>
              <div className="space-y-1">
                {alternatives.map((alternative, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50/80 rounded text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate" title={alternative.fullTokenPath}>
                        {alternative.tokenName}
                      </div>
                      {alternative.isSemanticToken && alternative.originalReference ? (
                        <div className="text-blue-600 text-xs">
                          {alternative.originalReference} • {alternative.tokenValue}
                        </div>
                      ) : (
                        <div className="text-blue-600 text-xs">
                          {alternative.tokenValue}
                        </div>
                      )}
                    </div>
                    <Badge 
                      variant="outline" 
                      className="text-xs ml-2"
                      style={{
                        backgroundColor: getConfidenceColor(alternative.confidence).light,
                        color: getConfidenceColor(alternative.confidence).text,
                        borderColor: getConfidenceColor(alternative.confidence).border
                      }}
                    >
                      {Math.round(alternative.confidence * 100)}%
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function UnmatchedTokenDisplay({ count }: { count: number }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <UnmatchedBadge />
        <Badge 
          variant="outline" 
          className="text-xs"
          style={{
            backgroundColor: VISUALIZATION_COLORS.NEUTRAL.background,
            color: VISUALIZATION_COLORS.NEUTRAL.textLight,
            borderColor: VISUALIZATION_COLORS.NEUTRAL.border
          }}
        >
          {count} occurrence{count !== 1 ? 's' : ''}
        </Badge>
      </div>
      <p className="text-sm text-gray-600 mt-1">No matching token found</p>
    </div>
  )
}

function OccurrencesList({ 
  nodeIds, 
  layerNames, 
  figmaUrl, 
  isComponentInstances, 
  componentIds,
  componentNames,
  componentTypes,
  shouldShowIssues
}: { 
  nodeIds?: string[]
  layerNames?: string[]
  figmaUrl: string
  isComponentInstances?: boolean[]
  componentIds?: (string | undefined)[]
  componentNames?: (string | undefined)[]
  componentTypes?: ('EXTERNAL_INSTANCE' | 'LOCAL_COMPONENT' | 'LOCAL_INSTANCE' | 'REGULAR_NODE')[]
  shouldShowIssues?: boolean[]
}) {
  if (!nodeIds || nodeIds.length === 0) return null

  return (
    <div className="mt-4 pt-4 border-t border-gray-200/60">
      <h5 className="text-xs font-medium text-gray-700 mb-3">Occurrences:</h5>
      <div className="flex flex-wrap gap-2">
        {nodeIds.map((nodeId, index) => {
          const layerName = layerNames && layerNames[index] ? layerNames[index] : `Layer ${index + 1}`
          const isComponentInstance = isComponentInstances && isComponentInstances[index]
          const componentId = componentIds && componentIds[index]
          const componentName = componentNames && componentNames[index]
          const componentType = componentTypes && componentTypes[index]
          const shouldShowIssue = shouldShowIssues && shouldShowIssues[index]
          
          // Skip external library instances that shouldn't show issues
          if (componentType === 'EXTERNAL_INSTANCE' && shouldShowIssue === false) {
            return null
          }
          
          // Improved display text logic
          let displayText = layerName
          
          if (isComponentInstance && componentName) {
            displayText = `${componentName} (${layerName})`
          }
          
          // Truncate display text if it's too long
          if (displayText.length > 50) {
            displayText = displayText.substring(0, 47) + '...'
          }
          
          const nodeUrl = componentId 
            ? generateFigmaComponentUrl(figmaUrl, componentId)
            : generateFigmaNodeUrl(figmaUrl, nodeId)

          return (
            <Button
              key={`${nodeId}-${index}`}
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => window.open(nodeUrl, '_blank')}
            >
              <MapPin className="w-3 h-3 mr-1" />
              {displayText}
              <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          )
        })}
      </div>
    </div>
  )
} 