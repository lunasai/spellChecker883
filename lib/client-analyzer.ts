import { ERROR_MESSAGES } from "@/lib/constants"
import { extractFileIdFromUrl } from "@/lib/figma-utils"
import { resolveTokensWithSemantics, resolveTokensWithTheme } from "@/lib/token-utils"
import { analyzeFigmaFileByFrames } from "@/lib/figma-analyzer"
import { matchValuesWithTokens } from "@/lib/token-matcher"
import type { DesignToken, Theme } from "@/lib/types"
import { fetchFigmaStyles } from '@/lib/figma-analyzer'

export async function analyzeClientSide(
  tokensFile: File,
  figmaUrl: string,
  figmaToken: string,
  selectedTheme: Theme | null
) {
  try {
    console.log("Starting client-side analysis...")

    // Parse and validate tokens file
    const tokens = await parseTokensFile(tokensFile)
    console.log("Parsed tokens file successfully")

    console.log("Selected theme:", selectedTheme?.name || "No theme selected")

    // Resolve tokens based on theme selection
    let resolvedTokens: Record<string, any>
    if (selectedTheme) {
      console.log("Resolving tokens with selected theme...")
      resolvedTokens = resolveTokensWithTheme(tokens, selectedTheme)
    } else {
      console.log("Resolving tokens without theme selection...")
      resolvedTokens = resolveTokensWithSemantics(tokens)
    }

    console.log("Resolution complete:")
    console.log("- Total resolved tokens:", Object.keys(resolvedTokens).length)
    console.log("- Semantic tokens:", Object.values(resolvedTokens).filter((t) => t.isReference).length)
    console.log("- Base tokens:", Object.values(resolvedTokens).filter((t) => !t.isReference).length)

    // Show some examples of resolved tokens
    const semanticExamples = Object.entries(resolvedTokens)
      .filter(([_, token]) => token.isReference)
      .slice(0, 5)

    console.log("Example semantic token resolutions:")
    semanticExamples.forEach(([name, token]) => {
      console.log(`  ${name}: ${token.originalReference} → ${token.value}`)
    })

    // Fetch and analyze Figma file
    console.log("Fetching Figma file...")
    const figmaData = await fetchFigmaFile(figmaUrl, figmaToken)

    // Fetch Figma styles for variable detection
    const fileId = extractFileIdFromUrl(figmaUrl)
    let styleIdToStyle = {}
    if (fileId) {
      try {
        styleIdToStyle = await fetchFigmaStyles(fileId, figmaToken)
        console.log("Fetched Figma styles for variable detection.")
      } catch (err) {
        console.warn("Failed to fetch Figma styles:", err)
      }
    }

    console.log("Analyzing Figma file...")
    const analysisResult = analyzeFigmaFileByFrames(figmaData.document, figmaUrl, resolvedTokens, styleIdToStyle)

    console.log("Figma analysis complete:")
    console.log("- Total elements:", analysisResult.totalElements)
    console.log("- Hardcoded values:", analysisResult.hardcodedValues.length)
    console.log("- Frame analyses:", analysisResult.frameAnalyses.length)

    // Match values with tokens using enhanced matching logic
    console.log("Matching values with tokens...")
    const matchResult = matchValuesWithTokens(analysisResult.hardcodedValues, resolvedTokens)

    console.log("Matching complete:")
    console.log("- Token matches:", matchResult.tokenMatches.length)
    console.log("- Unmatched values:", matchResult.unmatchedValues.length)

    return {
      figmaAnalysis: {
        hardcodedValues: analysisResult.hardcodedValues,
        totalElements: analysisResult.totalElements,
        tokenizedProperties: analysisResult.tokenizedProperties,
        frameAnalyses: analysisResult.frameAnalyses,
      },
      tokenMatches: matchResult.tokenMatches,
      unmatchedValues: matchResult.unmatchedValues,
      selectedTheme: selectedTheme || undefined,
      debugInfo: {
        totalResolvedTokens: Object.keys(resolvedTokens).length,
        semanticTokensCount: Object.values(resolvedTokens).filter((t) => t.isReference).length,
        rawTokensCount: Object.values(resolvedTokens).filter((t) => !t.isReference).length,
        exampleResolutions: semanticExamples.map(([name, token]) => ({
          tokenName: name,
          originalReference: token.originalReference,
          resolvedValue: token.value,
          referenceChain: token.referenceChain,
        })),
      },
    }
  } catch (error) {
    console.error("Analysis error:", error)
    throw new Error(
      ERROR_MESSAGES.ANALYSIS_FAILED + 
      (error instanceof Error ? `: ${error.message}` : ": Unknown error")
    )
  }
}

async function parseTokensFile(tokensFile: File): Promise<DesignToken> {
  const tokensContent = await tokensFile.text()

  if (!tokensContent.trim()) {
    throw new Error(ERROR_MESSAGES.EMPTY_FILE)
  }

  try {
    const tokens = JSON.parse(tokensContent)

    if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) {
      throw new Error(ERROR_MESSAGES.INVALID_FILE_FORMAT)
    }

    return tokens
  } catch (parseError) {
    console.error("Failed to parse tokens file:", parseError)
    throw new Error(ERROR_MESSAGES.INVALID_JSON)
  }
}

async function fetchFigmaFile(figmaUrl: string, figmaToken: string) {
  const fileId = extractFileIdFromUrl(figmaUrl)
  if (!fileId) {
    throw new Error(ERROR_MESSAGES.INVALID_FIGMA_URL)
  }

  const figmaResponse = await fetch(`https://api.figma.com/v1/files/${fileId}`, {
    headers: {
      "X-Figma-Token": figmaToken,
    },
  })

  if (!figmaResponse.ok) {
    throw new Error(`${ERROR_MESSAGES.FIGMA_FETCH_FAILED}: ${figmaResponse.status} ${figmaResponse.statusText}`)
  }

  return figmaResponse.json()
} 