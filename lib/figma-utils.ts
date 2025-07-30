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

// Function to determine the best ID to use for URL generation
export function getBestNodeIdForUrl(nodeId: string, componentId?: string, componentType?: string): string {
  // For component instances, try to use the componentId if available
  if (componentType === 'LOCAL_INSTANCE' || componentType === 'EXTERNAL_INSTANCE') {
    if (componentId) {
      console.log(`Using componentId for URL: ${componentId} (instead of nodeId: ${nodeId})`)
      return componentId
    }
  }
  
  // For local components, use the nodeId
  if (componentType === 'LOCAL_COMPONENT') {
    console.log(`Using nodeId for local component: ${nodeId}`)
    return nodeId
  }
  
  // Default to nodeId
  console.log(`Using default nodeId: ${nodeId}`)
  return nodeId
}

export function generateFigmaNodeUrl(baseUrl: string, nodeId: string, componentType?: string, componentId?: string): string {
  try {
    const url = new URL(baseUrl)
    
    // Determine the best ID to use for URL generation
    const bestNodeId = getBestNodeIdForUrl(nodeId, componentId, componentType)
    
    // Ensure we have a valid node ID
    if (!bestNodeId || bestNodeId.trim() === '') {
      console.warn('Empty nodeId provided to generateFigmaNodeUrl')
      return baseUrl
    }
    
    console.log(`Generating Figma URL for bestNodeId: ${bestNodeId}, componentType: ${componentType}`)
    
    // Encode the node ID properly for Figma URLs
    // Figma uses %3A as the separator for node IDs in URLs
    const encodedNodeId = bestNodeId.replace(/-/g, APP_CONFIG.FIGMA_API.NODE_SEPARATOR)
    
    console.log(`Encoded nodeId: ${encodedNodeId}`)
    
    // Set the node-id parameter
    url.searchParams.set("node-id", encodedNodeId)
    
    // Add additional parameters for better Figma navigation
    url.searchParams.set("p", "f") // Focus mode
    url.searchParams.set("t", "Ehm6iR2nFVZ17IBN-0") // Default view mode
    
    const finalUrl = url.toString()
    console.log(`Generated URL: ${finalUrl}`)
    
    return finalUrl
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
    
    // Add additional parameters for better Figma navigation
    url.searchParams.set("p", "f") // Focus mode
    url.searchParams.set("t", "Ehm6iR2nFVZ17IBN-0") // Default view mode
    
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
