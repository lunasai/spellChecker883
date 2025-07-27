// Application constants
export const APP_CONFIG = {
  CONFIDENCE_THRESHOLDS: {
    HIGH: 0.9,
    MEDIUM: 0.7,
    LOW: 0.5,
  },
  MATCH_LIMITS: {
    MAX_SUGGESTIONS: 2,
    MAX_ALTERNATIVES: 3,
  },
  SEMANTIC_PRIORITY: {
    // Boost values for semantic token matching
    SEMANTIC_BOOST: 0.15,
    SEMANTIC_PATTERN_BOOST: 0.12,
    SIZE_QUALIFIER_BOOST: 0.03,
    NUMERIC_PENALTY: 0.05,
    // Minimum confidence difference to override semantic preference
    MIN_CONFIDENCE_DIFFERENCE: 0.01,
  },
  COLOR_FORMATS: {
    HEX_PREFIX: "#",
    RGB_PREFIX: "rgb",
  },
  TOKEN_TYPES: {
    FILL: "fill",
    STROKE: "stroke",
    SPACING: "spacing",
    PADDING: "padding",
    TYPOGRAPHY: "typography",
    BORDER_RADIUS: "border-radius",
    FONT_SIZE: "font-size",
    FONT_FAMILY: "font-family",
    FONT_WEIGHT: "font-weight",
    DIMENSION: "dimension",
  },
  FIGMA_API: {
    BASE_URL: "https://api.figma.com/v1",
    NODE_SEPARATOR: "%3A",
  },
} as const

export const ERROR_MESSAGES = {
  MISSING_FIELDS: "Missing required fields",
  INVALID_JSON: "Invalid JSON format in tokens file",
  INVALID_FIGMA_URL: "Invalid Figma URL",
  FIGMA_FETCH_FAILED: "Failed to fetch Figma file",
  ANALYSIS_FAILED: "Analysis failed",
  EMPTY_FILE: "The uploaded file is empty",
  INVALID_FILE_FORMAT: "Invalid tokens file format - must be a JSON object",
  INVALID_FILE_TYPE: "Please upload a valid JSON file",
  NO_THEME_SELECTED: "Please select a theme for analysis",
  CIRCULAR_REFERENCE: "Circular reference detected",
} as const

export const UI_LABELS = {
  SEMANTIC: "SEMANTIC",
  UNMATCHED: "UNMATCHED",
  RECOMMENDED_TOKEN: "RECOMMENDED TOKEN",
  NO_TOKEN_MATCH: "NO TOKEN MATCH",
  ALTERNATIVE: "ALTERNATIVE",
} as const
