import { APP_CONFIG } from "./constants"
import { normalizeColor } from "./color-utils"
import { calculateStringSimilarity } from "./string-utils"

export function calculateMatchConfidence(
  figmaValue: string,
  tokenValue: string,
  type: string,
  isSemanticToken = false,
  tokenName?: string,
): number {
  // Exact match gets highest confidence
  if (figmaValue === tokenValue) {
    return isSemanticToken ? 1.0 : 0.98 // Slight preference for semantic tokens
  }

  // Color matching (fill and stroke)
  if (type === APP_CONFIG.TOKEN_TYPES.FILL || type === APP_CONFIG.TOKEN_TYPES.STROKE) {
    return calculateColorConfidence(figmaValue, tokenValue, isSemanticToken, tokenName)
  }

  // Numeric value matching (spacing, typography, border-radius)
  if (isNumericType(type)) {
    return calculateNumericConfidence(figmaValue, tokenValue, isSemanticToken, tokenName, type)
  }

  // String similarity for font families, etc.
  if (type === APP_CONFIG.TOKEN_TYPES.TYPOGRAPHY && isStringValue(figmaValue) && isStringValue(tokenValue)) {
    const similarity = calculateStringSimilarity(figmaValue.toLowerCase(), tokenValue.toLowerCase())
    if (similarity > 0.8) {
      return isSemanticToken ? similarity * 0.95 : similarity * 0.9
    }
  }

  return 0
}

function calculateColorConfidence(figmaValue: string, tokenValue: string, isSemanticToken: boolean, tokenName?: string): number {
  const normalizedFigmaColor = normalizeColor(figmaValue)
  const normalizedTokenColor = normalizeColor(tokenValue)

  if (normalizedFigmaColor === normalizedTokenColor) {
    return isSemanticToken ? 0.98 : 0.95 // Prefer semantic tokens for exact color matches
  }

  // Check for similar colors (for slight variations)
  const similarity = calculateColorSimilarity(normalizedFigmaColor, normalizedTokenColor)
  if (similarity > 0.9) {
    return isSemanticToken ? similarity * 0.9 : similarity * 0.85
  }

  return 0
}

function calculateNumericConfidence(
  figmaValue: string, 
  tokenValue: string, 
  isSemanticToken: boolean, 
  tokenName?: string,
  type?: string
): number {
  const figmaNumber = Number.parseFloat(figmaValue.replace(/px|rem|em/, ""))
  const tokenNumber = Number.parseFloat(tokenValue.replace(/px|rem|em/, ""))

  if (isNaN(figmaNumber) || isNaN(tokenNumber)) {
    return 0
  }

  let baseConfidence = 0

  if (figmaNumber === tokenNumber) {
    baseConfidence = isSemanticToken ? 0.98 : 0.95
  } else {
  const difference = Math.abs(figmaNumber - tokenNumber)
  const average = (figmaNumber + tokenNumber) / 2
  const similarity = 1 - difference / average

  if (similarity > 0.9) {
      baseConfidence = isSemanticToken ? similarity * 0.9 : similarity * 0.85
    } else if (similarity > 0.8) {
      baseConfidence = isSemanticToken ? similarity * 0.8 : similarity * 0.75
    } else if (similarity > APP_CONFIG.CONFIDENCE_THRESHOLDS.MEDIUM) {
      baseConfidence = isSemanticToken ? similarity * 0.7 : similarity * 0.65
    } else {
      return 0
    }
  }

  // Apply semantic name matching boost if token name is provided
  if (tokenName && type) {
    const semanticBoost = calculateSemanticNameBoost(tokenName, type)
    if (semanticBoost > 0) {
      // Boost confidence by up to 0.1 for semantically matching names
      const boostedConfidence = Math.min(1.0, baseConfidence + semanticBoost)
      console.log(`Semantic boost applied: ${tokenName} (${type}) +${semanticBoost.toFixed(3)} → ${boostedConfidence.toFixed(3)}`)
      return boostedConfidence
    }
  }

  return baseConfidence
}

function calculateSemanticNameBoost(tokenName: string, propertyType: string): number {
  const normalizedTokenName = tokenName.toLowerCase()
  
  // Define semantic keywords for each property type
  const semanticKeywords: Record<string, string[]> = {
    [APP_CONFIG.TOKEN_TYPES.BORDER_RADIUS]: ['radius', 'radii', 'border-radius', 'corner', 'rounded'],
    [APP_CONFIG.TOKEN_TYPES.SPACING]: ['spacing', 'space', 'gap', 'margin', 'inset', 'outset'],
    [APP_CONFIG.TOKEN_TYPES.PADDING]: ['padding', 'pad', 'inset'],
    [APP_CONFIG.TOKEN_TYPES.FILL]: ['fill', 'background', 'bg', 'color', 'colour'],
    [APP_CONFIG.TOKEN_TYPES.STROKE]: ['stroke', 'border', 'outline'],
    [APP_CONFIG.TOKEN_TYPES.TYPOGRAPHY]: ['font', 'text', 'typography', 'type', 'heading', 'body', 'caption'],
    [APP_CONFIG.TOKEN_TYPES.FONT_SIZE]: ['font-size', 'fontsize', 'size', 'text-size', 'scale'],
    [APP_CONFIG.TOKEN_TYPES.FONT_FAMILY]: ['font-family', 'fontfamily', 'family', 'font', 'typeface'],
    [APP_CONFIG.TOKEN_TYPES.FONT_WEIGHT]: ['font-weight', 'fontweight', 'weight', 'bold', 'light', 'medium'],
  }

  const keywords = semanticKeywords[propertyType] || []
  
  // Check if any keyword is present in the token name
  for (const keyword of keywords) {
    if (normalizedTokenName.includes(keyword)) {
      // Return a boost based on how well the name matches
      // Exact keyword match gets higher boost than partial match
      if (normalizedTokenName === keyword) {
        return 0.1 // Maximum boost for exact keyword match
      } else if (normalizedTokenName.includes(`.${keyword}`) || normalizedTokenName.includes(`${keyword}.`)) {
        return 0.08 // High boost for keyword as part of path
      } else {
        return 0.05 // Moderate boost for keyword presence
      }
    }
  }

  return 0 // No semantic match
}

function calculateColorSimilarity(color1: string, color2: string): number {
  // Simple hex color similarity - could be enhanced with more sophisticated color distance
  if (color1.length !== 7 || color2.length !== 7) return 0

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

function isNumericType(type: string): boolean {
  return [
    APP_CONFIG.TOKEN_TYPES.SPACING,
    APP_CONFIG.TOKEN_TYPES.PADDING,
    APP_CONFIG.TOKEN_TYPES.BORDER_RADIUS,
    APP_CONFIG.TOKEN_TYPES.TYPOGRAPHY,
    APP_CONFIG.TOKEN_TYPES.FONT_SIZE,
    APP_CONFIG.TOKEN_TYPES.FONT_WEIGHT,
    APP_CONFIG.TOKEN_TYPES.DIMENSION,
  ].includes(type as any)
}

function isStringValue(value: string): boolean {
  return typeof value === "string"
}
