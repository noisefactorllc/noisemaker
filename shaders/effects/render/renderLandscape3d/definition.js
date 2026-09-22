import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: 'Render Landscape 3D',
  namespace: 'render',
  func: 'renderLandscape3d',
  tags: ['3d'],
  description: 'Isometric and perspective voxel renderer with face lighting',
  textures: {
    screenGeoBuffer: { width: 'screen', height: 'screen', format: 'rgba16f' }
  },
  globals: {
    volumeSize: {
      type: 'int', default: 64, uniform: 'volumeSize',
      ui: { label: 'volume size', control: false }
    },
    threshold: {
      type: 'float', default: 0.5, min: 0, max: 1, uniform: 'threshold',
      // Keep the DSL cutoff for continuous geometry fields, not as a heightfield slider.
      ui: { label: 'density threshold', control: false }
    },
    densitySource: {
      // Preserve the positional argument slot. Occupancy always comes from geometry.
      type: 'int', default: 0,
      choices: { geometry: 0 },
      ui: { label: 'density source', control: false }
    },
    zoom: {
      type: 'float', default: 1, min: 0.25, max: 4, uniform: 'zoom',
      ui: { label: 'zoom', control: 'slider' }
    },
    panX: {
      type: 'float', default: 0, min: -1, max: 1, uniform: 'panX',
      ui: { label: 'pan x', control: 'slider' }
    },
    panY: {
      type: 'float', default: 0, min: -1, max: 1, uniform: 'panY',
      ui: { label: 'pan y', control: 'slider' }
    },
    lightDirection: {
      type: 'vec3', default: [-0.4, 0.85, 0.6], uniform: 'lightDirection',
      min: -1, max: 1,
      ui: { label: 'light direction', control: 'vector3' }
    },
    ambient: {
      type: 'float', default: 0.35, min: 0, max: 1, uniform: 'ambient',
      ui: { label: 'ambient light', control: 'slider' }
    },
    diffuseIntensity: {
      type: 'float', default: 0.85, min: 0, max: 2, uniform: 'diffuseIntensity',
      ui: { label: 'diffuse light', control: 'slider' }
    },
    specularIntensity: {
      type: 'float', default: 0.12, min: 0, max: 1, uniform: 'specularIntensity',
      ui: { label: 'specular light', control: 'slider' }
    },
    bgColor: {
      type: 'color', default: [0.025, 0.045, 0.075], uniform: 'bgColor',
      ui: { label: 'background color', control: 'color' }
    },
    bgAlpha: {
      type: 'float', default: 1, min: 0, max: 1, uniform: 'bgAlpha',
      ui: { label: 'background opacity', control: 'slider' }
    },
    viewMode: {
      type: 'int', default: 1, define: 'VIEW_MODE',
      choices: { ortho: 1, perspective: 2 },
      ui: { label: 'view', control: 'dropdown', category: 'view' }
    },
    rotateX: {
      type: 'float', default: 0.3, min: 0, max: 6.283185, step: 0.01, uniform: 'rotateX',
      ui: { label: 'rotate x', control: 'slider', category: 'view', enabledBy: { param: 'viewMode', eq: 2 } }
    },
    rotateY: {
      type: 'float', default: 0, min: 0, max: 6.283185, step: 0.01, uniform: 'rotateY',
      ui: { label: 'rotate y', control: 'slider', category: 'view', enabledBy: { param: 'viewMode', eq: 2 } }
    },
    rotateZ: {
      type: 'float', default: 0, min: 0, max: 6.283185, step: 0.01, uniform: 'rotateZ',
      ui: { label: 'rotate z', control: 'slider', category: 'view', enabledBy: { param: 'viewMode', eq: 2 } }
    },
    viewScale: {
      type: 'float', default: 0.8, min: 0.1, max: 10, step: 0.01, uniform: 'viewScale',
      // Preserve billboard-compatible DSL scaling; the shared zoom is the UI control.
      ui: { label: 'zoom', control: false }
    },
    posX: {
      type: 'float', default: 0, min: -50, max: 50, step: 0.1, uniform: 'posX',
      ui: { label: 'pos x', control: 'slider', category: 'view', enabledBy: { param: 'viewMode', eq: 2 } }
    },
    posY: {
      type: 'float', default: 0, min: -50, max: 50, step: 0.1, uniform: 'posY',
      ui: { label: 'pos y', control: 'slider', category: 'view', enabledBy: { param: 'viewMode', eq: 2 } }
    },
    posZ: {
      type: 'float', default: 0, min: -200, max: 200, step: 0.1, uniform: 'posZ',
      ui: { label: 'pos z', control: 'slider', category: 'view', enabledBy: { param: 'viewMode', eq: 2 } }
    },
    fieldOfView: {
      type: 'float', default: 60, min: 10, max: 150, step: 1, uniform: 'fieldOfView',
      ui: { label: 'field of view', control: 'slider', category: 'view', enabledBy: { param: 'viewMode', eq: 2 } }
    },
    filtering: {
      // Specialize each mode so the compiler removes the inactive traversal.
      // Append the parameter to preserve existing positional calls and voxel output.
      type: 'int', default: 1, define: 'FILTERING',
      choices: { isosurface: 0, voxel: 1 },
      ui: { label: 'filtering', control: 'dropdown' }
    }
  },
  passes: [{
    name: 'render', program: 'landscape', type: 'compute', drawBuffers: 2,
    inputs: { volumeCache: 'inputTex3d', analyticalGeo: 'inputGeo' },
    outputs: { color: 'outputTex', geoOut: 'screenGeoBuffer' }
  }],
  outputTex3d: 'inputTex3d',
  outputGeo: 'screenGeoBuffer',
  defaultProgram: 'search synth, synth3d, render\n\nnoise(scaleX: 90, scaleY: 90, colorMode: mono, speed: 0).write(o1)\ngradient(type: fourCorners, color1: #006e94, color2: #24e4ff, color3: #bcff46, color4: #efffff).write(o2)\nheightmap3d(heightTex: read(o1), tex: read(o2)).renderLandscape3d(panY: -0.18).write(o0)\nrender(o0)'
})
