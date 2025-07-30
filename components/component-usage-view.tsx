import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ExternalLink, Component, Library, AlertTriangle, CheckCircle2, ChevronDown, Settings, Copy, Link, Unlink, Search } from "lucide-react"
import { generateFigmaComponentUrl } from "@/lib/figma-utils"
import type { FrameAnalysis, DetachedComponentInfo } from "@/lib/types"
import { useState, useEffect, useRef } from "react"
import { getStatusColor, VISUALIZATION_COLORS } from "@/lib/color-constants"

interface ComponentUsageViewProps {
  frameAnalyses: FrameAnalysis[]
  allComponents?: Array<{
    componentId: string
    componentName: string
    componentType: 'EXTERNAL_INSTANCE' | 'LOCAL_COMPONENT' | 'LOCAL_INSTANCE' | 'REGULAR_NODE'
    instances: Array<{
      nodeId: string
      layerName: string
      frameId: string
      frameName: string
      framePath: string
      figmaUrl: string
      hasOverwrittenProperties: boolean
      overwrittenProperties: string[]
      isDetached: boolean
    }>
  }>
  detachedComponents?: DetachedComponentInfo[]
}

export function ComponentUsageView({ frameAnalyses, allComponents, detachedComponents }: ComponentUsageViewProps) {
  // Use the allComponents data if available, otherwise fall back to extraction from frame analyses
  const componentUsageData = allComponents ? convertAllComponentsToUsageData(allComponents) : extractComponentUsageData(frameAnalyses)
  
  if (componentUsageData.length === 0 && (!detachedComponents || detachedComponents.length === 0)) {
    return <EmptyComponentsMessage />
  }

  return (
    <div className="space-y-6">
      {/* Component Usage Overview */}
      <ComponentUsageOverview componentUsageData={componentUsageData} detachedComponents={detachedComponents} />
      
      {/* Component Categories */}
      <ComponentCategories componentUsageData={componentUsageData} />
      
      {/* Enhanced Detached Components Section */}
      {detachedComponents && detachedComponents.length > 0 && (
        <DetachedComponentsSection detachedComponents={detachedComponents} />
      )}
    </div>
  )
}

interface ComponentUsageInfo {
  componentId: string
  componentName: string
  componentType: 'EXTERNAL_INSTANCE' | 'LOCAL_COMPONENT' | 'LOCAL_INSTANCE' | 'REGULAR_NODE'
  instances: Array<{
    nodeId: string
    layerName: string
    frameId: string
    frameName: string
    framePath: string
    figmaUrl: string
    hasOverwrittenProperties: boolean
    overwrittenProperties: string[]
    isDetached: boolean
  }>
  totalInstances: number
  hasOverwrittenInstances: boolean
  detachedInstances: number
  complianceScore: number
}

function extractComponentUsageData(frameAnalyses: FrameAnalysis[]): ComponentUsageInfo[] {
  const componentMap = new Map<string, ComponentUsageInfo>()

  // Debug: Log what we're working with
  console.log('=== Component Usage Debug ===')
  console.log('Frame analyses:', frameAnalyses.length)
  
  // Method 1: Extract from raw values (components with hardcoded values)
  frameAnalyses.forEach((frame, frameIndex) => {
    console.log(`Frame ${frameIndex}: ${frame.frameName} (${frame.rawValues.length} raw values)`)
    
    frame.rawValues.forEach((valueData, valueIndex) => {
      console.log(`  Value ${valueIndex}:`, {
        type: valueData.type,
        value: valueData.value,
        componentIds: valueData.componentIds,
        componentNames: valueData.componentNames,
        componentTypes: valueData.componentTypes,
        isComponentInstances: valueData.isComponentInstances,
        nodeIds: valueData.nodeIds,
        layerNames: valueData.layerNames
      })
      
      if (valueData.componentIds && valueData.componentIds.length > 0) {
        valueData.componentIds.forEach((componentId, index) => {
          if (!componentId) return

          const componentName = valueData.componentNames?.[index] || 'Unknown Component'
          const componentType = valueData.componentTypes?.[index] || 'REGULAR_NODE'
          const nodeId = valueData.nodeIds?.[index]
          const layerName = valueData.layerNames?.[index] || 'Unknown Layer'
          const isComponentInstance = valueData.isComponentInstances?.[index] || false

          console.log(`    Processing component: ${componentName} (${componentId}) - Type: ${componentType}, Instance: ${isComponentInstance}`)

          if (!componentMap.has(componentId)) {
            componentMap.set(componentId, {
              componentId,
              componentName,
              componentType,
              instances: [],
              totalInstances: 0,
              hasOverwrittenInstances: false,
              detachedInstances: 0,
              complianceScore: 0
            })
          }

          const component = componentMap.get(componentId)!
          
          // Check if this instance has overwritten properties
          const hasOverwrittenProperties = componentType === 'LOCAL_INSTANCE' || componentType === 'EXTERNAL_INSTANCE'
          const overwrittenProperties = hasOverwrittenProperties ? ['Properties may be overwritten'] : []
          const isDetached = componentType === 'LOCAL_INSTANCE' // Local instances are typically detached

          component.instances.push({
            nodeId: nodeId || '',
            layerName,
            frameId: frame.frameId,
            frameName: frame.frameName,
            framePath: frame.framePath,
            figmaUrl: frame.figmaUrl,
            hasOverwrittenProperties,
            overwrittenProperties,
            isDetached
          })

          component.totalInstances++
          if (hasOverwrittenProperties) component.hasOverwrittenInstances = true
          if (isDetached) component.detachedInstances++
        })
      }
    })
  })

  // Method 2: Look for components in nodeIds that might be component instances
  // This catches components that don't have hardcoded values but are still components
  frameAnalyses.forEach(frame => {
    frame.rawValues.forEach(valueData => {
      if (valueData.nodeIds && valueData.nodeIds.length > 0) {
        valueData.nodeIds.forEach((nodeId, index) => {
          if (!nodeId) return
          
          const layerName = valueData.layerNames?.[index] || 'Unknown Layer'
          const isComponentInstance = valueData.isComponentInstances?.[index] || false
          const componentId = valueData.componentIds?.[index]
          const componentName = valueData.componentNames?.[index]
          const componentType = valueData.componentTypes?.[index]
          
          // If this is a component instance but we don't have a componentId, use the nodeId
          if (isComponentInstance && !componentId) {
            console.log(`Found component instance without componentId: ${layerName} (${nodeId})`)
            
            if (!componentMap.has(nodeId)) {
              componentMap.set(nodeId, {
                componentId: nodeId,
                componentName: componentName || layerName,
                componentType: componentType || 'LOCAL_INSTANCE',
                instances: [],
                totalInstances: 0,
                hasOverwrittenInstances: false,
                detachedInstances: 0,
                complianceScore: 0
              })
            }

            const component = componentMap.get(nodeId)!
            
            // Check if we already have this instance
            const existingInstance = component.instances.find(inst => 
              inst.nodeId === nodeId && inst.frameId === frame.frameId
            )
            
            if (!existingInstance) {
              component.instances.push({
                nodeId: nodeId,
                layerName,
                frameId: frame.frameId,
                frameName: frame.frameName,
                framePath: frame.framePath,
                figmaUrl: frame.figmaUrl,
                hasOverwrittenProperties: false,
                overwrittenProperties: [],
                isDetached: componentType === 'LOCAL_INSTANCE'
              })

              component.totalInstances++
              if (componentType === 'LOCAL_INSTANCE') component.detachedInstances++
            }
          }
        })
      }
    })
  })

  console.log('=== Component Map Results ===')
  console.log('Total components found:', componentMap.size)
  componentMap.forEach((component, id) => {
    console.log(`Component: ${component.componentName} (${id}) - Type: ${component.componentType}, Instances: ${component.totalInstances}`)
  })

  // Calculate compliance scores
  componentMap.forEach(component => {
    const totalInstances = component.totalInstances
    const compliantInstances = component.instances.filter(instance => 
      !instance.hasOverwrittenProperties && !instance.isDetached
    ).length
    
    component.complianceScore = totalInstances > 0 ? (compliantInstances / totalInstances) * 100 : 100
  })

  return Array.from(componentMap.values()).sort((a, b) => b.totalInstances - a.totalInstances)
}

function convertAllComponentsToUsageData(allComponents: Array<{
  componentId: string
  componentName: string
  componentType: 'EXTERNAL_INSTANCE' | 'LOCAL_COMPONENT' | 'LOCAL_INSTANCE' | 'REGULAR_NODE'
  instances: Array<{
    nodeId: string
    layerName: string
    frameId: string
    frameName: string
    framePath: string
    figmaUrl: string
    hasOverwrittenProperties: boolean
    overwrittenProperties: string[]
    isDetached: boolean
  }>
}>): ComponentUsageInfo[] {
  console.log('=== Converting All Components to Usage Data ===')
  console.log('Total components from analyzer:', allComponents.length)
  
  return allComponents.map(component => {
    console.log(`Converting component: ${component.componentName} (${component.componentId}) - Type: ${component.componentType}, Instances: ${component.instances.length}`)
    
    const totalInstances = component.instances.length
    const hasOverwrittenInstances = component.instances.some(instance => instance.hasOverwrittenProperties)
    const detachedInstances = component.instances.filter(instance => instance.isDetached).length
    
    // Calculate compliance score based on component type and new rules
    let compliantInstances = 0
    
    if (component.componentType === 'EXTERNAL_INSTANCE') {
      // External library components: compliant if not detached and no properties overwritten
      compliantInstances = component.instances.filter(instance => 
        !instance.isDetached && !instance.hasOverwrittenProperties
      ).length
    } else if (component.componentType === 'LOCAL_COMPONENT') {
      // Local component definitions: assume compliant (they're the source of truth)
      compliantInstances = totalInstances
    } else if (component.componentType === 'LOCAL_INSTANCE') {
      // Local instances: check if they're detached
      compliantInstances = component.instances.filter(instance => !instance.isDetached).length
    } else {
      // Regular nodes: assume compliant
      compliantInstances = totalInstances
    }
    
    const complianceScore = totalInstances > 0 ? (compliantInstances / totalInstances) * 100 : 100
    
    return {
      componentId: component.componentId,
      componentName: component.componentName,
      componentType: component.componentType,
      instances: component.instances,
      totalInstances,
      hasOverwrittenInstances,
      detachedInstances,
      complianceScore
    }
  }).sort((a, b) => b.totalInstances - a.totalInstances)
}

function EmptyComponentsMessage() {
  return (
    <Card className="border-dashed border-2 border-gray-200/60 bg-gray-50/80 backdrop-blur-sm shadow-lg">
      <CardContent className="p-12 text-center">
        <Component className="w-16 h-16 mx-auto text-gray-400 mb-6" />
        <h3 className="text-xl font-semibold text-gray-900 mb-3">No Components Found</h3>
        <p className="text-gray-600 max-w-md mx-auto leading-relaxed">
          This analysis works best with Figma files that use components. 
          Try analyzing a file with component instances and library components.
        </p>
      </CardContent>
    </Card>
  )
}

function ComponentUsageOverview({ 
  componentUsageData, 
  detachedComponents 
}: { 
  componentUsageData: ComponentUsageInfo[]
  detachedComponents?: DetachedComponentInfo[]
}) {
  const externalComponents = componentUsageData.filter(c => c.componentType === 'EXTERNAL_INSTANCE')
  const localComponents = componentUsageData.filter(c => c.componentType === 'LOCAL_COMPONENT')
  const localInstances = componentUsageData.filter(c => c.componentType === 'LOCAL_INSTANCE')
  const legacyDetachedComponents = componentUsageData.filter(c => 
    c.componentType === 'LOCAL_INSTANCE' && c.instances.some(inst => inst.isDetached)
  )

  const totalExternalInstances = externalComponents.reduce((sum, c) => sum + c.totalInstances, 0)
  const totalLocalInstances = localInstances.reduce((sum, c) => sum + c.totalInstances, 0)
  const totalLegacyDetachedInstances = legacyDetachedComponents.reduce((sum, c) => sum + c.detachedInstances, 0)
  
  // Enhanced detached components from the new detection
  const enhancedDetachedCount = detachedComponents?.length || 0
  const highConfidenceDetached = detachedComponents?.filter(d => d.confidence === 'high').length || 0
  const mediumConfidenceDetached = detachedComponents?.filter(d => d.confidence === 'medium').length || 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <ComponentTypeCard
        title="External Library"
        count={externalComponents.length}
        instances={totalExternalInstances}
        icon={<Library className="w-5 h-5" />}
        color="green"
        description="Components from external design systems"
      />
      <ComponentTypeCard
        title="Local Components"
        count={localComponents.length}
        instances={localComponents.length}
        icon={<Component className="w-5 h-5" />}
        color="blue"
        description="Component definitions in this file"
      />
      <ComponentTypeCard
        title="Local Instances"
        count={localInstances.length}
        instances={totalLocalInstances}
        icon={<Copy className="w-5 h-5" />}
        color="purple"
        description="Instances of local components"
      />
      <ComponentTypeCard
        title="Enhanced Detached"
        count={enhancedDetachedCount}
        instances={highConfidenceDetached + mediumConfidenceDetached}
        icon={<Unlink className="w-5 h-5" />}
        color="red"
        description={`${highConfidenceDetached} high, ${mediumConfidenceDetached} medium confidence`}
      />
    </div>
  )
}

function ComponentTypeCard({ 
  title, 
  count, 
  instances, 
  icon, 
  color, 
  description 
}: { 
  title: string
  count: number
  instances: number
  icon: React.ReactNode
  color: 'green' | 'blue' | 'purple' | 'orange' | 'red'
  description: string
}) {
  const colorClasses = {
    green: 'bg-green-50 border-green-200 text-green-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    red: 'bg-red-50 border-red-200 text-red-700'
  }

  return (
    <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-md bg-white/80">
            {icon}
          </div>
          <div>
            <div className="font-medium text-sm">{title}</div>
            <div className="text-xs opacity-80">{description}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-sm">{count}</div>
          <div className="text-xs opacity-80">{instances} instances</div>
        </div>
      </div>
    </div>
  )
}

function ComponentCategories({ componentUsageData }: { componentUsageData: ComponentUsageInfo[] }) {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'external' | 'local' | 'detached'>('all')
  
  // Separate truly detached components from external library components
  const externalComponents = componentUsageData.filter(comp => comp.componentType === 'EXTERNAL_INSTANCE')
  const localComponents = componentUsageData.filter(comp => comp.componentType === 'LOCAL_COMPONENT')
  const detachedComponents = componentUsageData.filter(comp => 
    comp.componentType === 'LOCAL_INSTANCE' && comp.instances.some(inst => inst.isDetached)
  )
  
  const filteredComponents = componentUsageData.filter(comp => {
    switch (selectedCategory) {
      case 'external':
        return comp.componentType === 'EXTERNAL_INSTANCE'
      case 'local':
        return comp.componentType === 'LOCAL_COMPONENT'
      case 'detached':
        // Only show LOCAL_INSTANCE components that are actually detached
        return comp.componentType === 'LOCAL_INSTANCE' && comp.instances.some(inst => inst.isDetached)
      default:
        return true
    }
  })

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex gap-2">
        <Button
          variant={selectedCategory === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedCategory('all')}
        >
          All Components ({componentUsageData.length})
        </Button>
        <Button
          variant={selectedCategory === 'external' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedCategory('external')}
        >
          External Library ({externalComponents.length})
        </Button>
        <Button
          variant={selectedCategory === 'local' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedCategory('local')}
        >
          Local Components ({localComponents.length})
        </Button>
        <Button
          variant={selectedCategory === 'detached' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedCategory('detached')}
        >
          Detached ({detachedComponents.length})
        </Button>
      </div>

      {/* Component List */}
      <div className="space-y-4">
        {filteredComponents.map(component => (
          <ComponentCard key={component.componentId} component={component} />
        ))}
      </div>
    </div>
  )
}

function ComponentCard({ component }: { component: ComponentUsageInfo }) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  const getComponentTypeInfo = (type: string) => {
    switch (type) {
      case 'EXTERNAL_INSTANCE':
        return { icon: <Library className="w-4 h-4" />, label: 'External Library', color: 'green' }
      case 'LOCAL_COMPONENT':
        return { icon: <Component className="w-4 h-4" />, label: 'Local Component', color: 'blue' }
      case 'LOCAL_INSTANCE':
        // Check if this component has any detached instances
        const hasDetachedInstances = component.instances.some(inst => inst.isDetached)
        if (hasDetachedInstances) {
          return { icon: <Unlink className="w-4 h-4" />, label: 'Detached Instance', color: 'red' }
        } else {
          return { icon: <Copy className="w-4 h-4" />, label: 'Local Instance', color: 'purple' }
        }
      default:
        return { icon: <Component className="w-4 h-4" />, label: 'Regular Node', color: 'gray' }
    }
  }

  const typeInfo = getComponentTypeInfo(component.componentType)
  const complianceColor = component.complianceScore >= 80 ? 'green' : component.complianceScore >= 60 ? 'orange' : 'red'

  return (
    <Card className="overflow-hidden border border-gray-200/60 shadow-lg bg-white/80 backdrop-blur-sm">
      <CardHeader 
        className="bg-gradient-to-r from-gray-50/80 to-gray-100/60 border-b border-gray-200/60 cursor-pointer hover:bg-gray-100/80 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-${typeInfo.color}-100 text-${typeInfo.color}-700`}>
                {typeInfo.icon}
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-gray-900">{component.componentName}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {typeInfo.label}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {component.totalInstances} instance{component.totalInstances !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-700 mb-1">
                {Math.round(component.complianceScore)}% compliant
              </div>
              <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-2 rounded-full transition-all duration-500 ease-out ${
                    complianceColor === 'green' ? 'bg-green-500' : 
                    complianceColor === 'orange' ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${component.complianceScore}%` }}
                />
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
          </div>
        </div>
      </CardHeader>
      {!isCollapsed && (
        <CardContent className="p-0">
          <ComponentInstancesList component={component} />
        </CardContent>
      )}
    </Card>
  )
}

function ComponentInstancesList({ component }: { component: ComponentUsageInfo }) {
  return (
    <div className="divide-y divide-gray-100">
      {component.instances.map((instance, index) => (
        <div key={index} className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium text-gray-900">{instance.layerName}</div>
              <div className="text-xs text-gray-500">in {instance.frameName}</div>
            </div>
            <div className="flex items-center gap-2">
              {instance.hasOverwrittenProperties && (
                <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                  <Settings className="w-3 h-3 mr-1" />
                  Overwritten
                </Badge>
              )}
              {instance.isDetached && (
                <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                  <Unlink className="w-3 h-3 mr-1" />
                  Detached
                </Badge>
              )}
                             <Button 
                 variant="outline" 
                 size="sm" 
                 asChild 
                 className="h-7 px-2 text-xs"
               >
                 <a 
                   href={generateFigmaComponentUrl(instance.figmaUrl, instance.nodeId)} 
                   target="_blank" 
                   rel="noopener noreferrer"
                 >
                   <ExternalLink className="w-3 h-3 mr-1" />
                   Open
                 </a>
               </Button>
            </div>
          </div>
          
          {instance.overwrittenProperties.length > 0 && (
            <div className="text-xs text-gray-600">
              <span className="font-medium">Overwritten properties:</span> {instance.overwrittenProperties.join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  )
} 

function DetachedComponentsSection({ detachedComponents }: { detachedComponents: DetachedComponentInfo[] }) {
  const [selectedConfidence, setSelectedConfidence] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const filteredComponents = detachedComponents.filter(component => {
    const matchesConfidence = selectedConfidence === 'all' || component.confidence === selectedConfidence
    const matchesSearch = component.nodeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         component.componentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         component.reason.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesConfidence && matchesSearch
  })

  const highConfidenceCount = detachedComponents.filter(d => d.confidence === 'high').length
  const mediumConfidenceCount = detachedComponents.filter(d => d.confidence === 'medium').length
  const lowConfidenceCount = detachedComponents.filter(d => d.confidence === 'low').length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5" />
          Enhanced Detached Component Detection
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Components detected as potentially detached using advanced heuristics and API analysis
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex gap-2">
            <Button
              variant={selectedConfidence === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedConfidence('all')}
            >
              All ({detachedComponents.length})
            </Button>
            <Button
              variant={selectedConfidence === 'high' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedConfidence('high')}
            >
              High ({highConfidenceCount})
            </Button>
            <Button
              variant={selectedConfidence === 'medium' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedConfidence('medium')}
            >
              Medium ({mediumConfidenceCount})
            </Button>
            <Button
              variant={selectedConfidence === 'low' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedConfidence('low')}
            >
              Low ({lowConfidenceCount})
            </Button>
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="text"
              placeholder="Search detached components..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-md text-sm"
            />
          </div>
        </div>

        {/* Detached Components List */}
        <div className="space-y-3">
          {filteredComponents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No detached components found matching the current filters.
            </div>
          ) : (
            filteredComponents.map((component) => (
              <DetachedComponentCard key={component.nodeId} component={component} />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function DetachedComponentCard({ component }: { component: DetachedComponentInfo }) {
  const confidenceColors = {
    high: 'bg-red-50 border-red-200 text-red-700',
    medium: 'bg-orange-50 border-orange-200 text-orange-700',
    low: 'bg-yellow-50 border-yellow-200 text-yellow-700'
  }

  const methodIcons = {
    api: <Component className="w-4 h-4" />,
    heuristic: <Search className="w-4 h-4" />
  }

  return (
    <div className={`p-4 rounded-lg border ${confidenceColors[component.confidence]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-medium text-sm">{component.nodeName}</h4>
            <Badge variant="outline" className="text-xs">
              {component.nodeType}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {component.detectionMethod}
            </Badge>
            <div className="flex items-center gap-1">
              {methodIcons[component.detectionMethod]}
              <span className="text-xs font-medium capitalize">{component.confidence} confidence</span>
            </div>
          </div>
          
          <p className="text-xs mb-2">{component.reason}</p>
          
          {component.componentName && (
            <p className="text-xs mb-2">
              <span className="font-medium">Component:</span> {component.componentName}
            </p>
          )}
          
          <div className="flex flex-wrap gap-2 text-xs">
            {component.hasComponentProperties && (
              <Badge variant="secondary" className="text-xs">Has Properties</Badge>
            )}
            {component.hasBoundVariables && (
              <Badge variant="secondary" className="text-xs">Bound Variables</Badge>
            )}
            {component.hasComponentStyles && (
              <Badge variant="secondary" className="text-xs">Component Styles</Badge>
            )}
          </div>
          
          {component.frameName && (
            <p className="text-xs mt-2 text-muted-foreground">
              Frame: {component.frameName}
            </p>
          )}
        </div>
        
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (component.figmaUrl) {
                window.open(component.figmaUrl, '_blank')
              }
            }}
            disabled={!component.figmaUrl}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            View
          </Button>
        </div>
      </div>
    </div>
  )
} 