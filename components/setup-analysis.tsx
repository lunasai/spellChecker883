"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { AlertCircle, CheckCircle, Upload, FileText, Figma, Info, ChevronDown, ChevronUp } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { extractThemes } from "@/lib/token-utils"
import { ERROR_MESSAGES } from "@/lib/constants"
import type { AnalysisResult, Theme } from "@/lib/types"
import { analyzeClientSide } from "@/lib/client-analyzer"
import { getAssetPath } from "@/lib/utils"

interface SetupAnalysisProps {
  onAnalysisComplete: (results: AnalysisResult) => void
  onAnalysisStart: () => void
  onAnalysisError: (error: string) => void
}

export function SetupAnalysis({ onAnalysisComplete, onAnalysisStart, onAnalysisError }: SetupAnalysisProps) {
  const [figmaUrl, setFigmaUrl] = useState("")
  const [figmaToken, setFigmaToken] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState("")
  
  // Custom library state
  const [showCustomLibrary, setShowCustomLibrary] = useState(false)
  const [customTokensFile, setCustomTokensFile] = useState<File | null>(null)
  const [availableThemes, setAvailableThemes] = useState<Theme[]>([])
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null)
  const [showThemeToggle, setShowThemeToggle] = useState(false)
  const [useTheme, setUseTheme] = useState(false)
  
  // Default library state
  const [defaultLibraryLoaded, setDefaultLibraryLoaded] = useState(false)
  const [defaultLibraryLoading, setDefaultLibraryLoading] = useState(true)
  const [defaultLibraryThemes, setDefaultLibraryThemes] = useState<Theme[]>([])

  // Load default Crate Library on component mount
  useEffect(() => {
    console.log('SetupAnalysis component mounted, loading default library...')
    const init = async () => {
      await loadDefaultLibrary()
    }
    init()
  }, [])

  const loadDefaultLibrary = async () => {
    try {
      console.log('Loading default library...')
      setDefaultLibraryLoading(true)
      
      // Add a timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      )
      
      const fetchPromise = fetch(getAssetPath('/crate-library.json'))
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response
      
      console.log('Response status:', response.status)
      
      if (!response.ok) {
        throw new Error(`Failed to load default library: ${response.status}`)
      }
      
      const tokensData = await response.json()
      console.log('Tokens data loaded:', Object.keys(tokensData).length, 'sections')
      
      const extractedThemes = extractThemes(tokensData)
      console.log('Extracted themes:', extractedThemes.length)
      
      setDefaultLibraryThemes(extractedThemes)
      setDefaultLibraryLoaded(true)
      setDefaultLibraryLoading(false)
      console.log('Default Crate Library loaded successfully')
    } catch (err) {
      console.error('Failed to load default library:', err)
      setDefaultLibraryLoading(false)
      // Don't set the main error state for library loading failures
      // Just let the UI show the "Failed to load" state
    }
  }

  const handleCustomFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

      setCustomTokensFile(file)
      setAvailableThemes(extractedThemes)
      setSelectedTheme(extractedThemes[0] || null)
      setShowThemeToggle(extractedThemes.length > 0)
      setUseTheme(false)
      setError("")
    } catch (err) {
      console.error("File parsing error:", err)
      setError(ERROR_MESSAGES.INVALID_JSON)
    }
  }

  const handleAnalysis = async () => {
    if (!figmaUrl || !figmaToken) {
      setError(ERROR_MESSAGES.MISSING_FIELDS)
      return
    }

    if (!defaultLibraryLoaded && !customTokensFile) {
      setError("No design tokens available for analysis")
      return
    }

    setIsAnalyzing(true)
    setProgress(0)
    setError("")
    onAnalysisStart()

    try {
      setProgress(20)
      
      // Determine which tokens file to use
      const tokensFile = customTokensFile || await createDefaultLibraryFile()
      const selectedThemeForAnalysis = useTheme && selectedTheme ? selectedTheme : null
      
      // Use client-side analysis
      const analysisResults = await analyzeClientSide(
        tokensFile,
        figmaUrl,
        figmaToken,
        selectedThemeForAnalysis
      )

      setProgress(100)
      onAnalysisComplete(analysisResults)
    } catch (err) {
      console.error("Analysis error:", err)
      const errorMessage = err instanceof Error ? err.message : ERROR_MESSAGES.ANALYSIS_FAILED
      setError(errorMessage)
      onAnalysisError(errorMessage)
    } finally {
      setIsAnalyzing(false)
      setProgress(0)
    }
  }

  const createDefaultLibraryFile = async (): Promise<File> => {
    const response = await fetch(getAssetPath('/crate-library.json'))
    const tokensData = await response.json()
    const blob = new Blob([JSON.stringify(tokensData, null, 2)], { type: 'application/json' })
    return new File([blob], 'crate-library.json', { type: 'application/json' })
  }

  const handleThemeSelection = (theme: Theme | null) => {
    setSelectedTheme(theme)
  }

  const canAnalyze = !!(figmaUrl && figmaToken && (defaultLibraryLoaded || customTokensFile))

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
        {/* Design System Section */}
        <div className="space-y-2">
          <div>
            <Label className="text-sm font-medium text-gray-700">Design system</Label>
          </div>
          
          {defaultLibraryLoading ? (
            <div className="w-full p-2 bg-gray-50 border border-gray-200 rounded-md">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                <span>Loading...</span>
              </div>
            </div>
          ) : defaultLibraryLoaded ? (
            <div className="w-full p-2 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span>Crate Design System</span>
              </div>
            </div>
          ) : (
            <div className="w-full p-2 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                <span>Failed to load</span>
              </div>
            </div>
          )}
          
          {/* Custom Library Button */}
          <div>
            <button
              onClick={() => setShowCustomLibrary(!showCustomLibrary)}
              className="text-xs text-gray-500 hover:text-gray-700 underline transition-colors"
            >
              Use custom library
            </button>
          </div>
        </div>
          
          {showCustomLibrary && (
            <div className="space-y-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="space-y-2">
                <div>
                  <Label htmlFor="custom-tokens-file" className="text-sm font-medium text-gray-700">Custom Design Tokens JSON</Label>
                  <p className="text-xs text-gray-500 mt-1">Override default library with your own tokens</p>
                </div>
                <Input 
                  id="custom-tokens-file" 
                  type="file" 
                  accept=".json" 
                  onChange={handleCustomFileUpload} 
                  className="mt-1 border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors text-xs" 
                />
              </div>
              
              {customTokensFile && (
                <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <CheckCircle className="w-3 h-3 text-blue-600" />
                  <span className="text-xs text-blue-700 font-medium">{customTokensFile.name}</span>
                  <span className="text-xs text-blue-600">will override default</span>
                </div>
              )}

              {showThemeToggle && (
                <ThemeSelectionSection
                  availableThemes={availableThemes}
                  selectedTheme={selectedTheme}
                  useTheme={useTheme}
                  onThemeSelection={handleThemeSelection}
                  onUseThemeToggle={setUseTheme}
                />
              )}
            </div>
          )}

        {/* Figma Input Section */}
        <FigmaInputSection
          figmaUrl={figmaUrl}
          figmaToken={figmaToken}
          onFigmaUrlChange={setFigmaUrl}
          onFigmaTokenChange={setFigmaToken}
        />

        {error && <ErrorMessage error={error} />}

        <AnalysisButton
          isAnalyzing={isAnalyzing}
          canAnalyze={canAnalyze}
          onAnalysis={handleAnalysis}
        />

        {isAnalyzing && <AnalysisProgress progress={progress} />}
      </CardContent>
    </Card>
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