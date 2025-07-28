import { APP_CONFIG } from "./constants"
import { normalizeColor } from "./color-utils"
import { calculateStringSimilarity } from "./utils"
import { extractCleanTokenName } from "./token-utils"

// Unified confidence calculation with clear, consistent rules
export function calculateMatchConfidence(
  figmaValue: string,
  tokenValue: string,
  propertyType: string,
  isSemanticToken = false,
  tokenName?: string,
): number {
  // Step 1: Calculate base value similarity (0.0 to 1.0)
  const valueSimilarity = calculateValueSimilarity(figmaValue, tokenValue, propertyType)
  
  // Step 2: Calculate property-token name alignment (0.0 to 1.0)
  const nameAlignment = calculatePropertyTokenNameAlignment(tokenName, propertyType)
  
  // Step 3: Determine if this is an exact value match
  const isExactValueMatch = valueSimilarity === 1.0
  
  // Step 4: Combine with clear, consistent rules
  const finalConfidence = combineConfidenceScores(valueSimilarity, nameAlignment, isSemanticToken, isExactValueMatch)
  
  // Debug logging for understanding the calculation
  if (process.env.NODE_ENV === 'development' && finalConfidence > 0.5) {
    console.log(`Confidence calculation for ${tokenName} (${propertyType}):`)
    console.log(`  Value similarity: ${valueSimilarity.toFixed(3)} (${figmaValue} vs ${tokenValue})`)
    console.log(`  Name alignment: ${nameAlignment.toFixed(3)} (${tokenName} vs ${propertyType})`)
    console.log(`  Semantic token: ${isSemanticToken}`)
    console.log(`  Exact value match: ${isExactValueMatch}`)
    console.log(`  Final confidence: ${finalConfidence.toFixed(3)}`)
  }
  
  // Additional debugging for border-radius specific cases
  if (propertyType === "border-radius" && (tokenName?.includes("padding") || tokenName?.includes("radius"))) {
    console.log(`🔍 BORDER-RADIUS DEBUG: ${tokenName}`)
 
    console.log(`  Token Name: ${tokenName}`)
    console.log(`  Clean Token Name: ${extractCleanTokenName(tokenName || "")}`)
    console.log(`  Name Alignment: ${nameAlignment.toFixed(3)}`)
    console.log(`  Value Similarity: ${valueSimilarity.toFixed(3)}`)
    console.log(`  Final Confidence: ${finalConfidence.toFixed(3)}`)
    console.log(`  Is Semantic Token: ${isSemanticToken}`)
    
    // Show the semantic alignment calculation details
    const cleanTokenName = extractCleanTokenName(tokenName || "")
    const normalizedTokenName = cleanTokenName.toLowerCase()
    console.log(`  Clean Token Name (normalized): ${normalizedTokenName}`)
    console.log(`  Contains 'radius': ${normalizedTokenName.includes('radius')}`)
    console.log(`  Contains 'padding': ${normalizedTokenName.includes('padding')}`)
  }
  
  return finalConfidence
}

// Step 1: Unified value similarity calculation
function calculateValueSimilarity(figmaValue: string, tokenValue: string, propertyType: string): number {
  // Exact match always gets highest score
  if (figmaValue === tokenValue) {
    return 1.0
  }

  switch (propertyType) {
    case APP_CONFIG.TOKEN_TYPES.FILL:
    case APP_CONFIG.TOKEN_TYPES.STROKE:
      return calculateColorSimilarity(figmaValue, tokenValue)
    
    case APP_CONFIG.TOKEN_TYPES.TYPOGRAPHY:
    case APP_CONFIG.TOKEN_TYPES.FONT_FAMILY:
      return calculateStringSimilarity(figmaValue.toLowerCase(), tokenValue.toLowerCase())
    
    case APP_CONFIG.TOKEN_TYPES.SPACING:
    case APP_CONFIG.TOKEN_TYPES.PADDING:
    case APP_CONFIG.TOKEN_TYPES.BORDER_RADIUS:
    case APP_CONFIG.TOKEN_TYPES.FONT_SIZE:
    case APP_CONFIG.TOKEN_TYPES.FONT_WEIGHT:
    case APP_CONFIG.TOKEN_TYPES.DIMENSION:
      return calculateNumericSimilarity(figmaValue, tokenValue)
    
    default:
      return calculateStringSimilarity(figmaValue.toLowerCase(), tokenValue.toLowerCase())
  }
}

// Step 2: Unified property-token name alignment
export function calculatePropertyTokenNameAlignment(tokenName: string | undefined, propertyType: string): number {
  if (!tokenName) return 0.0
  
  // Extract the clean token name (remove set prefixes)
  const cleanTokenName = extractCleanTokenName(tokenName)
  const normalizedTokenName = cleanTokenName.toLowerCase()
  
  // Debug logging for specific cases
  if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
    console.log(`🔍 SEMANTIC ALIGNMENT DEBUG: ${tokenName} for ${propertyType}`)
    console.log(`  Full Token Name: ${tokenName}`)
    console.log(`  Clean Token Name: ${cleanTokenName}`)
    console.log(`  Normalized Token Name: ${normalizedTokenName}`)
  }
  
  // Define semantic keywords for each property type with priority levels
  const semanticKeywords: Record<string, { exact: string[], high: string[], medium: string[] }> = {
    [APP_CONFIG.TOKEN_TYPES.BORDER_RADIUS]: {
      exact: ['radius', 'radii', 'border-radius'],
      high: ['corner', 'rounded', 'borderradius'],
      medium: ['round', 'curve']
    },
    [APP_CONFIG.TOKEN_TYPES.SPACING]: {
      exact: ['spacing', 'space'],
      high: ['gap', 'margin', 'inset', 'outset'],
      medium: ['distance', 'separation']
    },
    [APP_CONFIG.TOKEN_TYPES.PADDING]: {
      exact: ['padding', 'pad'],
      high: ['inset', 'inner-spacing'],
      medium: ['internal', 'inside']
    },
    [APP_CONFIG.TOKEN_TYPES.FILL]: {
      exact: ['fill', 'background', 'bg'],
      high: ['color', 'colour', 'surface'],
      medium: ['tint', 'shade']
    },
    [APP_CONFIG.TOKEN_TYPES.STROKE]: {
      exact: ['stroke', 'border', 'outline'],
      high: ['line', 'edge'],
      medium: ['boundary', 'perimeter']
    },
    [APP_CONFIG.TOKEN_TYPES.TYPOGRAPHY]: {
      exact: ['typography', 'font', 'text'],
      high: ['type', 'heading', 'body', 'caption'],
      medium: ['letter', 'character']
    },
    [APP_CONFIG.TOKEN_TYPES.FONT_SIZE]: {
      exact: ['font-size', 'fontsize', 'size'],
      high: ['text-size', 'scale', 'fontscale'],
      medium: ['measure', 'dimension']
    },
    [APP_CONFIG.TOKEN_TYPES.FONT_FAMILY]: {
      exact: ['font-family', 'fontfamily', 'family'],
      high: ['font', 'typeface', 'fontface'],
      medium: ['type', 'text']
    },
    [APP_CONFIG.TOKEN_TYPES.FONT_WEIGHT]: {
      exact: ['font-weight', 'fontweight', 'weight'],
      high: ['bold', 'light', 'medium', 'heavy'],
      medium: ['thickness', 'density']
    },
  }

  const keywords = semanticKeywords[propertyType]
  if (!keywords) return 0.0
  
  // Perfect alignment: token name exactly matches property type
  if (normalizedTokenName === propertyType.toLowerCase()) {
    if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
      console.log(`  Perfect alignment: ${normalizedTokenName} === ${propertyType.toLowerCase()}`)
    }
    return 1.0
  }
  
  // Check for exact keyword matches (highest priority)
  for (const keyword of keywords.exact) {
    if (normalizedTokenName === keyword) {
      if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
        console.log(`  Exact keyword match: ${normalizedTokenName} === ${keyword}`)
      }
      return 0.95
    }
    // Check for semantic patterns with exact keywords
    if (normalizedTokenName.includes(`.${keyword}`) || normalizedTokenName.includes(`${keyword}.`)) {
      if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
        console.log(`  Semantic pattern match: ${normalizedTokenName} contains ${keyword}`)
      }
      return 0.9
    }
  }
  
  // Check for high priority keyword matches
  for (const keyword of keywords.high) {
    if (normalizedTokenName === keyword) {
      if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
        console.log(`  High priority keyword match: ${normalizedTokenName} === ${keyword}`)
      }
      return 0.85
    }
    if (normalizedTokenName.includes(`.${keyword}`) || normalizedTokenName.includes(`${keyword}.`)) {
      if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
        console.log(`  High priority pattern match: ${normalizedTokenName} contains ${keyword}`)
      }
      return 0.8
    }
    if (normalizedTokenName.includes(keyword)) {
      if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
        console.log(`  High priority contains match: ${normalizedTokenName} contains ${keyword}`)
      }
      return 0.7
    }
  }
  
  // Check for medium priority keyword matches
  for (const keyword of keywords.medium) {
    if (normalizedTokenName === keyword) {
      if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
        console.log(`  Medium priority keyword match: ${normalizedTokenName} === ${keyword}`)
      }
      return 0.6
    }
    if (normalizedTokenName.includes(`.${keyword}`) || normalizedTokenName.includes(`${keyword}.`)) {
      if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
        console.log(`  Medium priority pattern match: ${normalizedTokenName} contains ${keyword}`)
      }
      return 0.55
    }
    if (normalizedTokenName.includes(keyword)) {
      if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
        console.log(`  Medium priority contains match: ${normalizedTokenName} contains ${keyword}`)
      }
      return 0.5
    }
  }
  
  // Check for size qualifiers (xs, sm, md, lg, xl, etc.) - indicates semantic naming
  if (normalizedTokenName.match(/\.(xs|sm|md|lg|xl|xxs|xxl|2xl|3xl|4xl|5xl)$/)) {
    if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
      console.log(`  Size qualifier match: ${normalizedTokenName}`)
    }
    return 0.4
  }
  
  // Check for numeric patterns that suggest semantic naming
  if (normalizedTokenName.match(/\.(100|200|300|400|500|600|700|800|900)$/)) {
    if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
      console.log(`  Numeric pattern match: ${normalizedTokenName}`)
    }
    return 0.35
  }
  
  // Check for generic size-related terms
  const sizeTerms = ['size', 'width', 'height', 'value', 'amount', 'level', 'scale']
  for (const term of sizeTerms) {
    if (normalizedTokenName.includes(term)) {
      if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
        console.log(`  Size term match: ${normalizedTokenName} contains ${term}`)
      }
      return 0.3
    }
  }
  
  // Heavily penalize purely numeric or generic names
  if (normalizedTokenName.match(/^\d+$/) || normalizedTokenName.match(/\.\d+$/)) {
    if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
      console.log(`  Numeric penalty: ${normalizedTokenName}`)
    }
    return 0.1
  }
  
  // Check for base/core token patterns (should be deprioritized)
  if (normalizedTokenName.includes('base.') || normalizedTokenName.includes('core.') || 
      normalizedTokenName.includes('foundation.') || normalizedTokenName.includes('primitive.')) {
    if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
      console.log(`  Base token penalty: ${normalizedTokenName}`)
    }
    return 0.05
  }
  
  // No alignment
  if (propertyType === "border-radius" && (normalizedTokenName.includes("padding") || normalizedTokenName.includes("radius"))) {
    console.log(`  No alignment found: ${normalizedTokenName}`)
  }
  return 0.0
}

// Step 3: Clear, consistent confidence combination rules
function combineConfidenceScores(valueSimilarity: number, nameAlignment: number, isSemanticToken: boolean, isExactValueMatch: boolean): number {
  // NEW LOGIC: Implement the four-category scoring system
  
  // Category 1: Naming match + Value exact match = Highest score (0.95-1.0)
  if (nameAlignment >= 0.8 && isExactValueMatch) {
    let baseScore = 0.95
    if (isSemanticToken) {
      baseScore += 0.05 // Boost for semantic tokens
    }
    return Math.min(1.0, baseScore)
  }
  
  // Category 2: Naming match + Value similar match = High score (0.8-0.94)
  if (nameAlignment >= 0.8 && !isExactValueMatch && valueSimilarity >= 0.9) {
    let baseScore = 0.8
    if (isSemanticToken) {
      baseScore += 0.1 // Boost for semantic tokens
    }
    // Reduce score based on how similar the value is
    const similarityPenalty = (1.0 - valueSimilarity) * 0.3
    return Math.max(0.8, baseScore - similarityPenalty)
  }
  
  // Category 3: Non-naming match + Value exact match = Medium score (0.7-0.89)
  if (nameAlignment < 0.8 && isExactValueMatch) {
    let baseScore = 0.7
    if (isSemanticToken) {
      baseScore += 0.15 // Boost for semantic tokens
    }
    // Add some credit for partial name alignment
    baseScore += nameAlignment * 0.1
    return Math.min(0.89, baseScore)
  }
  
  // Category 4: Non-naming match + Value similar match = Low score (0.4-0.69)
  if (nameAlignment < 0.8 && !isExactValueMatch && valueSimilarity >= 0.9) {
    let baseScore = 0.4
    if (isSemanticToken) {
      baseScore += 0.2 // Boost for semantic tokens
    }
    // Add credit for value similarity and partial name alignment
    baseScore += (valueSimilarity - 0.9) * 0.5 // Up to 0.05 additional
    baseScore += nameAlignment * 0.2 // Up to 0.16 additional
    return Math.min(0.69, baseScore)
  }
  
  // For all other cases (very low similarity or no semantic alignment), return low scores
  if (valueSimilarity >= 0.8) {
    let baseScore = 0.3
    if (isSemanticToken) {
      baseScore += 0.1
    }
    baseScore += nameAlignment * 0.1
    return Math.min(0.5, baseScore)
  }
  
  // Very low confidence for poor matches
  return Math.max(0.0, valueSimilarity * 0.2 + nameAlignment * 0.1)
}

// Helper functions for specific value types
function calculateColorSimilarity(figmaValue: string, tokenValue: string): number {
  const normalizedFigmaColor = normalizeColor(figmaValue)
  const normalizedTokenColor = normalizeColor(tokenValue)

  // Exact match gets perfect score
  if (normalizedFigmaColor === normalizedTokenColor) {
    return 1.0
  }

  // Check for similar colors using RGB distance
  const similarity = calculateColorDistance(normalizedFigmaColor, normalizedTokenColor)
  
  // Only return similarity if it's reasonably close (0.9+ similarity)
  // This ensures a clear distinction between exact matches (1.0) and similar matches (0.9-0.99)
  return similarity >= 0.9 ? similarity : 0.0
}

function calculateNumericSimilarity(figmaValue: string, tokenValue: string): number {
  const figmaNumber = Number.parseFloat(figmaValue.replace(/px|rem|em/, ""))
  const tokenNumber = Number.parseFloat(tokenValue.replace(/px|rem|em/, ""))

  if (isNaN(figmaNumber) || isNaN(tokenNumber)) {
    return 0.0
  }

  if (figmaNumber === tokenNumber) {
    return 1.0
  }

  // Calculate similarity based on percentage difference
  const difference = Math.abs(figmaNumber - tokenNumber)
  const average = (figmaNumber + tokenNumber) / 2
  const similarity = 1 - difference / average

  // Only return similarity if it's reasonably close
  return similarity > 0.8 ? similarity : 0.0
}

function calculateColorDistance(color1: string, color2: string): number {
  if (color1.length !== 7 || color2.length !== 7) return 0.0

  const r1 = Number.parseInt(color1.slice(1, 3), 16)
  const g1 = Number.parseInt(color1.slice(3, 5), 16)
  const b1 = Number.parseInt(color1.slice(5, 7), 16)

  const r2 = Number.parseInt(color2.slice(1, 3), 16)
  const g2 = Number.parseInt(color2.slice(3, 5), 16)
  const b2 = Number.parseInt(color2.slice(5, 7), 16)

  const distance = Math.sqrt(Math.pow(r2 - r1, 2) + Math.pow(g2 - g1, 2) + Math.pow(b2 - b1, 2))

  // Normalize distance (max distance is ~441 for RGB)
  return Math.max(0, 1 - distance / 441)
}

// Legacy function for backward compatibility
export function calculateSemanticNameBoost(tokenName: string, propertyType: string): number {
  return calculatePropertyTokenNameAlignment(tokenName, propertyType)
}
