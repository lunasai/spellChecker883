# Setup Analysis Functionality

## Overview

The setup analysis functionality has been enhanced to provide a seamless user experience with two distinct flows:

1. **Primary Flow – Default Library**: Automatic use of the Crate Library
2. **Secondary Flow – Custom Library**: Optional upload of custom design tokens

## Primary Flow – Default Library

### Behavior
- **Automatic**: The tool automatically loads and uses the stored Crate Library JSON for scanning
- **Seamless**: No extra steps required - users can immediately start analysis
- **Natural**: Feels like the primary spell-checker flow

### User Experience
1. User opens the application
2. Crate Library is automatically loaded and ready
3. User enters Figma URL and Personal Access Token
4. User clicks "Start Analysis"
5. Analysis runs using the default Crate Library

### Technical Implementation
- Crate Library JSON is stored in `/public/crate-library.json`
- Automatically loaded on component mount
- Available themes are extracted and ready for use
- No user interaction required for library setup

## Secondary Flow – Custom Library (Optional)

### Behavior
- **Override**: If a custom file is uploaded, it switches to that custom library for the current session
- **Theme Selection**: Allows theme selection following the same flow as before
- **Optional**: Users can choose to override the default library

### User Experience
1. User clicks "Upload Custom Library" to expand the section
2. User uploads their custom JSON file
3. Available themes are extracted from the custom file
4. User can optionally enable theme selection
5. Custom library overrides the default for the current session

### Technical Implementation
- Custom file validation and parsing
- Theme extraction from custom tokens
- Session-based override of default library
- Maintains all existing theme selection functionality

## UI Design Principles

### Primary Flow Emphasis
- Default library is prominently displayed with "Ready" status
- Clear indication that Crate Library is being used by default
- Minimal friction for the most common use case

### Secondary Flow Presentation
- Custom library option is clearly labeled as "Upload Custom Library"
- Collapsible section to avoid cluttering the primary interface
- Non-distracting presentation that doesn't interfere with primary flow

### Visual Hierarchy
- Default library section has green "Ready" badge
- Custom library section is visually separated
- Clear progression from setup to analysis

## File Structure

```
public/
  crate-library.json          # Default Crate Library tokens
components/
  setup-analysis.tsx          # New setup analysis component
app/
  page.tsx                    # Updated main page using new component
```

## Technical Details

### Component Architecture
- `SetupAnalysis` component handles both flows
- Automatic loading of default library on mount
- Conditional rendering of custom library section
- Proper state management for both flows

### Error Handling
- Graceful fallback if default library fails to load
- Validation of custom library files
- Clear error messages for both flows

### Performance
- Default library is loaded once on component mount
- Custom library is only processed when uploaded
- Efficient state management to avoid unnecessary re-renders

## Usage Examples

### Default Flow
```typescript
// User simply enters Figma details and starts analysis
// No additional setup required
```

### Custom Flow
```typescript
// User uploads custom library
const customFile = new File([jsonContent], 'custom-tokens.json', { type: 'application/json' })
// Custom library overrides default for the session
```

## Benefits

1. **Improved UX**: Seamless default experience for most users
2. **Flexibility**: Still supports custom library uploads when needed
3. **Clarity**: Clear distinction between default and custom flows
4. **Efficiency**: Reduces setup time for common use cases
5. **Maintainability**: Clean separation of concerns in the codebase

## Node-Specific Analysis

### Overview

The tool now supports analyzing specific nodes within a Figma file when the URL contains a `node-id` parameter. This allows for more targeted analysis of individual components, frames, or pages.

### Supported URL Formats

The tool automatically detects and handles the following Figma URL formats:

1. **Full File Analysis** (existing behavior):
   ```
   https://www.figma.com/design/yYPU0w9uAEP7yIHOJxEeRg/miss-c-rate
   ```

2. **Node-Specific Analysis** (new feature):
   ```
   https://www.figma.com/design/yYPU0w9uAEP7yIHOJxEeRg/miss-c-rate?node-id=174-64&t=...
   https://www.figma.com/design/yYPU0w9uAEP7yIHOJxEeRg/miss-c-rate?node-id=0-1
   https://www.figma.com/design/yYPU0w9uAEP7yIHOJxEeRg/miss-c-rate?node-id=59-150
   ```

### URL Parsing Logic

The tool extracts both the file key and node ID from Figma URLs:

- **File Key**: Extracted from the URL path (e.g., `yYPU0w9uAEP7yIHOJxEeRg`)
- **Node ID**: Extracted from the `node-id` parameter and converted from URL format (`174-64`) to internal format (`174:64`)

### Analysis Behavior

1. **Node ID Present**:
   - Fetches specific node using `/files/{file_key}/nodes?ids={nodeId}` endpoint
   - Analyzes only the specified node and its children
   - Falls back to full file analysis if node fetch fails

2. **Page-Level Node (0:1)**:
   - Attempts to fetch the specific page node
   - If the page-level node fetch fails, automatically falls back to full file analysis
   - This handles cases where page-level nodes may not be accessible via the nodes endpoint

3. **No Node ID**:
   - Uses existing full file analysis behavior
   - Fetches entire file using `/files/{file_key}` endpoint

### Technical Implementation

- **URL Parsing**: Enhanced `extractFigmaUrlInfo()` function in `lib/figma-utils.ts`
- **API Integration**: Updated `fetchFigmaFile()` function in `lib/client-analyzer.ts`
- **Fallback Logic**: Graceful fallback to full file analysis when node-specific fetching fails
- **Error Handling**: Comprehensive error handling for both node-specific and full file fetching

### Benefits

1. **Targeted Analysis**: Analyze specific components or frames without processing the entire file
2. **Performance**: Faster analysis for large files when only specific nodes are needed
3. **Precision**: Focus analysis on relevant design elements
4. **Backward Compatibility**: Maintains full file analysis for URLs without node IDs
5. **Robust Fallback**: Automatic fallback ensures analysis always completes 