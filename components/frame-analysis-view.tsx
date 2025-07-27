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
import { generateFigmaNodeUrl } from "@/lib/figma-utils"
import type { FrameAnalysis, TokenMatch, UnmatchedValue } from "@/lib/types"
import { useState, useEffect, useRef } from "react"

interface FrameAnalysisViewProps {
  frameAnalyses: FrameAnalysis[]
  tokenMatches: TokenMatch[]
  unmatchedValues: UnmatchedValue[]
}

export function FrameAnalysisView({ frameAnalyses, tokenMatches, unmatchedValues }: FrameAnalysisViewProps) {
  if (frameAnalyses.length === 0) {
    return <EmptyFramesMessage />
  }

  return (
    <div className="space-y-6">
      {frameAnalyses.map((frame) => (
        <FrameCard key={frame.frameId} frame={frame} />
      ))}
    </div>
  )
}

function EmptyFramesMessage() {
  return (
    <Card className="border-dashed border-2 border-gray-200/60 bg-gray-50/80 backdrop-blur-sm shadow-lg">
      <CardContent className="p-12 text-center">
        <Frame className="w-16 h-16 mx-auto text-gray-400 mb-6" />
        <h3 className="text-xl font-semibold text-gray-900 mb-3">No Parent Frames Found</h3>
        <p className="text-gray-600 max-w-md mx-auto leading-relaxed">
          This analysis works best with Figma files that have organized frame structures. 
          Try analyzing a file with top-level frames containing your design components.
        </p>
      </CardContent>
    </Card>
  )
}

interface FrameCardProps {
  frame: FrameAnalysis
}

function FrameCard({ frame }: FrameCardProps) {
  const hasIssues = (frame.totalIssues || 0) > 0
  const tokenizationPercentage = Math.round(frame.tokenizationRate)

  return (
    <Card className="overflow-hidden border border-gray-200/60 shadow-lg bg-white/80 backdrop-blur-sm">
      <FrameCardHeader frame={frame} hasIssues={hasIssues} tokenizationPercentage={tokenizationPercentage} />
      <CardContent className="p-0">
        {frame.rawValues.length === 0 ? (
          <EmptyFrameContent />
        ) : (
          <FrameValuesList frame={frame} />
        )}
      </CardContent>
    </Card>
  )
}

function FrameCardHeader({ frame, hasIssues, tokenizationPercentage }: { 
  frame: FrameAnalysis
  hasIssues: boolean
  tokenizationPercentage: number
}) {
  // Calculate the breakdown for this frame (similar to overview)
  const tokenizedValues = frame.tokenizedElements || 0
  const frameMatches = frame.rawValues.reduce((total, valueData) => {
    return total + (valueData.recommendations && valueData.recommendations.length > 0 ? valueData.count : 0)
  }, 0)
  const frameIssues = frame.rawValues.reduce((total, valueData) => {
    return total + (valueData.recommendations && valueData.recommendations.length > 0 ? 0 : valueData.count)
  }, 0)
  
  const totalAnalyzed = tokenizedValues + frameMatches + frameIssues
  
  // Calculate percentages
  const tokenizedPercentage = totalAnalyzed > 0 ? Math.round((tokenizedValues / totalAnalyzed) * 100) : 0
  const matchesPercentage = totalAnalyzed > 0 ? Math.round((frameMatches / totalAnalyzed) * 100) : 0
  const issuesPercentage = totalAnalyzed > 0 ? Math.round((frameIssues / totalAnalyzed) * 100) : 0
  
  // Determine overall status
  const frameHasIssues = frameIssues > 0
  const hasMatches = frameMatches > 0

  return (
    <CardHeader className="bg-gradient-to-r from-gray-50/80 to-gray-100/60 border-b border-gray-200/60">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${!frameHasIssues ? 'bg-green-100 text-green-600' : hasMatches ? 'bg-blue-100 text-blue-600' : 'bg-yellow-100 text-yellow-600'}`}>
              {!frameHasIssues ? <CheckCircle2 className="w-5 h-5" /> : hasMatches ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
          <div>
              <CardTitle className="text-lg font-semibold text-gray-900">{frame.frameName}</CardTitle>
              <p className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {frame.framePath}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium text-gray-700 mb-1">
              {tokenizedPercentage}% tokenized • {frameMatches} matches
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                {/* Tokenized (green) */}
                <div 
                  className="absolute left-0 top-0 h-full bg-green-500 rounded-l-full"
                  style={{ width: `${tokenizedPercentage}%` }}
                />
                {/* Matches (blue) */}
                <div 
                  className="absolute top-0 h-full bg-blue-500"
                  style={{ 
                    left: `${tokenizedPercentage}%`, 
                    width: `${matchesPercentage}%` 
                  }}
                />
                {/* Issues (yellow) */}
                <div 
                  className="absolute top-0 h-full bg-yellow-500 rounded-r-full"
                  style={{ 
                    left: `${tokenizedPercentage + matchesPercentage}%`, 
                    width: `${issuesPercentage}%` 
                  }}
                />
              </div>
              <span className="text-xs font-medium text-gray-600">• {tokenizedPercentage + matchesPercentage}%</span>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild className="flex items-center gap-2 bg-white hover:bg-gray-50">
            <a href={frame.figmaUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" />
              Open Frame
            </a>
          </Button>
        </div>
      </div>
    </CardHeader>
  )
}

function EmptyFrameContent() {
  return (
    <div className="p-8 text-center">
      <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-4" />
      <h4 className="text-lg font-medium text-gray-900 mb-2">No Issues Found</h4>
      <p className="text-gray-600">All values in this frame are properly tokenized.</p>
    </div>
  )
}

function FrameValuesList({ frame }: { frame: FrameAnalysis }) {
  const valueTypes = ["fill", "stroke", "spacing", "padding", "typography", "border-radius"]

  return (
    <div className="divide-y divide-gray-100">
      {valueTypes.map((type) => {
        const typeValues = frame.rawValues.filter((value) => value.type === type)

        if (typeValues.length === 0) return null

        return <ValueTypeSection key={type} type={type} typeValues={typeValues} frame={frame} />
      })}
    </div>
  )
}

function ValueTypeSection({ type, typeValues, frame }: { type: string; typeValues: any[]; frame: FrameAnalysis }) {
  // Calculate total occurrences for this property type in this frame
  const totalTypeIssues = typeValues.reduce((sum, valueData) => sum + valueData.count, 0)
  
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-gray-100">
        {getTypeIcon(type)}
        </div>
        <div>
        <h4 className="font-semibold text-gray-900 capitalize">
            {getPropertyDisplayName(type)} • {totalTypeIssues} issues
        </h4>
        </div>
      </div>
      <div className="space-y-4">
        {typeValues.map((valueData, index) => (
          <ValueMatchCard key={`${type}-${valueData.value}-${index}`} valueData={valueData} type={type} frame={frame} />
        ))}
      </div>
    </div>
  )
}

function ValueMatchCard({ valueData, type, frame }: { valueData: any; type: string; frame: FrameAnalysis }) {
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
        figmaUrl={frame.figmaUrl}
        alternatives={alternatives}
        layerNames={valueData.layerNames}
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
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
      <FigmaValueDisplay value={value} type={type} />
        <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <TokenMatchDisplay
        hasRecommendations={hasRecommendations}
        primaryRecommendation={primaryRecommendation}
        count={count}
        alternatives={alternatives}
      />
      </div>
      <OccurrencesList nodeIds={nodeIds} layerNames={layerNames} figmaUrl={figmaUrl} />
    </div>
  )
}

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

function TokenMatchDisplay({
  hasRecommendations,
  primaryRecommendation,
  count,
  alternatives,
}: {
  hasRecommendations: boolean
  primaryRecommendation?: any
  count: number
  alternatives?: any[]
}) {
  if (!hasRecommendations) {
    return <UnmatchedTokenDisplay count={count} />
  }

  return <MatchedTokenDisplay recommendation={primaryRecommendation} count={count} alternatives={alternatives} />
}

function MatchedTokenDisplay({ recommendation, count, alternatives }: { recommendation: any; count: number; alternatives?: any[] }) {
  return (
    <div className="flex-1 min-w-0">
          <TokenInfo recommendation={recommendation} />
          <TokenBadges recommendation={recommendation} count={count} alternatives={alternatives} />
    </div>
  )
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
      {recommendation.isSemanticToken && recommendation.originalReference && (
        <div className="text-xs text-blue-600 mt-1">Reference: {recommendation.originalReference} • {recommendation.tokenValue}</div>
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
    <div className="flex items-center gap-2 mt-2">
      <Badge 
        variant={matchPercentage === 100 ? "default" : "secondary"} 
        className={`text-xs ${matchPercentage === 100 ? 'bg-green-100 text-green-800 border-green-200' : 'bg-blue-100 text-blue-800 border-blue-200'}`}
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
                      {alternative.isSemanticToken && alternative.originalReference && (
                        <div className="text-blue-600 text-xs">
                          {alternative.originalReference} • {alternative.tokenValue}
                        </div>
                      )}
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ml-2 ${Math.round(alternative.confidence * 100) === 100 ? 'bg-green-100 text-green-800 border-green-200' : 'bg-blue-100 text-blue-800 border-blue-200'}`}
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
      <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600">
        {count} occurrence{count !== 1 ? 's' : ''}
      </Badge>
    </div>
  )
}

function UnmatchedTokenDisplay({ count }: { count: number }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <UnmatchedBadge />
        <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600">
          {count} occurrence{count !== 1 ? 's' : ''}
        </Badge>
      </div>
      <p className="text-sm text-gray-600 mt-1">No matching token found</p>
        </div>
  )
}

function OccurrencesList({ nodeIds, layerNames, figmaUrl }: { nodeIds?: string[]; layerNames?: string[]; figmaUrl: string }) {
  if (!nodeIds || nodeIds.length === 0) return null

  return (
    <div className="mt-4 pt-4 border-t border-gray-200/60">
      <h5 className="text-xs font-medium text-gray-700 mb-3">Occurrences:</h5>
      <div className="flex flex-wrap gap-2">
        {nodeIds.map((nodeId, index) => {
          const layerName = layerNames && layerNames[index] ? layerNames[index] : `Layer ${index + 1}`
          return (
            <Button
              key={`${nodeId}-${index}`}
              variant="outline"
              size="sm"
              asChild
              className="h-8 px-3 text-xs bg-white/90 hover:bg-gray-50/90 border-gray-300/60 shadow-sm"
            >
              <a 
                href={generateFigmaNodeUrl(figmaUrl, nodeId)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                {layerName}
              </a>
            </Button>
          )
        })}
      </div>
    </div>
  )
}


