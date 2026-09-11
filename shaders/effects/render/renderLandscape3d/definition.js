import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: 'Render Landscape 3D',
  namespace: 'render',
  func: 'renderLandscape3d',
  tags: ['3d'],
  description: 'Orthographic isometric voxel renderer with face lighting',
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
      ui: { label: 'density threshold', control: 'slider' }
    },
    densitySource: {
      type: 'int', default: 0, uniform: 'densitySource',
      choices: { geometry: 0, red: 1 },
      ui: { label: 'density source', control: 'dropdown' }
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
    }
  },
  passes: [{
    name: 'render', program: 'landscape', type: 'compute', drawBuffers: 2,
    inputs: { volumeCache: 'inputTex3d', analyticalGeo: 'inputGeo' },
    outputs: { color: 'outputTex', geoOut: 'screenGeoBuffer' }
  }],
  outputTex3d: 'inputTex3d',
  outputGeo: 'screenGeoBuffer',
  defaultProgram: 'search synth, synth3d, render\n\nheightmap3d(heightTex: noise(scaleX: 90, scaleY: 90, colorMode: mono, speed: 0), tex: gradient(type: fourCorners, color1: #006e94, color2: #24e4ff, color3: #bcff46, color4: #efffff)).renderLandscape3d(panY: -0.18).write(o0)\nrender(o0)'
})
