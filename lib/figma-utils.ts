import { APP_CONFIG } from "./constants"

export function generateFigmaFrameUrl(baseUrl: string, frameId: string): string {
  try {
    const url = new URL(baseUrl)
    const encodedFrameId = frameId.replace(/-/g, APP_CONFIG.FIGMA_API.NODE_SEPARATOR)
    url.searchParams.set("node-id", encodedFrameId)
    return url.toString()
  } catch {
    return baseUrl
  }
}

export function generateFigmaNodeUrl(baseUrl: string, nodeId: string): string {
  try {
    const url = new URL(baseUrl)
    
    // Ensure we have a valid node ID
    if (!nodeId || nodeId.trim() === '') {
      return baseUrl
    }
    
    // Encode the node ID properly for Figma URLs
    // Figma uses %3A as the separator for node IDs in URLs
    const encodedNodeId = nodeId.replace(/-/g, APP_CONFIG.FIGMA_API.NODE_SEPARATOR)
    
    // Set the node-id parameter
    url.searchParams.set("node-id", encodedNodeId)
    
    // For component instances, we might also need to ensure we're targeting the right view
    // Some component instances might need additional parameters, but the basic node-id should work
    
    return url.toString()
  } catch (error) {
    console.warn('Failed to generate Figma node URL:', error)
    return baseUrl
  }
}

// Enhanced function specifically for component instances
export function generateFigmaComponentUrl(baseUrl: string, nodeId: string): string {
  try {
    const url = new URL(baseUrl)
    
    if (!nodeId || nodeId.trim() === '') {
      return baseUrl
    }
    
    // For component instances, we use the same encoding as regular nodes
    const encodedNodeId = nodeId.replace(/-/g, APP_CONFIG.FIGMA_API.NODE_SEPARATOR)
    
    // Set the node-id parameter
    url.searchParams.set("node-id", encodedNodeId)
    
    // Component instances should work with the same URL structure
    // The key is ensuring the node-id is properly encoded
    
    return url.toString()
  } catch (error) {
    console.warn('Failed to generate Figma component URL:', error)
    return baseUrl
  }
}

export function extractFileIdFromUrl(figmaUrl: string): string | null {
  const fileIdPattern = /\/(file|design)\/([a-zA-Z0-9]+)/
  const match = figmaUrl.match(fileIdPattern)
  return match ? match[2] : null
}

export type { FrameAnalysis } from "./types"
