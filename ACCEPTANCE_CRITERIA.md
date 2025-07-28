# Design Token Audit Tool - Acceptance Criteria

## Overview
The Design Token Audit Tool is a web application that analyzes Figma files to identify hardcoded design values and match them with design tokens from a JSON file. It provides detailed insights into tokenization status, suggests token matches, and offers recommendations for improving design system consistency.

## Core Functionality Acceptance Criteria

### 0. Advanced Core Capabilities

**AC-0.1: Universal JSON Token File Compatibility**
- **Given** any design tokens JSON file regardless of structure, naming, or organization
- **When** the file is uploaded and processed
- **Then** the system should:
  - **Flexible Structure Parsing**: Handle any JSON object structure with unlimited nesting depth
  - **Adaptive Token Detection**: Automatically identify token sets by detecting nested objects with token properties
  - **Multi-Format Support**: Support both `$value`/`$type` and `value`/`type` property formats
  - **Cross-Set References**: Resolve semantic token references across different token sets
  - **Theme Integration**: Automatically detect and parse theme configurations from `$themes` arrays
  - **Reference Resolution**: Handle complex semantic token references like `{Base.color.primary}` → `#007AFF`
  - **Circular Reference Detection**: Identify and handle circular token references gracefully
  - **Full Path Preservation**: Maintain complete token paths for accurate cross-set resolution

**AC-0.2: Intelligent Figma Tokenization Detection**
- **Given** any Figma file with complex design systems and mixed tokenization approaches
- **When** analyzing each element's properties
- **Then** the system should:
  - **Multi-Mechanism Detection**: Identify tokenized properties through:
    - Figma Variables (`boundVariables` for colors, typography, spacing, etc.)
    - Figma Styles (TEXT, FILL, EFFECT, GRID style references)
    - Component Inheritance (properties inherited from component definitions)
    - Style Inheritance (styles applied to parent frames affecting children)
  - **Property-Specific Analysis**: Apply different detection logic for:
    - **Colors**: Check `boundVariables.color`, `boundVariables.fills`, and fill/stroke styles
    - **Typography**: Check `boundVariables.fontSize`, `fontFamily`, `fontWeight`, `lineHeight` and text styles
    - **Spacing**: Check `boundVariables.itemSpacing` and layout variables
    - **Padding**: Check individual padding variables (`paddingLeft`, `paddingRight`, etc.)
    - **Border Radius**: Check `boundVariables.cornerRadius` and effect styles
  - **Context-Aware Logic**: Consider component instances, detached components, and mixed tokenization states
  - **Style Priority Handling**: If any style is applied, treat the element as tokenized for that property type
  - **Partial Tokenization Support**: Allow elements to be partially tokenized (some properties tokenized, others hardcoded)

### 1. File Upload and Validation

**AC-1.1: Design Tokens JSON File Upload**
- **Given** a user wants to analyze a Figma file against design tokens
- **When** they upload a JSON file containing design tokens
- **Then** the system should:
  - Accept only `.json` files
  - Validate the JSON format and structure
  - Extract and parse the token data
  - Display a success message with the filename
  - Show available themes if present in the token file
  - Enable the theme selection toggle if multiple themes are available

**AC-1.2: File Validation Error Handling**
- **Given** a user uploads an invalid file
- **When** the file is not a valid JSON or has incorrect format
- **Then** the system should:
  - Display appropriate error messages for:
    - Non-JSON files
    - Empty files
    - Invalid JSON format
    - Non-object JSON structures (arrays, primitives)
  - Prevent analysis from proceeding
  - Clear any previous analysis results

### 2. Figma Integration

**AC-2.1: Figma URL and Token Input**
- **Given** a user wants to analyze a Figma file
- **When** they provide a Figma file URL and personal access token
- **Then** the system should:
  - Accept valid Figma URLs (https://www.figma.com/file/...)
  - Accept Figma personal access tokens (figd_...)
  - Validate the URL format
  - Enable the analysis button when all required fields are provided

**AC-2.2: Figma API Integration**
- **Given** valid Figma credentials are provided
- **When** the analysis is initiated
- **Then** the system should:
  - Fetch the Figma file data using the Figma API
  - Extract file ID from the provided URL
  - Handle API authentication errors gracefully
  - Display progress indicators during file fetching

### 3. Universal JSON Token File Parsing and Resolution

**AC-3.1: Flexible JSON Structure Recognition**
- **Given** a design tokens file with any JSON structure
- **When** the file is uploaded and parsed
- **Then** the system should:
  - Accept any valid JSON object structure regardless of naming conventions
  - Automatically detect token sets by identifying nested objects with token properties
  - Handle various token naming patterns (camelCase, kebab-case, snake_case, spaces)
  - Support both `$value`/`$type` and `value`/`type` property formats
  - Extract tokens from deeply nested structures (unlimited depth)
  - Maintain full token paths for cross-set references

**AC-3.2: Semantic Token Reference Resolution**
- **Given** tokens contain semantic references using `{reference.path}` syntax
- **When** token resolution is performed
- **Then** the system should:
  - Resolve all semantic token references to their final values
  - Handle cross-set references (e.g., `{Base.color.primary}` from `Semantic.color.primary`)
  - Maintain reference chains for debugging and transparency
  - Detect and handle circular references gracefully
  - Support complex reference patterns with multiple variables in one token
  - Preserve original reference information for semantic token identification

**AC-3.3: Theme-Aware Token Resolution**
- **Given** a design tokens file contains theme configurations
- **When** theme selection is enabled
- **Then** the system should:
  - Automatically detect `$themes` array with theme definitions
  - Parse theme `selectedTokenSets` to determine which sets are enabled/source/disabled
  - Resolve tokens according to theme-specific token set selections
  - Fall back to all available token sets if no theme is selected
  - Handle missing or invalid theme configurations gracefully
  - Support multiple themes with different token set combinations

**AC-3.4: Cross-Set Token Resolution**
- **Given** semantic tokens reference tokens from different sets
- **When** resolving token references
- **Then** the system should:
  - Search across all available token sets for referenced tokens
  - Prioritize exact path matches over partial matches
  - Handle relative and absolute reference paths
  - Support set name prefixes in references (e.g., `{Base.color.primary}`)
  - Maintain token hierarchy and inheritance relationships
  - Provide detailed resolution paths for debugging

### 4. Intelligent Figma Property Analysis and Tokenization Detection

**AC-4.1: Comprehensive Figma Property Detection**
- **Given** a Figma file is successfully fetched
- **When** the analysis traverses the document structure
- **Then** the system should:
  - Identify all top-level frames and their hierarchical relationships
  - Analyze each frame independently with detailed property extraction
  - Extract design values from all nested elements at any depth
  - Track element hierarchy, paths, and parent-child relationships
  - Handle component instances, variants, and their overridden properties
  - Process all Figma node types (RECTANGLE, TEXT, FRAME, GROUP, INSTANCE, etc.)

**AC-4.2: Multi-Strategy Tokenization Detection**
- **Given** Figma elements have various tokenization mechanisms
- **When** analyzing each element's properties
- **Then** the system should detect and handle:
  - **Figma Variables**: Elements bound to Figma variables via `boundVariables`
  - **Figma Styles**: Elements using Figma styles (TEXT, FILL, EFFECT, GRID)
  - **Component Inheritance**: Properties inherited from component definitions
  - **Style Inheritance**: Styles applied to parent frames affecting child elements
  - **Mixed Tokenization**: Elements with some properties tokenized and others hardcoded

**AC-4.3: Property-Specific Tokenization Analysis**
- **Given** different types of design properties are encountered
- **When** determining if a property is tokenized or hardcoded
- **Then** the system should:
  - **Colors (Fill/Stroke)**: Check for `boundVariables.color`, `boundVariables.fills`, and style references
  - **Typography**: Check for `boundVariables.fontSize`, `fontFamily`, `fontWeight`, `lineHeight` and text styles
  - **Spacing**: Check for `boundVariables.itemSpacing` and layout-related variables
  - **Padding**: Check for `boundVariables.paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`
  - **Border Radius**: Check for `boundVariables.cornerRadius` and effect styles
  - **Component Properties**: Check for overridden properties in component instances

**AC-4.4: Advanced Tokenization Detection Logic**
- **Given** complex Figma file structures with mixed tokenization
- **When** analyzing element tokenization status
- **Then** the system should:
  - **Style Priority**: If any style is applied, treat the element as tokenized for that property type
  - **Variable Binding**: If any property has bound variables, mark as tokenized
  - **Component Context**: Consider component inheritance and instance overrides
  - **Parent Frame Styles**: Check if parent frames have styles that affect child elements
  - **Detached Components**: Handle components that are detached but still have variable bindings
  - **Mixed States**: Allow elements to be partially tokenized (some properties tokenized, others hardcoded)

**AC-4.5: Property Value Extraction and Categorization**
- **Given** hardcoded values are identified
- **When** extracting and categorizing these values
- **Then** the system should:
  - **Color Values**: Convert RGB colors to HEX format for consistent comparison
  - **Typography Values**: Extract font size (px), family, weight, and line height separately
  - **Spacing Values**: Extract item spacing, padding, and margin values
  - **Border Values**: Extract corner radius and stroke properties
  - **Component Values**: Extract overridden component instance properties
  - **Location Tracking**: Record exact node IDs, layer names, and frame paths for each occurrence

### 5. Token Matching and Recommendations

**AC-5.1: Universal Value-to-Token Matching**
- **Given** hardcoded values are extracted from Figma
- **When** matching against design tokens from any JSON structure
- **Then** the system should:
  - **Multi-Strategy Matching**: Use comprehensive matching approaches:
    - Exact value matches (perfect 1.0 confidence)
    - Semantic name alignment (token name vs. property context)
    - Similar value matching with tolerance (for spacing, typography)
    - Color format conversions (RGB to HEX, HSL, etc.)
    - Unit conversions (px, rem, em, pt)
  - **Cross-Set Matching**: Search across all token sets regardless of naming conventions
  - **Semantic Priority**: Prioritize semantic tokens over base tokens with confidence boosts
  - **Alternative Suggestions**: Provide multiple token options for each value

**AC-5.2: Advanced Confidence Scoring System**
- **Given** potential token matches are found across different token structures
- **When** calculating confidence scores
- **Then** the system should:
  - **Base Confidence**: Use a 0-1 confidence scale with multiple factors
  - **Semantic Token Boosts**: Apply priority boosts for semantic tokens (0.05 boost)
  - **Name Alignment Scoring**: Calculate semantic alignment between Figma context and token names
  - **Value Similarity**: Factor in numerical similarity for spacing/typography values
  - **Format Compatibility**: Consider color format and unit compatibility
  - **Token Type Matching**: Prioritize tokens of the same type (color, spacing, typography)
  - **Reference Chain Consideration**: Factor in semantic token reference complexity

**AC-5.3: Alternative Recommendations**
- **Given** multiple potential matches exist
- **When** recommendations are generated
- **Then** the system should:
  - Show up to 3 alternative token suggestions
  - Display confidence scores for each alternative
  - Include both semantic and base token options
  - Show token paths and reference chains for semantic tokens

### 6. Results Display and Visualization

**AC-6.1: Overview Dashboard**
- **Given** analysis results are available
- **When** the overview is displayed
- **Then** the system should show:
  - Overall tokenization percentage
  - Breakdown of tokenized, matchable, and unmatched values
  - Issue categories by type (fill, stroke, typography, etc.)
  - Visual progress indicators and charts
  - Raw counts and percentages

**AC-6.2: Frame-by-Frame Analysis**
- **Given** frame analyses are available
- **When** frame results are displayed
- **Then** the system should:
  - List all analyzed frames with their names and paths
  - Show individual frame tokenization rates
  - Display frame-specific issue counts
  - Provide collapsible detailed views
  - Include direct links to Figma frames

**AC-6.3: Value Detail Views**
- **Given** specific hardcoded values are found
- **When** value details are displayed
- **Then** the system should show:
  - The actual Figma value (with color previews for colors)
  - Recommended token matches with confidence scores
  - Alternative token suggestions
  - Occurrence locations with layer names
  - Component instance information when applicable
  - Direct links to Figma elements

### 7. Component and Instance Handling

**AC-7.1: Component Instance Detection**
- **Given** Figma elements are component instances
- **When** these elements are analyzed
- **Then** the system should:
  - Identify component instances and their base components
  - Track component property overrides
  - Distinguish between component-level and instance-level values
  - Show component names and IDs in results
  - Handle detached component instances

**AC-7.2: Component Property Analysis**
- **Given** component instances have overridden properties
- **When** these properties are analyzed
- **Then** the system should:
  - Extract overridden property values
  - Identify which properties are tokenized vs hardcoded
  - Show component hierarchy information
  - Provide recommendations for component-level tokenization

### 8. Error Handling and Edge Cases

**AC-8.1: Network and API Error Handling**
- **Given** network issues or API failures occur
- **When** the system encounters these errors
- **Then** it should:
  - Display user-friendly error messages
  - Provide specific guidance for resolution
  - Handle timeouts and rate limiting
  - Allow retry mechanisms for failed operations

**AC-8.2: Large File Handling**
- **Given** large Figma files are analyzed
- **When** processing takes significant time
- **Then** the system should:
  - Show progress indicators
  - Provide estimated completion times
  - Handle memory constraints gracefully
  - Allow cancellation of long-running operations

**AC-8.3: Edge Case Handling**
- **Given** unusual Figma file structures or token formats
- **When** these edge cases are encountered
- **Then** the system should:
  - Handle circular token references
  - Process deeply nested component hierarchies
  - Deal with missing or corrupted token data
  - Handle unsupported Figma element types gracefully

### 9. Performance and User Experience

**AC-9.1: Responsive Design**
- **Given** users access the tool on different devices
- **When** the interface is displayed
- **Then** it should:
  - Work seamlessly on desktop, tablet, and mobile
  - Provide appropriate layouts for different screen sizes
  - Maintain usability across all device types
  - Support touch interactions on mobile devices

**AC-9.2: Loading States and Feedback**
- **Given** operations take time to complete
- **When** users interact with the system
- **Then** it should:
  - Show loading spinners and progress bars
  - Provide clear status messages
  - Disable interactive elements during processing
  - Show completion confirmations

**AC-9.3: Accessibility**
- **Given** users with accessibility needs
- **When** they use the application
- **Then** it should:
  - Support keyboard navigation
  - Provide appropriate ARIA labels
  - Maintain sufficient color contrast
  - Support screen readers
  - Include focus indicators

### 10. Data Export and Integration

**AC-10.1: Results Persistence**
- **Given** analysis results are generated
- **When** users want to save or share results
- **Then** the system should:
  - Allow results to be viewed in the browser
  - Provide clear, readable output formats
  - Support sharing via URLs (if implemented)
  - Maintain results during the session

**AC-10.2: Debug Information**
- **Given** detailed analysis is performed
- **When** users need technical details
- **Then** the system should provide:
  - Token resolution debug information
  - Matching algorithm details
  - Performance metrics
  - Error logs for troubleshooting

## Non-Functional Requirements

### Performance
- Analysis of typical Figma files (up to 1000 elements) should complete within 30 seconds
- UI interactions should respond within 200ms
- Memory usage should remain reasonable for files up to 10MB

### Security
- Figma tokens should be handled securely and not logged
- No sensitive data should be stored permanently
- API calls should use appropriate authentication headers

### Reliability
- The system should handle network interruptions gracefully
- Analysis should be idempotent and produce consistent results
- Error states should be recoverable without data loss

### Usability
- The interface should be intuitive for design system managers
- Results should be actionable and easy to understand
- The tool should provide clear next steps for tokenization improvements 