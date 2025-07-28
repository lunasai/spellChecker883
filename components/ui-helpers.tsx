import { Badge } from "@/components/ui/badge"
import { APP_CONFIG, UI_LABELS } from "@/lib/constants"
import { getConfidenceColor, VISUALIZATION_COLORS } from "@/lib/color-constants"
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
  const colors = getConfidenceColor(confidence)
  return `bg-[${colors.light}] text-[${colors.text}] border-[${colors.border}]`
}

export function getMatchBorderColor(confidence: number): string {
  const colors = getConfidenceColor(confidence)
  return `border-[${colors.primary}]`
}

export function getMatchFillColor(confidence: number): string {
  const colors = getConfidenceColor(confidence)
  return `bg-[${colors.light}]`
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
    <Badge 
      variant="outline" 
      className={`text-xs font-bold ${className}`}
      style={{
        backgroundColor: VISUALIZATION_COLORS.STATUS.MATCHED.light,
        color: VISUALIZATION_COLORS.STATUS.MATCHED.text,
        borderColor: VISUALIZATION_COLORS.STATUS.MATCHED.border
      }}
    >
      {UI_LABELS.SEMANTIC}
    </Badge>
  )
}

interface UnmatchedBadgeProps {
  className?: string
}

export function UnmatchedBadge({ className = "" }: UnmatchedBadgeProps) {
  return (
    <Badge 
      variant="outline" 
      className={`text-xs ${className}`}
      style={{
        backgroundColor: VISUALIZATION_COLORS.STATUS.ISSUES.light,
        color: VISUALIZATION_COLORS.STATUS.ISSUES.text,
        borderColor: VISUALIZATION_COLORS.STATUS.ISSUES.border
      }}
    >
      {UI_LABELS.UNMATCHED}
    </Badge>
  )
}
