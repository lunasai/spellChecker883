"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { AlertCircle, CheckCircle, Upload, FileText, Figma, LinkIcon, Info, PieChart, Palette } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { FrameAnalysisView } from "@/components/frame-analysis-view"
import { SemanticTokenBadge } from "@/components/ui-helpers"
import { extractThemes } from "@/lib/token-utils"
import { ERROR_MESSAGES, APP_CONFIG } from "@/lib/constants"
import type { AnalysisResult, Theme } from "@/lib/types"
import { analyzeClientSide } from "@/lib/client-analyzer"

export default function DesignTokenAuditTool() {
  const [tokensFile, setTokensFile] = useState<File | null>(null)
  const [figmaUrl, setFigmaUrl] = useState("")
  const [figmaToken, setFigmaToken] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState("")
  const [availableThemes, setAvailableThemes] = useState<Theme[]>([])
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null)
  const [showThemeToggle, setShowThemeToggle] = useState(false)
  const [useTheme, setUseTheme] = useState(false)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file || file.type !== "application/json") {
      setError(ERROR_MESSAGES.INVALID_FILE_TYPE)
      return
    }

    try {
      const content = await file.text()

      if (!content.trim()) {
        setError(ERROR_MESSAGES.EMPTY_FILE)
        return
      }

      const tokensData = JSON.parse(content)

      if (!tokensData || typeof tokensData !== "object" || Array.isArray(tokensData)) {
        setError(ERROR_MESSAGES.INVALID_FILE_FORMAT)
        return
      }

      const extractedThemes = extractThemes(tokensData)

      setTokensFile(file)
      setAvailableThemes(extractedThemes)
      setSelectedTheme(extractedThemes[0] || null)
      setShowThemeToggle(extractedThemes.length > 0)
      setUseTheme(false) // Reset theme toggle when new file is uploaded
      setError("")
    } catch (err) {
      console.error("File parsing error:", err)
      setError(ERROR_MESSAGES.INVALID_JSON)
    }
  }

  const handleAnalysis = async () => {
    if (!tokensFile || !figmaUrl || !figmaToken) {
      setError(ERROR_MESSAGES.MISSING_FIELDS)
      return
    }

    // Theme selection is optional - if no theme is selected, we'll use default resolution

    setIsAnalyzing(true)
    setProgress(0)
    setError("")

    try {
      setProgress(20)
      
      // Use client-side analysis instead of API call
      const analysisResults = await analyzeClientSide(
        tokensFile,
        figmaUrl,
        figmaToken,
        useTheme && selectedTheme ? selectedTheme : null
      )

      setProgress(100)
      setResults(analysisResults)
    } catch (err) {
      console.error("Analysis error:", err)
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.ANALYSIS_FAILED)
    } finally {
      setIsAnalyzing(false)
      setProgress(0)
    }
  }

  const handleThemeSelection = (theme: Theme | null) => {
    setSelectedTheme(theme)
  }



  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        <AppHeader />
        
        <div className="grid grid-cols-4 gap-6">
          {/* Left Column - Setup (spans 1 column) */}
          <div className="col-span-1">
            <SetupCard
              tokensFile={tokensFile}
              figmaUrl={figmaUrl}
              figmaToken={figmaToken}
              availableThemes={availableThemes}
              selectedTheme={selectedTheme}
              showThemeToggle={showThemeToggle}
              useTheme={useTheme}
              error={error}
              isAnalyzing={isAnalyzing}
              progress={progress}
              onFileUpload={handleFileUpload}
              onFigmaUrlChange={setFigmaUrl}
              onFigmaTokenChange={setFigmaToken}
              onThemeSelection={handleThemeSelection}
              onUseThemeToggle={setUseTheme}
              onAnalysis={handleAnalysis}
            />
          </div>

          {/* Right Column - Results (spans 3 columns) */}
          <div className="col-span-3 space-y-6">
            {results ? (
              <>
                {/* Overview and Design System Cards */}
                <div className="grid grid-cols-8 gap-6">
                  <div className="col-span-5">
                    <OverviewCard results={results} />
                  </div>
                  <div className="col-span-3">
                    <DesignSystemCard results={results} />
                  </div>
                </div>
                
                {/* Frame Analysis Section */}
                <div>
                  <div className="mb-6">
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
    <div className="text-center mb-8">
      <div className="inline-flex items-center gap-3 mb-4">
        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
          <FileText className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
          Spell checker
        </h1>
      </div>
      <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
        Upload your design tokens and analyze Figma files to find hardcoded values that should be tokenized
      </p>
    </div>
  )
}

function OverviewCard({ results }: { results: AnalysisResult }) {
  // Calculate the new metrics based on your requirements
  const tokenizedValues = results.figmaAnalysis.tokenizedElements || 0
  const nonTokenizedValues = results.figmaAnalysis.totalElements - tokenizedValues
  const matches = results.tokenMatches.length
  const unmatches = results.unmatchedValues.length
  
  const totalAnalyzed = tokenizedValues + matches + unmatches
  const tokenizedPercentage = totalAnalyzed > 0 ? Math.round((tokenizedValues / totalAnalyzed) * 100) : 0
  const matchesPercentage = totalAnalyzed > 0 ? Math.round((matches / totalAnalyzed) * 100) : 0
  const unmatchesPercentage = totalAnalyzed > 0 ? Math.round((unmatches / totalAnalyzed) * 100) : 0

  // Calculate issue categories
  const issueCategories = {
    fill: 0,
    stroke: 0,
    spacing: 0,
    padding: 0,
    typography: 0,
    'border-radius': 0
  }

  // Count issues from unmatched values
  results.unmatchedValues.forEach(item => {
    if (issueCategories.hasOwnProperty(item.type)) {
      issueCategories[item.type as keyof typeof issueCategories] += item.count
    }
  })

  // Count issues from non-tokenized values that don't have matches
  results.figmaAnalysis.nonTokenizedValues.forEach(item => {
    const hasMatch = results.tokenMatches.some(match => 
      match.figmaValue === item.value && match.nodeIds?.some(id => item.nodeIds?.includes(id))
    )
    if (!hasMatch && issueCategories.hasOwnProperty(item.type)) {
      issueCategories[item.type as keyof typeof issueCategories] += item.count
    }
  })

  // Get top 3 issue categories
  const topIssueCategories = Object.entries(issueCategories)
    .filter(([_, count]) => count > 0)
    .sort(([_, a], [__, b]) => b - a)
    .slice(0, 3)

  return (
    <Card className="border border-gray-200/60 shadow-lg bg-white/80 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold text-gray-900">Overview</CardTitle>
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-gray-600">
              {results.selectedTheme ? results.selectedTheme.name : "Default (No theme)"}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Tokenization Overview */}
        <div className="text-center">
          <div className="text-4xl font-bold text-gray-900 mb-2">{tokenizedPercentage}%</div>
          <div className="text-lg text-gray-600 mb-4">of values are properly tokenized</div>
          
          {/* Compact metrics */}
          <div className="flex justify-center gap-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>{tokenizedValues} tokenized</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>{matches} can be tokenized</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
              <span>{unmatches} need attention</span>
            </div>
          </div>
        </div>

        {/* Issue Categories */}
        {topIssueCategories.length > 0 && (
          <div className="pt-4 border-t border-gray-200/60">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Top Issue Categories</h3>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {unmatches} total issues
              </span>
            </div>
            
            <div className="space-y-3">
              {topIssueCategories.map(([category, count], index) => {
                const percentage = unmatches > 0 ? Math.round((count / unmatches) * 100) : 0
                const categoryColors = {
                  fill: { bg: 'bg-red-50/50', border: 'border-red-200/30', text: 'text-red-700', icon: '🎨' },
                  stroke: { bg: 'bg-orange-50/50', border: 'border-orange-200/30', text: 'text-orange-700', icon: '✏️' },
                  spacing: { bg: 'bg-blue-50/50', border: 'border-blue-200/30', text: 'text-blue-700', icon: '↔️' },
                  padding: { bg: 'bg-purple-50/50', border: 'border-purple-200/30', text: 'text-purple-700', icon: '📏' },
                  typography: { bg: 'bg-green-50/50', border: 'border-green-200/30', text: 'text-green-700', icon: '📝' },
                  'border-radius': { bg: 'bg-yellow-50/50', border: 'border-yellow-200/30', text: 'text-yellow-700', icon: '🔲' }
                }
                const colors = categoryColors[category as keyof typeof categoryColors]
                
                return (
                  <div key={category} className={`flex items-center justify-between p-3 rounded-lg ${colors.bg} border ${colors.border}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{colors.icon}</span>
                      <div>
                        <div className="font-medium text-gray-900 capitalize">
                          {category.replace('-', ' ')}
                        </div>
                        <div className="text-xs text-gray-500">
                          {count} {count === 1 ? 'issue' : 'issues'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${colors.text}`}>{percentage}%</div>
                      <div className="text-xs text-gray-500">of issues</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
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
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold text-gray-900">Design System</CardTitle>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-600" />
            <span className="text-sm text-gray-600">Available Tokens</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Design System Statistics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-blue-50/50 border border-blue-200/30">
            <div className="text-xl font-bold text-blue-700">{totalTokens}</div>
            <div className="text-sm text-gray-700 font-medium">Total Tokens</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-green-50/50 border border-green-200/30">
            <div className="text-xl font-bold text-green-700">{semanticTokensCount}</div>
            <div className="text-sm text-gray-700 font-medium">Semantic Tokens</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-purple-50/50 border border-purple-200/30">
            <div className="text-xl font-bold text-purple-700">{baseTokensCount}</div>
            <div className="text-sm text-gray-700 font-medium">Base Tokens</div>
          </div>
        </div>

        {/* Token Distribution */}
        <div className="pt-4 border-t border-gray-200/60">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Token Distribution</span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{totalTokens} total</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 rounded-lg bg-green-50/30 border border-green-200/20">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-700 font-medium">Semantic Tokens</span>
              </div>
              <span className="text-sm font-bold text-gray-900">
                {totalTokens > 0 ? Math.round((semanticTokensCount / totalTokens) * 100) : 0}%
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-purple-50/30 border border-purple-200/20">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                <span className="text-sm text-gray-700 font-medium">Base Tokens</span>
              </div>
              <span className="text-sm font-bold text-gray-900">
                {totalTokens > 0 ? Math.round((baseTokensCount / totalTokens) * 100) : 0}%
              </span>
            </div>
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

interface SetupCardProps {
  tokensFile: File | null
  figmaUrl: string
  figmaToken: string
  availableThemes: Theme[]
  selectedTheme: Theme | null
  showThemeToggle: boolean
  useTheme: boolean
  error: string
  isAnalyzing: boolean
  progress: number
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onFigmaUrlChange: (url: string) => void
  onFigmaTokenChange: (token: string) => void
  onThemeSelection: (theme: Theme | null) => void
  onUseThemeToggle: (useTheme: boolean) => void
  onAnalysis: () => void
}

function SetupCard({
  tokensFile,
  figmaUrl,
  figmaToken,
  availableThemes,
  selectedTheme,
  showThemeToggle,
  useTheme,
  error,
  isAnalyzing,
  progress,
  onFileUpload,
  onFigmaUrlChange,
  onFigmaTokenChange,
  onThemeSelection,
  onUseThemeToggle,
  onAnalysis,
}: SetupCardProps) {
  return (
    <Card className="border border-gray-200/60 shadow-lg bg-white/80 backdrop-blur-sm">
      <CardHeader className="bg-gradient-to-r from-gray-50/80 to-gray-100/60 border-b border-gray-200/60 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-1.5 rounded-lg bg-blue-100">
            <Upload className="w-4 h-4 text-blue-600" />
          </div>
          Setup Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <FileUploadSection tokensFile={tokensFile} onFileUpload={onFileUpload} />

        {showThemeToggle && (
          <ThemeSelectionSection
            availableThemes={availableThemes}
            selectedTheme={selectedTheme}
            useTheme={useTheme}
            onThemeSelection={onThemeSelection}
            onUseThemeToggle={onUseThemeToggle}
          />
        )}

        <FigmaInputSection
          figmaUrl={figmaUrl}
          figmaToken={figmaToken}
          onFigmaUrlChange={onFigmaUrlChange}
          onFigmaTokenChange={onFigmaTokenChange}
        />

        {error && <ErrorMessage error={error} />}

        <AnalysisButton
          isAnalyzing={isAnalyzing}
          canAnalyze={!!(tokensFile && figmaUrl && figmaToken)}
          onAnalysis={onAnalysis}
        />

        {isAnalyzing && <AnalysisProgress progress={progress} />}
      </CardContent>
    </Card>
  )
}

function FileUploadSection({
  tokensFile,
  onFileUpload,
}: { tokensFile: File | null; onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor="tokens-file" className="text-sm font-medium text-gray-700">Design Tokens JSON File</Label>
        <p className="text-xs text-gray-500 mt-1">Upload your design tokens file to match against Figma values</p>
      </div>
      <div className="relative">
        <Input 
          id="tokens-file" 
          type="file" 
          accept=".json" 
          onChange={onFileUpload} 
          className="mt-1 border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors text-xs" 
        />
      </div>
      {tokensFile && (
        <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="w-3 h-3 text-green-600" />
          <span className="text-xs text-green-700 font-medium">{tokensFile.name}</span>
          <span className="text-xs text-green-600">uploaded</span>
        </div>
      )}
    </div>
  )
}

interface ThemeSelectionSectionProps {
  availableThemes: Theme[]
  selectedTheme: Theme | null
  useTheme: boolean
  onThemeSelection: (theme: Theme | null) => void
  onUseThemeToggle: (useTheme: boolean) => void
}

function ThemeSelectionSection({
  availableThemes,
  selectedTheme,
  useTheme,
  onThemeSelection,
  onUseThemeToggle,
}: ThemeSelectionSectionProps) {

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium text-gray-700">Use Theme</Label>
          <p className="text-xs text-gray-500 mt-1">Enable to select a specific theme for token resolution</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2">
            <input
              type="checkbox"
              id="use-theme-toggle"
              checked={useTheme}
              onChange={(e) => onUseThemeToggle(e.target.checked)}
              className="sr-only"
            />
            <label
              htmlFor="use-theme-toggle"
              className={`inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors ${
                useTheme ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  useTheme ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </label>
          </div>
          <span className="text-xs text-gray-700">
            {useTheme ? "On" : "Off"}
          </span>
        </div>
      </div>
      
      {useTheme && (
        <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-gray-50">
          <div className="space-y-1">
            <ThemeCheckbox
              theme={{ id: "none", name: "No Theme (Default)", selectedTokenSets: {} }}
              isSelected={selectedTheme === null}
              onSelection={() => onThemeSelection(null)}
            />
            {availableThemes.map((theme) => (
              <ThemeCheckbox
                key={theme.name}
                theme={theme}
                isSelected={selectedTheme?.name === theme.name}
                onSelection={onThemeSelection}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}



function ThemeCheckbox({
  theme,
  isSelected,
  onSelection,
}: { theme: Theme; isSelected: boolean; onSelection: (theme: Theme | null) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id={`theme-${theme.name}`}
        checked={isSelected}
        onChange={(e) => onSelection(theme)}
        className="rounded"
      />
      <label htmlFor={`theme-${theme.name}`} className="text-xs">
        {theme.name}
      </label>
    </div>
  )
}

function FigmaInputSection({
  figmaUrl,
  figmaToken,
  onFigmaUrlChange,
  onFigmaTokenChange,
}: {
  figmaUrl: string
  figmaToken: string
  onFigmaUrlChange: (url: string) => void
  onFigmaTokenChange: (token: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div>
          <Label htmlFor="figma-url" className="text-sm font-medium text-gray-700">Figma File URL</Label>
          <p className="text-xs text-gray-500 mt-1">The URL of the Figma file you want to analyze</p>
        </div>
        <Input
          id="figma-url"
          type="url"
          placeholder="https://www.figma.com/file/..."
          value={figmaUrl}
          onChange={(e) => onFigmaUrlChange(e.target.value)}
          className="mt-1 text-xs"
        />
      </div>
      <div className="space-y-2">
        <div>
          <Label htmlFor="figma-token" className="text-sm font-medium text-gray-700">Figma Personal Access Token</Label>
          <p className="text-xs text-gray-500 mt-1">Required to access the Figma file</p>
        </div>
        <Input
          id="figma-token"
          type="password"
          placeholder="figd_..."
          value={figmaToken}
          onChange={(e) => onFigmaTokenChange(e.target.value)}
          className="mt-1 text-xs"
        />
        <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
          <Info className="w-3 h-3 text-blue-600" />
          <p className="text-xs text-blue-700">
            Get your token from{" "}
            <a
              href="https://www.figma.com/developers/api#access-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
            >
              Figma's developer settings
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

function ErrorMessage({ error }: { error: string }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
      <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
      <p className="text-xs text-red-700 font-medium">{error}</p>
    </div>
  )
}

function AnalysisButton({
  isAnalyzing,
  canAnalyze,
  onAnalysis,
}: { isAnalyzing: boolean; canAnalyze: boolean; onAnalysis: () => void }) {
  return (
    <Button 
      onClick={onAnalysis} 
      disabled={isAnalyzing || !canAnalyze} 
      className="w-full h-10 text-sm font-medium bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isAnalyzing ? (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Analyzing...
        </div>
      ) : (
        "Start Analysis"
      )}
    </Button>
  )
}

function AnalysisProgress({ progress }: { progress: number }) {
  return (
    <div className="space-y-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-blue-700 font-medium">Analysis Progress</span>
          <span className="text-blue-600">{progress}%</span>
        </div>
        <Progress value={progress} className="w-full h-2" />
      </div>
      <p className="text-xs text-blue-700 text-center">
        Analyzing Figma file and matching tokens...
      </p>
    </div>
  )
}
