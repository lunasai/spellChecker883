import { ERROR_MESSAGES } from "./constants"
import type { DesignToken, TokenValue, ResolvedToken, Theme } from "./types"

interface TokenSetInfo {
  name: string
  status: "enabled" | "source" | "disabled"
}

export function filterTokensBySelectedSets(tokens: DesignToken, selectedSets: string[]): DesignToken {
  const filteredTokens: DesignToken = {}

  for (const setName of selectedSets) {
    if (tokens[setName]) {
      filteredTokens[setName] = tokens[setName]
    }
  }

  return filteredTokens
}

export function resolveTokensWithSemantics(tokens: DesignToken): Record<string, ResolvedToken> {
  console.log("Starting token resolution...")

  // Extract theme information if available
  const themes = extractThemes(tokens)
  const defaultTheme = themes.length > 0 ? themes[0] : null

  console.log(
    "Available themes:",
    themes.map((t) => t.name),
  )
  console.log("Using theme:", defaultTheme?.name || "No theme")

  // Determine which token sets are available for resolution
  const availableTokenSets = defaultTheme
    ? getAvailableTokenSets(tokens, defaultTheme)
    : Object.keys(tokens).filter((key) => !key.startsWith("$"))

  console.log("Available token sets for resolution:", availableTokenSets)

  // Collect all tokens with their set context
  const allTokens: Record<string, { value: TokenValue; setName: string; fullPath: string }> = {}

  for (const setName of availableTokenSets) {
    if (tokens[setName] && typeof tokens[setName] === "object" && !("$value" in tokens[setName])) {
      collectAllTokensWithContext(tokens[setName] as DesignToken, allTokens, "", setName)
    }
  }

  console.log(`Total collected tokens: ${Object.keys(allTokens).length}`)

  // Resolve all token references
  const resolvedTokens: Record<string, ResolvedToken> = {}

  for (const tokenPath of Object.keys(allTokens)) {
    const resolved = resolveTokenReferenceWithContext(tokenPath, allTokens, resolvedTokens)
    if (resolved) {
      resolvedTokens[tokenPath] = resolved
    }
  }

  console.log(`Successfully resolved tokens: ${Object.keys(resolvedTokens).length}`)
  console.log(`Semantic tokens: ${Object.values(resolvedTokens).filter((t) => t.isReference).length}`)

  return resolvedTokens
}

export function resolveTokensWithTheme(tokens: DesignToken, theme: Theme): Record<string, ResolvedToken> {
  console.log(`Starting token resolution with theme: ${theme.name}`)

  // Determine which token sets are available for this theme
  const availableTokenSets = getAvailableTokenSets(tokens, theme)

  console.log("Available token sets for theme:", availableTokenSets)

  // Collect all tokens with their set context
  const allTokens: Record<string, { value: TokenValue; setName: string; fullPath: string }> = {}

  for (const setName of availableTokenSets) {
    if (tokens[setName] && typeof tokens[setName] === "object" && !("$value" in tokens[setName])) {
      collectAllTokensWithContext(tokens[setName] as DesignToken, allTokens, "", setName)
    }
  }

  console.log(`Total collected tokens: ${Object.keys(allTokens).length}`)

  // Resolve all token references
  const resolvedTokens: Record<string, ResolvedToken> = {}

  for (const tokenPath of Object.keys(allTokens)) {
    const resolved = resolveTokenReferenceWithContext(tokenPath, allTokens, resolvedTokens)
    if (resolved) {
      resolvedTokens[tokenPath] = resolved
    }
  }

  console.log(`Successfully resolved tokens: ${Object.keys(resolvedTokens).length}`)
  console.log(`Semantic tokens: ${Object.values(resolvedTokens).filter((t) => t.isReference).length}`)

  return resolvedTokens
}

export function extractThemes(tokens: DesignToken): Theme[] {
  const themes: Theme[] = []

  if (tokens.$themes && Array.isArray(tokens.$themes)) {
    for (const theme of tokens.$themes) {
      if (theme.id && theme.name && theme.selectedTokenSets) {
        themes.push({
          id: theme.id,
          name: theme.name,
          selectedTokenSets: theme.selectedTokenSets,
        })
      }
    }
  }

  return themes
}

function getAvailableTokenSets(tokens: DesignToken, theme: Theme): string[] {
  const availableSets: string[] = []

  // First, add sets from theme configuration if available
  for (const [setName, status] of Object.entries(theme.selectedTokenSets)) {
    if ((status === "enabled" || status === "source") && tokens[setName]) {
      availableSets.push(setName)
    }
  }

  // Then, add all other non-metadata sets to ensure semantic tokens are included
  const allSets = Object.keys(tokens).filter((key) => !key.startsWith("$"))
  for (const setName of allSets) {
    if (!availableSets.includes(setName)) {
      availableSets.push(setName)
    }
  }

  return availableSets
}

function collectAllTokensWithContext(
  tokens: DesignToken,
  allTokens: Record<string, { value: TokenValue; setName: string; fullPath: string }>,
  prefix = "",
  setName = "",
): void {
  for (const [key, value] of Object.entries(tokens)) {
    if (value && typeof value === "object") {
      const tokenValue = (value as TokenValue).$value ?? (value as TokenValue).value
      const tokenType = (value as TokenValue).$type ?? (value as TokenValue).type

      if (tokenValue !== undefined) {
        const fullPath = prefix ? `${prefix}.${key}` : key
        
        // Store with set prefix for cross-set references and to maintain full context
        const tokenKey = setName ? `${setName}.${fullPath}` : fullPath
        allTokens[tokenKey] = {
          value: value as TokenValue,
          setName,
          fullPath,
        }
      } else {
        const newPrefix = prefix ? `${prefix}.${key}` : key
        collectAllTokensWithContext(value as DesignToken, allTokens, newPrefix, setName)
      }
    }
  }
}

function resolveTokenReferenceWithContext(
  tokenPath: string,
  allTokens: Record<string, { value: TokenValue; setName: string; fullPath: string }>,
  resolvedTokens: Record<string, ResolvedToken>,
  visitedPaths: Set<string> = new Set(),
  referenceChain: string[] = [],
): ResolvedToken | null {
  // Check for circular references
  if (visitedPaths.has(tokenPath)) {
    console.warn(`${ERROR_MESSAGES.CIRCULAR_REFERENCE}: ${tokenPath}`)
    return null
  }

  // Return already resolved token
  if (resolvedTokens[tokenPath]) {
    return resolvedTokens[tokenPath]
  }

  const tokenData = allTokens[tokenPath]
  if (!tokenData) {
    console.warn(`Token not found: ${tokenPath}`)
    return null
  }

  const rawValue = tokenData.value.$value ?? tokenData.value.value
  const tokenType = tokenData.value.$type ?? tokenData.value.type

  if (rawValue === undefined) {
    return null
  }

  visitedPaths.add(tokenPath)

  const stringValue = String(rawValue)
  const referencePattern = /\{([^}]+)\}/g
  const references = [...stringValue.matchAll(referencePattern)]

  if (references.length > 0) {
    // This is a semantic token with references
    let resolvedValue = stringValue
    const newReferenceChain = [...referenceChain]

    for (const match of references) {
      const referencePath = match[1]
      newReferenceChain.push(referencePath)

      // Try to resolve the reference
      const referencedToken = findAndResolveReference(
        referencePath,
        allTokens,
        resolvedTokens,
        new Set(visitedPaths),
        newReferenceChain,
      )

      if (referencedToken) {
        resolvedValue = resolvedValue.replace(match[0], referencedToken.value)

        // Add the referenced token's chain to our chain
        if (referencedToken.referenceChain) {
          newReferenceChain.push(...referencedToken.referenceChain)
        }
      } else {
        console.warn(`Could not resolve reference: ${referencePath} in token: ${tokenPath}`)
        // Keep the original reference if we can't resolve it
        resolvedValue = resolvedValue.replace(match[0], match[0])
      }
    }

    const result: ResolvedToken = {
      value: resolvedValue,
      isReference: true,
      originalReference: stringValue,
      referenceChain: [...new Set(newReferenceChain)],
      tokenType: String(tokenType),
    }

    resolvedTokens[tokenPath] = result
    return result
  } else {
    // This is a raw token (no references)
    const result: ResolvedToken = {
      value: stringValue,
      isReference: false,
      tokenType: String(tokenType),
    }

    resolvedTokens[tokenPath] = result
    return result
  }
}

function findAndResolveReference(
  referencePath: string,
  allTokens: Record<string, { value: TokenValue; setName: string; fullPath: string }>,
  resolvedTokens: Record<string, ResolvedToken>,
  visitedPaths: Set<string>,
  referenceChain: string[],
): ResolvedToken | null {
  // Try direct path first
  if (allTokens[referencePath]) {
    return resolveTokenReferenceWithContext(referencePath, allTokens, resolvedTokens, visitedPaths, referenceChain)
  }

  // Try to find the reference in any available token set
  const possiblePaths = Object.keys(allTokens).filter((path) => {
    // Check if the path ends with the reference path
    return path.endsWith(`.${referencePath}`) || path === referencePath
  })

  // Sort by preference: exact match first, then by set priority
  possiblePaths.sort((a, b) => {
    if (a === referencePath) return -1
    if (b === referencePath) return 1

    // Prefer base/source sets for references
    const aIsBase = a.includes("Base") || a.includes("00 ")
    const bIsBase = b.includes("Base") || b.includes("00 ")

    if (aIsBase && !bIsBase) return -1
    if (!aIsBase && bIsBase) return 1

    return a.localeCompare(b)
  })

  for (const possiblePath of possiblePaths) {
    const resolved = resolveTokenReferenceWithContext(
      possiblePath,
      allTokens,
      resolvedTokens,
      visitedPaths,
      referenceChain,
    )

    if (resolved) {
      return resolved
    }
  }

  return null
}

export function extractTokenSets(tokensData: any): string[] {
  const tokenSets: string[] = []

  for (const [key, value] of Object.entries(tokensData)) {
    // Skip metadata keys
    if (key.startsWith("$")) {
      continue
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (hasNestedTokens(value)) {
        tokenSets.push(key)
      }
    }
  }

  return tokenSets
}

function hasNestedTokens(obj: any): boolean {
  for (const [, value] of Object.entries(obj)) {
    if (value && typeof value === "object") {
      if (("$value" in value || "value" in value) && ("$type" in value || "type" in value)) {
        return true
      }
      if (hasNestedTokens(value)) {
        return true
      }
    }
  }
  return false
}

export function extractCleanTokenName(tokenPath: string): string {
  // Remove set name prefix if present (e.g., "01 Size, space and Radii.radius.full" -> "radius.full")
  const parts = tokenPath.split(".")
  if (parts.length > 1) {
    // Check if the first part looks like a set name (contains spaces or special characters)
    const firstPart = parts[0]
    if (firstPart.includes(" ") || firstPart.includes("/") || /^\d+/.test(firstPart)) {
      // Remove the set name and return the rest
      return parts.slice(1).join(".")
    }
  }
  return tokenPath
}
