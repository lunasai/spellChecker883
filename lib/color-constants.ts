// Consistent color scheme for all visualizations
export const VISUALIZATION_COLORS = {
  // Status colors - used across all visualizations
  STATUS: {
    TOKENIZED: {
      primary: '#10B981', // green-500
      light: '#D1FAE5',   // green-100
      dark: '#059669',    // green-600
      text: '#065F46',    // green-800
      border: '#6EE7B7',  // green-300
    },
    MATCHED: {
      primary: '#3B82F6', // blue-500
      light: '#DBEAFE',   // blue-100
      dark: '#2563EB',    // blue-600
      text: '#1E40AF',    // blue-800
      border: '#93C5FD',  // blue-300
    },
    NEEDS_ATTENTION: {
      primary: '#F59E0B', // amber-500
      light: '#FEF3C7',   // amber-100
      dark: '#D97706',    // amber-600
      text: '#92400E',    // amber-800
      border: '#FCD34D',  // amber-300
    },
    ISSUES: {
      primary: '#F59E0B', // amber-500 (same as needs_attention)
      light: '#FEF3C7',   // amber-100
      dark: '#D97706',    // amber-600
      text: '#92400E',    // amber-800
      border: '#FCD34D',  // amber-300
    },
  },
  
  // Confidence levels - used for match confidence badges
  CONFIDENCE: {
    HIGH: {
      primary: '#10B981', // green-500
      light: '#D1FAE5',   // green-100
      dark: '#059669',    // green-600
      text: '#065F46',    // green-800
      border: '#6EE7B7',  // green-300
    },
    MEDIUM: {
      primary: '#F59E0B', // amber-500
      light: '#FEF3C7',   // amber-100
      dark: '#D97706',    // amber-600
      text: '#92400E',    // amber-800
      border: '#FCD34D',  // amber-300
    },
    LOW: {
      primary: '#EF4444', // red-500
      light: '#FEE2E2',   // red-100
      dark: '#DC2626',    // red-600
      text: '#991B1B',    // red-800
      border: '#FCA5A5',  // red-300
    },
  },
  
  // Token type colors - used for issue categorization
  TOKEN_TYPES: {
    fill: {
      primary: '#EF4444', // red-500
      light: '#FEE2E2',   // red-100
      dark: '#DC2626',    // red-600
      text: '#991B1B',    // red-800
      border: '#FCA5A5',  // red-300
    },
    stroke: {
      primary: '#F59E0B', // amber-500
      light: '#FEF3C7',   // amber-100
      dark: '#D97706',    // amber-600
      text: '#92400E',    // amber-800
      border: '#FCD34D',  // amber-300
    },
    spacing: {
      primary: '#3B82F6', // blue-500
      light: '#DBEAFE',   // blue-100
      dark: '#2563EB',    // blue-600
      text: '#1E40AF',    // blue-800
      border: '#93C5FD',  // blue-300
    },
    padding: {
      primary: '#8B5CF6', // violet-500
      light: '#EDE9FE',   // violet-100
      dark: '#7C3AED',    // violet-600
      text: '#5B21B6',    // violet-800
      border: '#C4B5FD',  // violet-300
    },
    typography: {
      primary: '#10B981', // green-500
      light: '#D1FAE5',   // green-100
      dark: '#059669',    // green-600
      text: '#065F46',    // green-800
      border: '#6EE7B7',  // green-300
    },
    'border-radius': {
      primary: '#F59E0B', // amber-500
      light: '#FEF3C7',   // amber-100
      dark: '#D97706',    // amber-600
      text: '#92400E',    // amber-800
      border: '#FCD34D',  // amber-300
    },
  },
  
  // Neutral colors
  NEUTRAL: {
    background: '#F9FAFB', // gray-50
    border: '#E5E7EB',     // gray-200
    text: '#374151',       // gray-700
    textLight: '#6B7280',  // gray-500
  },
} as const

// Helper functions to get consistent colors
export function getStatusColor(status: 'tokenized' | 'matched' | 'needs_attention' | 'issues') {
  return VISUALIZATION_COLORS.STATUS[status.toUpperCase() as keyof typeof VISUALIZATION_COLORS.STATUS]
}

export function getConfidenceColor(confidence: number) {
  if (confidence >= 0.8) return VISUALIZATION_COLORS.CONFIDENCE.HIGH
  if (confidence >= 0.6) return VISUALIZATION_COLORS.CONFIDENCE.MEDIUM
  return VISUALIZATION_COLORS.CONFIDENCE.LOW
}

export function getTokenTypeColor(type: string) {
  const typeKey = type as keyof typeof VISUALIZATION_COLORS.TOKEN_TYPES
  return VISUALIZATION_COLORS.TOKEN_TYPES[typeKey] || VISUALIZATION_COLORS.STATUS.ISSUES
} 