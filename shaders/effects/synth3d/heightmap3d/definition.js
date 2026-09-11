import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: 'Heightmap 3D',
  namespace: 'synth3d',
  func: 'heightmap3d',
  tags: ['3d'],
  description: 'Voxel heightfield from separate 2D height and color surfaces',
  textures: {
    volumeCache: {
      width: { param: 'volumeSize', default: 64 },
      height: { param: 'volumeSize', power: 2, default: 4096 },
      format: 'rgba16f'
    },
    geoBuffer: {
      width: { param: 'volumeSize', default: 64 },
      height: { param: 'volumeSize', power: 2, default: 4096 },
      format: 'rgba16f'
    }
  },
  globals: {
    heightTex: {
      type: 'surface', default: 'none',
      ui: { label: 'height image' }
    },
    tex: {
      type: 'surface', default: 'none',
      ui: { label: 'color image' }
    },
    volumeSize: {
      type: 'int', default: 64, uniform: 'volumeSize',
      choices: { x16: 16, x32: 32, x64: 64, x128: 128 },
      randChoices: [16, 32, 64],
      ui: { label: 'volume size', control: 'dropdown' }
    },
    heightScale: {
      type: 'float', default: 0.35, min: 0, max: 1, uniform: 'heightScale',
      ui: { label: 'height scale', control: 'slider' }
    },
    baseHeight: {
      type: 'float', default: 0, min: 0, max: 1, uniform: 'baseHeight',
      ui: { label: 'base height', control: 'slider' }
    }
  },
  passes: [{
    name: 'precompute', program: 'precompute', type: 'compute', drawBuffers: 2,
    viewport: {
      width: { param: 'volumeSize', default: 64 },
      height: { param: 'volumeSize', power: 2, default: 4096 }
    },
    inputs: { heightTex: 'heightTex', tex: 'tex' },
    outputs: { color: 'volumeCache', geoOut: 'geoBuffer' }
  }],
  outputTex3d: 'volumeCache',
  outputGeo: 'geoBuffer',
  defaultProgram: 'search synth, synth3d, render\n\nheightmap3d(heightTex: noise(scaleX: 90, scaleY: 90, colorMode: mono, speed: 0), tex: gradient(type: fourCorners, color1: #006e94, color2: #24e4ff, color3: #bcff46, color4: #efffff)).renderLandscape3d(panY: -0.18).write(o0)\nrender(o0)'
})
