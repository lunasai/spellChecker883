import { detectDetachedComponents } from './figma-analyzer'
import type { FigmaNode } from './types'

// Test data representing a Figma file with detached components
const testFigmaDocument: FigmaNode = {
  id: 'document',
  name: 'Document',
  type: 'DOCUMENT',
  visible: true,
  children: [
    {
      id: 'frame-1',
      name: 'Frame 1',
      type: 'FRAME',
      visible: true,
      children: [
        // Detached component (was INSTANCE, now FRAME)
        {
          id: 'detached-button',
          name: 'Button',
          type: 'FRAME',
          visible: true,
          componentProperties: {
            variant: { type: 'VARIANT', value: 'primary' },
            size: { type: 'VARIANT', value: 'medium' }
          },
          boundVariables: {
            color: { type: 'VARIABLE', id: 'color-primary' },
            fontSize: { type: 'VARIABLE', id: 'font-size-medium' }
          },
          fills: [
            {
              type: 'SOLID',
              color: { r: 0.2, g: 0.4, b: 0.8, a: 1 },
              boundVariables: {
                color: { type: 'VARIABLE', id: 'color-primary' }
              }
            }
          ],
          children: []
        },
        // Regular frame (not detached)
        {
          id: 'regular-frame',
          name: 'Regular Frame',
          type: 'FRAME',
          visible: true,
          children: []
        },
        // Detached component with component-like name
        {
          id: 'detached-card',
          name: 'Card',
          type: 'GROUP',
          visible: true,
          boundVariables: {
            cornerRadius: { type: 'VARIABLE', id: 'radius-medium' }
          },
          children: []
        }
      ]
    },
    {
      id: 'frame-2',
      name: 'Frame 2',
      type: 'FRAME',
      visible: true,
      children: [
        // Valid component instance
        {
          id: 'valid-instance',
          name: 'Valid Button',
          type: 'INSTANCE',
          componentId: 'component-1:1',
          visible: true,
          children: []
        },
        // Detached instance (no componentId)
        {
          id: 'detached-instance',
          name: 'Detached Button',
          type: 'INSTANCE',
          visible: true,
          children: []
        }
      ]
    }
  ]
}

// Test the detached component detection
export function testDetachedComponentDetection() {
  console.log('🧪 Testing Enhanced Detached Component Detection...')
  
  const detachedComponents = detectDetachedComponents(testFigmaDocument, 'https://figma.com/file/test')
  
  console.log(`\n📊 Results:`)
  console.log(`Found ${detachedComponents.length} detached components:`)
  
  detachedComponents.forEach((component, index) => {
    console.log(`\n${index + 1}. ${component.nodeName} (${component.nodeType})`)
    console.log(`   Confidence: ${component.confidence}`)
    console.log(`   Detection Method: ${component.detectionMethod}`)
    console.log(`   Reason: ${component.reason}`)
    console.log(`   Has Component Properties: ${component.hasComponentProperties}`)
    console.log(`   Has Bound Variables: ${component.hasBoundVariables}`)
    console.log(`   Has Component Styles: ${component.hasComponentStyles}`)
  })
  
  return detachedComponents
}

// Run the test if this file is executed directly
if (typeof window === 'undefined') {
  testDetachedComponentDetection()
} 