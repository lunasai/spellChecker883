import { Badge } from "@/components/ui/badge"
import { APP_CONFIG, UI_LABELS } from "@/lib/constants"
import { Palette, Type, BracketsIcon as Spacing, CornerUpRight } from "lucide-react"
import type { ReactElement } from "react"

export function getTypeIcon(type: string) {
  const iconMap: Record<string, ReactElement> = {
    [APP_CONFIG.TOKEN_TYPES.FILL]: <Palette className="w-4 h-4" />,
    [APP_CONFIG.TOKEN_TYPES.STROKE]: <Palette className="w-4 h-4" />,
    [APP_CONFIG.TOKEN_TYPES.TYPOGRAPHY]: <Type className="w-4 h-4" />,
    [APP_CONFIG.TOKEN_TYPES.SPACING]: <Spacing className="w-4 h-4" />,
    [APP_CONFIG.TOKEN_TYPES.PADDING]: <Spacing className="w-4 h-4" />,
    [APP_CONFIG.TOKEN_TYPES.BORDER_RADIUS]: <CornerUpRight className="w-4 h-4" />,
  }

  return iconMap[type] || null
}

export function getConfidenceBadgeColor(confidence: number): string {
  if (confidence >= APP_CONFIG.CONFIDENCE_THRESHOLDS.HIGH) {
    return "bg-green-100 text-green-800 border-green-300"
  }
  if (confidence >= APP_CONFIG.CONFIDENCE_THRESHOLDS.MEDIUM) {
    return "bg-orange-100 text-orange-800 border-orange-300"
  }
  return "bg-red-100 text-red-800 border-red-300"
}

export function getMatchBorderColor(confidence: number): string {
  if (confidence >= APP_CONFIG.CONFIDENCE_THRESHOLDS.HIGH) return "border-green-400"
  if (confidence >= APP_CONFIG.CONFIDENCE_THRESHOLDS.MEDIUM) return "border-orange-400"
  return "border-red-400"
}

export function getMatchFillColor(confidence: number): string {
  if (confidence >= APP_CONFIG.CONFIDENCE_THRESHOLDS.HIGH) return "bg-green-50"
  if (confidence >= APP_CONFIG.CONFIDENCE_THRESHOLDS.MEDIUM) return "bg-orange-50"
  return "bg-red-50"
}

export function getPropertyDisplayName(type: string): string {
  const displayNames: Record<string, string> = {
    [APP_CONFIG.TOKEN_TYPES.FILL]: "FILL",
    [APP_CONFIG.TOKEN_TYPES.STROKE]: "STROKE",
    [APP_CONFIG.TOKEN_TYPES.TYPOGRAPHY]: "TEXT STYLE",
    [APP_CONFIG.TOKEN_TYPES.SPACING]: "SPACING",
    [APP_CONFIG.TOKEN_TYPES.PADDING]: "PADDING",
    [APP_CONFIG.TOKEN_TYPES.BORDER_RADIUS]: "CORNER RADIUS",
  }

  return displayNames[type] || type.toUpperCase()
}

interface ConfidenceBadgeProps {
  confidence: number
  label?: string
}

export function ConfidenceBadge({ confidence, label }: ConfidenceBadgeProps) {
  return (
    <Badge variant="outline" className={`text-xs px-2 py-0.5 ${getConfidenceBadgeColor(confidence)}`}>
      {label || `${Math.round(confidence * 100)}%`}
    </Badge>
  )
}

interface SemanticTokenBadgeProps {
  className?: string
}

export function SemanticTokenBadge({ className = "" }: SemanticTokenBadgeProps) {
  return (
    <Badge variant="outline" className={`bg-blue-100 text-blue-800 border-blue-300 text-xs font-bold ${className}`}>
      {UI_LABELS.SEMANTIC}
    </Badge>
  )
}

interface UnmatchedBadgeProps {
  className?: string
}

export function UnmatchedBadge({ className = "" }: UnmatchedBadgeProps) {
  return (
    <Badge variant="destructive" className={`text-xs ${className}`}>
      {UI_LABELS.UNMATCHED}
    </Badge>
  )
}
