import { APP_CONFIG } from "./constants"
import { calculateMatchConfidence } from "./confidence-calculator"
import { extractCleanTokenName } from "./token-utils"
import type { ResolvedToken, TokenMatch, UnmatchedValue } from "./types"

interface FigmaValue {
  type: string
  value: string
  count: number
  locations: string[]
  nodeIds?: string[]
}

interface MatchResult {
  tokenMatches: TokenMatch[]
  unmatchedValues: UnmatchedValue[]
}

interface EnhancedTokenMatch {
  figmaValue: string
  nodeIds?: string[]
  count?: number
  matches: Array<{
    tokenName: string
    tokenValue: string
    confidence: number
    isSemanticToken: boolean
    referenceChain?: string[]
    originalReference?: string
    tokenType?: string
    matchType: "exact" | "semantic" | "similar" | "base"
  }>
}

export function matchValuesWithTokens(figmaValues: FigmaValue[], tokens: Record<string, ResolvedToken>): MatchResult {
  console.log("Starting token matching...")
  console.log(`Figma values to match: ${figmaValues.length}`)
  console.log(`Available resolved tokens: ${Object.keys(tokens).length}`)

  // Debug: Show some resolved token examples
  const semanticTokens = Object.entries(tokens).filter(([_, token]) => token.isReference)
  const baseTokens = Object.entries(tokens).filter(([_, token]) => !token.isReference)

  console.log(`Semantic tokens: ${semanticTokens.length}`)
  console.log(`Base tokens: ${baseTokens.length}`)

  // Show examples of resolved tokens
  console.log("Example semantic tokens:")
  semanticTokens.slice(0, 3).forEach(([name, token]) => {
    console.log(`  ${name}: ${token.originalReference} → ${token.value}`)
  })

  console.log("Example base tokens:")
  baseTokens.slice(0, 3).forEach(([name, token]) => {
    console.log(`  ${name}: ${token.value}`)
  })

  const enhancedMatches: EnhancedTokenMatch[] = []
  const unmatchedValues: UnmatchedValue[] = []

  figmaValues.forEach((figmaValue) => {
    const allMatches = findAllPotentialMatches(figmaValue, tokens)

    if (allMatches.length > 0) {
      console.log(`Found ${allMatches.length} matches for ${figmaValue.value}:`)
      allMatches.slice(0, 3).forEach((match) => {
        console.log(`  ${match.tokenName} (${match.matchType}): ${match.confidence.toFixed(2)}`)
      })

      enhancedMatches.push({
        figmaValue: figmaValue.value,
        nodeIds: figmaValue.nodeIds,
        count: figmaValue.count,
        matches: allMatches.map(match => ({
          tokenName: match.tokenName,
          tokenValue: match.tokenData.value,
          confidence: match.confidence,
          isSemanticToken: match.tokenData.isReference,
          referenceChain: match.tokenData.referenceChain,
          originalReference: match.tokenData.originalReference,
          tokenType: match.tokenData.tokenType,
          matchType: match.matchType,
        })),
      })
    } else {
      console.log(`No matches found for ${figmaValue.value} (${figmaValue.type})`)
      unmatchedValues.push({
        value: figmaValue.value,
        type: figmaValue.type,
        count: figmaValue.count,
      })
    }
  })

  // Convert enhanced matches to the expected format
  const tokenMatches = convertToTokenMatches(enhancedMatches)

  // Calculate total occurrences for matched and unmatched values
  const totalMatchedOccurrences = enhancedMatches.reduce((sum, match) => sum + (match.count || 1), 0)
  const totalUnmatchedOccurrences = unmatchedValues.reduce((sum, value) => sum + value.count, 0)

  console.log(`Final results: ${totalMatchedOccurrences} matches, ${totalUnmatchedOccurrences} unmatched`)

  return { tokenMatches, unmatchedValues }
}

interface PotentialMatch {
  tokenName: string
  tokenData: ResolvedToken
  confidence: number
  matchType: "exact" | "semantic" | "similar" | "base"
}

function findAllPotentialMatches(figmaValue: FigmaValue, tokens: Record<string, ResolvedToken>): PotentialMatch[] {
  const exactMatches: PotentialMatch[] = []
  const semanticMatches: PotentialMatch[] = []
  const similarMatches: PotentialMatch[] = []
  const baseMatches: PotentialMatch[] = []

  for (const [tokenName, tokenData] of Object.entries(tokens)) {
    // Skip tokens that don't have a resolved value
    if (!tokenData.value) {
      continue
    }

    const confidence = calculateMatchConfidence(
      figmaValue.value,
      tokenData.value,
      figmaValue.type,
      tokenData.isReference,
      tokenName,
    )

    if (confidence === 0) continue

    const match: PotentialMatch = {
      tokenName,
      tokenData,
      confidence,
      matchType: determineMatchType(figmaValue.value, tokenData, confidence),
    }

    // Enhanced categorization with better semantic token prioritization
    if (confidence >= 0.98) {
      // For exact matches, prioritize semantic tokens
      if (tokenData.isReference) {
        exactMatches.unshift(match) // Add semantic tokens to the front
      } else {
        exactMatches.push(match) // Add base tokens to the back
      }
    } else if (tokenData.isReference && confidence >= APP_CONFIG.CONFIDENCE_THRESHOLDS.MEDIUM) {
      semanticMatches.push(match)
    } else if (confidence >= APP_CONFIG.CONFIDENCE_THRESHOLDS.HIGH) {
      similarMatches.push(match)
    } else if (confidence >= APP_CONFIG.CONFIDENCE_THRESHOLDS.LOW) {
      baseMatches.push(match)
    }
  }

  // Enhanced comparison function for sorting with better semantic token priority
  const compareMatches = (a: PotentialMatch, b: PotentialMatch) => {
    // First by confidence
    if (Math.abs(a.confidence - b.confidence) > 0.01) {
      return b.confidence - a.confidence
    }
    
    // Then prefer semantic tokens with enhanced logic
    if (a.tokenData.isReference && !b.tokenData.isReference) return -1
    if (!a.tokenData.isReference && b.tokenData.isReference) return 1
    
    // If both are semantic or both are base, apply additional criteria
    if (a.tokenData.isReference === b.tokenData.isReference) {
      // For spacing tokens, prefer semantic naming patterns over numeric
      if (a.tokenName.includes('spacing') || b.tokenName.includes('spacing')) {
        const aIsNumeric = /^\d+$/.test(a.tokenName.split('.').pop() || '')
        const bIsNumeric = /^\d+$/.test(b.tokenName.split('.').pop() || '')
        
        if (aIsNumeric && !bIsNumeric) return 1  // Prefer non-numeric
        if (!aIsNumeric && bIsNumeric) return -1 // Prefer non-numeric
      }
      
      // Prefer shorter, more semantic token names
      const aSemanticScore = calculateSemanticNameScore(a.tokenName)
      const bSemanticScore = calculateSemanticNameScore(b.tokenName)
      
      if (aSemanticScore !== bSemanticScore) {
        return bSemanticScore - aSemanticScore
      }
    }
    
    // Finally by name for consistency
    return a.tokenName.localeCompare(b.tokenName)
  }

  // Sort each category using the comparison function
  exactMatches.sort(compareMatches)
  semanticMatches.sort(compareMatches)
  similarMatches.sort(compareMatches)
  baseMatches.sort(compareMatches)

  // Combine matches in priority order with limits
  const allMatches = [
    ...exactMatches.slice(0, 6), // Top 6 exact matches (semantic first)
    ...semanticMatches.slice(0, 4), // Top 4 semantic matches
    ...similarMatches.slice(0, 3), // Top 3 similar matches
    ...baseMatches.slice(0, 2), // Top 2 base matches as fallback
  ]

  return allMatches.slice(0, 10) // Overall limit to top 10 matches
}

function determineMatchType(
  figmaValue: string,
  tokenData: ResolvedToken,
  confidence: number,
): "exact" | "semantic" | "similar" | "base" {
  if (confidence >= 0.98) {
    return tokenData.isReference ? "exact" : "exact" // Both can be exact, but semantic gets priority in sorting
  }

  if (tokenData.isReference) {
    return confidence >= APP_CONFIG.CONFIDENCE_THRESHOLDS.HIGH ? "semantic" : "similar"
  }

  return "base"
}

function convertToTokenMatches(enhancedMatches: EnhancedTokenMatch[]): TokenMatch[] {
  const tokenMatches: TokenMatch[] = []

  enhancedMatches.forEach((enhancedMatch) => {
    enhancedMatch.matches.forEach((match, index) => {
      // Generate suggestions from other matches
      const otherMatches = enhancedMatch.matches
        .filter((_, i) => i !== index)
        .slice(0, APP_CONFIG.MATCH_LIMITS.MAX_SUGGESTIONS)
        .map((m) => {
          const prefix = getMatchTypePrefix(m.matchType, m.isSemanticToken)
          return `${prefix}${m.tokenName} (${m.tokenValue}) - ${Math.round(m.confidence * 100)}%`
        })

      tokenMatches.push({
        figmaValue: enhancedMatch.figmaValue,
        tokenName: extractCleanTokenName(match.tokenName),
        tokenValue: match.tokenValue,
        confidence: match.confidence,
        suggestions: otherMatches,
        isSemanticToken: match.isSemanticToken,
        referenceChain: match.referenceChain,
        originalReference: match.originalReference,
        tokenType: match.tokenType,
        nodeIds: enhancedMatch.nodeIds,
        fullTokenPath: match.tokenName, // Keep full path for tooltip
      })
    })
  })

  return tokenMatches
}

function getMatchTypePrefix(matchType: string, isSemanticToken: boolean): string {
  switch (matchType) {
    case "exact":
      return isSemanticToken ? "[Exact Semantic] " : "[Exact Base] "
    case "semantic":
      return "[Semantic] "
    case "similar":
      return "[Similar] "
    case "base":
      return "[Base] "
    default:
      return ""
  }
}

// Enhanced function for frame analysis recommendations
export function getRecommendationsForValue(
  value: string,
  type: string,
  tokens: Record<string, ResolvedToken>,
): Array<{
  tokenName: string
  tokenValue: string
  confidence: number
  isSemanticToken: boolean
  referenceChain?: string[]
  originalReference?: string
  tokenType?: string
  matchType: string
  fullTokenPath?: string
}> {
  const figmaValue = { type, value, count: 1, locations: [] }
  const matches = findAllPotentialMatches(figmaValue, tokens)

  return matches.map((match) => ({
    tokenName: extractCleanTokenName(match.tokenName),
    tokenValue: match.tokenData.value,
    confidence: match.confidence,
    isSemanticToken: match.tokenData.isReference,
    referenceChain: match.tokenData.referenceChain,
    originalReference: match.tokenData.originalReference,
    tokenType: match.tokenData.tokenType,
    matchType: match.matchType,
    fullTokenPath: match.tokenName, // Keep full path for tooltip
  }))
}

// Helper function to calculate semantic name score
function calculateSemanticNameScore(tokenName: string): number {
  const normalizedName = tokenName.toLowerCase()
  let score = 0
  
  // Boost for semantic patterns
  if (normalizedName.includes('space.')) score += 3
  if (normalizedName.includes('spacing.')) score += 2
  if (normalizedName.includes('margin.')) score += 2
  if (normalizedName.includes('padding.')) score += 2
  
  // Boost for size qualifiers
  if (normalizedName.match(/\.(xs|sm|md|lg|xl|xxs|xxl)$/)) score += 2
  
  // Penalize numeric-only tokens
  if (normalizedName.match(/^\d+$/) || normalizedName.match(/\.\d+$/)) score -= 1
  
  // Prefer shorter, more readable names
  score += Math.max(0, 10 - tokenName.length) * 0.1
  
  return score
}
