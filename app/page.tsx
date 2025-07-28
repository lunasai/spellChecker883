"use client"

import type React from "react"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PieChart, FileText, Palette } from "lucide-react"
import { FrameAnalysisView } from "@/components/frame-analysis-view"
import { SetupAnalysis } from "@/components/setup-analysis"
import type { AnalysisResult } from "@/lib/types"
import { getStatusColor, getTokenTypeColor, VISUALIZATION_COLORS } from "@/lib/color-constants"

export default function DesignTokenAuditTool() {
  const [results, setResults] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState("")

  const handleAnalysisComplete = (analysisResults: AnalysisResult) => {
    setResults(analysisResults)
    setError("")
  }

  const handleAnalysisStart = () => {
    setError("")
  }

  const handleAnalysisError = (errorMessage: string) => {
    setError(errorMessage)
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="container mx-auto p-8">
        <AppHeader />
        
        <div className="grid grid-cols-4 gap-8">
          {/* Left Column - Setup and Design System (spans 1 column) */}
          <div className="col-span-1 space-y-8">
            <SetupAnalysis
              onAnalysisComplete={handleAnalysisComplete}
              onAnalysisStart={handleAnalysisStart}
              onAnalysisError={handleAnalysisError}
            />
            
            {results && (
              <DesignSystemCard results={results} />
            )}
          </div>

          {/* Right Column - Results (spans 3 columns) */}
          <div className="col-span-3 space-y-8">
            {results ? (
              <>
                {/* Overview Card */}
                <div className="mb-12">
                  <OverviewCard results={results} />
                </div>
                
                {/* Frame Analysis Section */}
                <div>
                  <div className="mb-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">Frame by frame</h2>
                        <p className="text-gray-600 mt-1">Detailed analysis of each frame</p>
                      </div>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 px-4 py-2">
                        {results.figmaAnalysis.frameAnalyses?.length || 0} Frame{(results.figmaAnalysis.frameAnalyses?.length || 0) !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>
                  <FrameAnalysisView
                    frameAnalyses={results.figmaAnalysis.frameAnalyses || []}
                    tokenMatches={results.tokenMatches}
                    unmatchedValues={results.unmatchedValues}
                  />
                </div>
              </>
            ) : (
              <EmptyAnalysisState />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AppHeader() {
  return (
    <div className="text-center mb-12 mt-16">
      <div className="inline-flex items-center gap-3">
        <div className="p-3 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300">
          <span className="text-2xl">🐱</span>
        </div>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
          Spell checker
        </h1>
      </div>
    </div>
  )
}

function OverviewCard({ results }: { results: AnalysisResult }) {
  // Calculate the correct metrics based on your requirements
  const tokenizedProperties = results.figmaAnalysis.tokenizedProperties || 0
  
  // Calculate total instances that can be tokenized by looking at the original hardcodedValues
  // and checking which ones have matches
  const totalMatchedInstances = results.figmaAnalysis.hardcodedValues.reduce((sum, hardcodedValue) => {
    // Check if this value has a match in tokenMatches
    const hasMatch = results.tokenMatches.some(match => match.figmaValue === hardcodedValue.value)
    return sum + (hasMatch ? hardcodedValue.count : 0)
  }, 0)
  
  // Calculate total instances that need attention (unmatched with count)
  const totalUnmatchedInstances = results.unmatchedValues.reduce((sum, unmatched) => sum + unmatched.count, 0)
  
  // Total instances analyzed
  const totalAnalyzed = tokenizedProperties + totalMatchedInstances + totalUnmatchedInstances
  
  // Calculate percentages
  const tokenizedPercentage = totalAnalyzed > 0 ? Math.round((tokenizedProperties / totalAnalyzed) * 100) : 0
  const matchesPercentage = totalAnalyzed > 0 ? Math.round((totalMatchedInstances / totalAnalyzed) * 100) : 0
  const unmatchesPercentage = totalAnalyzed > 0 ? Math.round((totalUnmatchedInstances / totalAnalyzed) * 100) : 0

  // Calculate issue categories from all hardcoded values
  const issueCategories = {
    fill: 0,
    stroke: 0,
    spacing: 0,
    padding: 0,
    typography: 0,
    'border-radius': 0
  }

  // Count all hardcoded values by type
  results.figmaAnalysis.hardcodedValues.forEach(item => {
    if (issueCategories.hasOwnProperty(item.type)) {
      issueCategories[item.type as keyof typeof issueCategories] += item.count
    }
  })

  // Get all issue categories ranked by count
  const allIssueCategories = Object.entries(issueCategories)
    .filter(([_, count]) => count > 0)
    .sort(([_, a], [__, b]) => b - a)

  return (
    <Card className="border border-gray-200/60 shadow-lg bg-white/80 backdrop-blur-sm">
      <CardHeader className="pb-6">
        <CardTitle className="text-xl font-semibold text-gray-900">Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-6">
          {/* Left Column - Tokenization Overview */}
          <div className="text-center">
            <div className="space-y-4">
              {/* Main percentage with enhanced styling */}
              <div>
                <div className="text-6xl font-bold bg-gradient-to-r from-green-600 to-green-700 bg-clip-text text-transparent mb-3">
                  {tokenizedPercentage}%
                </div>
                <div className="text-lg text-gray-700 font-medium">already tokenized</div>
              </div>
              
              {/* Visual progress breakdown */}
              <div className="space-y-4">
                {/* Can be tokenized */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full shadow-sm"
                        style={{ backgroundColor: VISUALIZATION_COLORS.STATUS.MATCHED.primary }}
                      ></div>
                      <span className="font-medium text-gray-700">Can be tokenized</span>
                    </div>
                    <span 
                      className="font-bold"
                      style={{ color: VISUALIZATION_COLORS.STATUS.MATCHED.dark }}
                    >{matchesPercentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="h-2.5 rounded-full transition-all duration-500 ease-out"
                      style={{ 
                        width: `${matchesPercentage}%`,
                        background: `linear-gradient(to right, ${VISUALIZATION_COLORS.STATUS.MATCHED.primary}, ${VISUALIZATION_COLORS.STATUS.MATCHED.dark})`
                      }}
                    />
                  </div>
                </div>

                {/* Need attention */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full shadow-sm"
                        style={{ backgroundColor: VISUALIZATION_COLORS.STATUS.NEEDS_ATTENTION.primary }}
                      ></div>
                      <span className="font-medium text-gray-700">Need attention</span>
                    </div>
                    <span 
                      className="font-bold"
                      style={{ color: VISUALIZATION_COLORS.STATUS.NEEDS_ATTENTION.dark }}
                    >{unmatchesPercentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="h-2.5 rounded-full transition-all duration-500 ease-out"
                      style={{ 
                        width: `${unmatchesPercentage}%`,
                        background: `linear-gradient(to right, ${VISUALIZATION_COLORS.STATUS.NEEDS_ATTENTION.primary}, ${VISUALIZATION_COLORS.STATUS.NEEDS_ATTENTION.dark})`
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Summary stats */}
              <div className="pt-4 border-t border-gray-100">
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div className="text-center">
                    <div 
                      className="text-lg font-bold"
                      style={{ color: VISUALIZATION_COLORS.STATUS.TOKENIZED.dark }}
                    >{tokenizedProperties}</div>
                    <div className="text-gray-500">Tokenized</div>
                  </div>
                  <div className="text-center">
                    <div 
                      className="text-lg font-bold"
                      style={{ color: VISUALIZATION_COLORS.STATUS.MATCHED.dark }}
                    >{totalMatchedInstances}</div>
                    <div className="text-gray-500">Matched</div>
                  </div>
                  <div className="text-center">
                    <div 
                      className="text-lg font-bold"
                      style={{ color: VISUALIZATION_COLORS.STATUS.NEEDS_ATTENTION.dark }}
                    >{totalUnmatchedInstances}</div>
                    <div className="text-gray-500">Issues</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Issue Categories */}
          <div>
            {allIssueCategories.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Issues by type</h3>
                  <span className="text-xs text-gray-400">
                    {results.figmaAnalysis.hardcodedValues.reduce((sum: number, item: any) => sum + item.count, 0)} total
                  </span>
                </div>
                
                <div className="space-y-2">
                  {allIssueCategories.map(([category, count]) => {
                    const colors = getTokenTypeColor(category)
                    const categoryIcons = {
                      fill: '🎨',
                      stroke: '✏️',
                      spacing: '↔️',
                      padding: '📏',
                      typography: '📝',
                      'border-radius': '🔲'
                    }
                    const icon = categoryIcons[category as keyof typeof categoryIcons] || '❓'
                    
                    return (
                      <div 
                        key={category} 
                        className="flex items-center justify-between p-2.5 rounded-md border hover:bg-opacity-75 transition-colors duration-150"
                        style={{ 
                          backgroundColor: `${colors.light}80`,
                          borderColor: colors.border
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <div 
                            className="w-6 h-6 rounded-md bg-white border flex items-center justify-center text-xs"
                            style={{ borderColor: colors.border }}
                          >
                            {icon}
                          </div>
                          <div>
                            <div 
                              className="text-sm font-medium capitalize"
                              style={{ color: colors.text }}
                            >
                              {category.replace('-', ' ')}
                            </div>
                          </div>
                        </div>
                        <div 
                          className="text-sm font-semibold"
                          style={{ color: colors.text }}
                        >
                          {count}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400 py-6">
                <div className="text-3xl mb-2">🎉</div>
                <div className="text-sm font-medium text-gray-500 mb-1">All good!</div>
                <div className="text-xs">No issues found</div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function DesignSystemCard({ results }: { results: AnalysisResult }) {
  const totalTokens = results.debugInfo?.totalResolvedTokens || 0
  const semanticTokensCount = results.debugInfo?.semanticTokensCount || 0
  const baseTokensCount = results.debugInfo?.rawTokensCount || 0

  return (
    <Card className="border border-gray-200/60 shadow-lg bg-white/80 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-purple-600" />
          <CardTitle className="text-lg font-semibold text-gray-900">Design System</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Simple Token Count */}
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{totalTokens}</div>
          <div className="text-sm text-gray-600">Available Tokens</div>
        </div>

        {/* Token Types */}
        <div className="flex justify-between text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>{semanticTokensCount} semantic</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
            <span>{baseTokensCount} base</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ResultsSummaryCard({ results }: { results: AnalysisResult }) {
  const totalTokens = results.tokenMatches.length + results.unmatchedValues.length
  const tokenizedCount = results.tokenMatches.length
  const unmatchedCount = results.unmatchedValues.length
  
  const tokenizedPercentage = totalTokens > 0 ? Math.round((tokenizedCount / totalTokens) * 100) : 0
  const unmatchedPercentage = totalTokens > 0 ? Math.round((unmatchedCount / totalTokens) * 100) : 0

  return (
    <Card className="border-0 shadow-sm bg-white">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold text-gray-900">Results from JSON</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Total Tokens:</span>
          <span className="font-semibold text-gray-900">{totalTokens}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Semantic Tokens:</span>
          <span className="font-semibold text-gray-900">{results.tokenMatches.filter(m => m.isSemanticToken).length}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Raw Tokens:</span>
          <span className="font-semibold text-gray-900">{results.tokenMatches.filter(m => !m.isSemanticToken).length}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Theme Used:</span>
          <span className="font-semibold text-gray-900 flex items-center gap-2">
            {results.selectedTheme ? (
              <>
                <Palette className="w-4 h-4 text-blue-600" />
                {results.selectedTheme.name}
              </>
            ) : (
              <>
                <Palette className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Default (No theme)</span>
              </>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyAnalysisState() {
  return (
    <Card className="border-0 shadow-sm bg-white">
      <CardContent className="p-12 text-center">
        <PieChart className="w-16 h-16 mx-auto text-gray-400 mb-6" />
        <h3 className="text-xl font-semibold text-gray-900 mb-3">No Analysis Yet</h3>
        <p className="text-gray-600 max-w-md mx-auto leading-relaxed">
          Upload your design tokens and Figma file to start analyzing hardcoded values.
        </p>
      </CardContent>
    </Card>
  )
}




