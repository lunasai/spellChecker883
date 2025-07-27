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
    const encodedNodeId = nodeId.replace(/-/g, APP_CONFIG.FIGMA_API.NODE_SEPARATOR)
    url.searchParams.set("node-id", encodedNodeId)
    return url.toString()
  } catch {
    return baseUrl
  }
}

export function extractFileIdFromUrl(figmaUrl: string): string | null {
  const fileIdPattern = /\/(file|design)\/([a-zA-Z0-9]+)/
  const match = figmaUrl.match(fileIdPattern)
  return match ? match[2] : null
}

export type { FrameAnalysis } from "./types"
