import { APP_CONFIG } from "./constants"
import type { FigmaColor } from "./types"

export function rgbToHex(color: FigmaColor): string {
  const r = Math.round(color.r * 255)
  const g = Math.round(color.g * 255)
  const b = Math.round(color.b * 255)
  const a = color.a !== undefined ? Math.round(color.a * 255) : 255

  const hex = `${APP_CONFIG.COLOR_FORMATS.HEX_PREFIX}${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
  
  // Include alpha channel if not fully opaque
  if (a < 255) {
    return `${hex}${a.toString(16).padStart(2, "0")}`
  }
  
  return hex
}

export function normalizeColor(color: string): string {
  if (color.startsWith(APP_CONFIG.COLOR_FORMATS.HEX_PREFIX)) {
    return color.toLowerCase()
  }

  if (color.startsWith(APP_CONFIG.COLOR_FORMATS.RGB_PREFIX)) {
    const matches = color.match(/\d+/g)
    if (matches && matches.length >= 3) {
      const r = Number.parseInt(matches[0], 10)
      const g = Number.parseInt(matches[1], 10)
      const b = Number.parseInt(matches[2], 10)
      const a = matches.length >= 4 ? Number.parseInt(matches[3], 10) : 255
      
      const hex = `${APP_CONFIG.COLOR_FORMATS.HEX_PREFIX}${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
      
      // Include alpha channel if not fully opaque
      if (a < 255) {
        return `${hex}${a.toString(16).padStart(2, "0")}`
      }
      
      return hex
    }
  }

  return color.toLowerCase()
}
