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
    <div className="min-h-screen bg-gray-50/50">
      <div className="container mx-auto p-8">
        <AppHeader />
        
        <div className="grid grid-cols-4 gap-8">
          {/* Left Column - Setup and Design System (spans 1 column) */}
          <div className="col-span-1 space-y-8">
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
            <div className="space-y-3">
              {/* Main percentage */}
              <div>
                <div className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
                  {tokenizedPercentage}%
                </div>
                <div className="text-base text-gray-600">already tokenized</div>
              </div>
              
              {/* Percentage breakdown */}
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2 text-xs">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  <span className="text-gray-600">{matchesPercentage}%</span>
                  <span className="text-gray-400">can be tokenized</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-xs">
                  <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
                  <span className="text-gray-600">{unmatchesPercentage}%</span>
                  <span className="text-gray-400">need attention</span>
                </div>
              </div>
              
              {/* Raw counts */}
              <div className="flex justify-center gap-3 text-xs text-gray-500 pt-1 border-t border-gray-100">
                <span>{tokenizedProperties} instances</span>
                <span>{totalMatchedInstances} instances</span>
                <span>{totalUnmatchedInstances} instances</span>
              </div>
            </div>
          </div>

          {/* Right Column - Issue Categories */}
          <div>
            {allIssueCategories.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide">Issues by type</h3>
                  <span className="text-xs text-gray-400">
                    {results.figmaAnalysis.hardcodedValues.reduce((sum: number, item: any) => sum + item.count, 0)} total
                  </span>
                </div>
                
                <div className="flex flex-wrap gap-1.5">
                  {allIssueCategories.map(([category, count]) => {
                    const categoryColors = {
                      fill: { bg: 'bg-red-100', text: 'text-red-700', icon: '🎨' },
                      stroke: { bg: 'bg-orange-100', text: 'text-orange-700', icon: '✏️' },
                      spacing: { bg: 'bg-blue-100', text: 'text-blue-700', icon: '↔️' },
                      padding: { bg: 'bg-purple-100', text: 'text-purple-700', icon: '📏' },
                      typography: { bg: 'bg-green-100', text: 'text-green-700', icon: '📝' },
                      'border-radius': { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '🔲' }
                    }
                    const colors = categoryColors[category as keyof typeof categoryColors]
                    
                    return (
                      <div key={category} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                        <span className="text-xs">{colors.icon}</span>
                        <span className="capitalize">{category.replace('-', ' ')}</span>
                        <span className="font-bold">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400 text-xs">
                <div className="text-lg mb-1">🎉</div>
                <div>All good!</div>
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
