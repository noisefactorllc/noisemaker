import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter3d/palette3d - Apply cosine color palettes to a 3D volume
 *
 * 3D port of filter/palette. Recolors a volume (stored as a 2D atlas) per-voxel,
 * using luminance to sample one of 55 cosine palettes. Identical palette math and
 * settings as the 2D effect; only the I/O is volume-based.
 *
 * Geometry (normals + density) passes through unchanged via outputGeo: "inputGeo",
 * so the volume's shape is preserved and only its color changes.
 *
 * Usage:
 *   noise3d(volumeSize: x64).palette3d(index: palette.vaporwave).render3d().write(o0)
 *
 * volumeSize is inherited from the upstream 3D generator.
 */
export default new Effect({
  name: "Palette3D",
  namespace: "filter3d",
  func: "palette3d",
  tags: ["3d", "color", "palette"],

  description: "Apply cosine color palettes to a 3D volume based on luminance",
  textures: {
    volumeCache: {
      width: { param: 'volumeSize', default: 64 },
      height: { param: 'volumeSize', power: 2, default: 4096 },
      format: "rgba16f"
    }
  },
  globals: {
    "volumeSize": {
      "type": "int",
      "default": 64,
      "uniform": "volumeSize",
      "choices": {
        "x16": 16,
        "x32": 32,
        "x64": 64,
        "x128": 128
      },
      "ui": {
        "label": "volume size",
        "control": "dropdown"
      }
    },
    index: {
      type: "member",
      default: "palette.brushedMetal",
      enum: "palette",
      uniform: "paletteIndex",
      ui: {
        label: "palette",
        control: "dropdown"
      }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      choices: {
        none: 0,
        fwd: 1,
        back: -1
      },
      ui: {
        label: "rotation",
        control: "dropdown"
      }
    },
    offset: {
      type: "float",
      default: 0,
      uniform: "offset",
      min: 0,
      max: 100,
      step: 1,
      ui: {
        label: "offset",
        control: "slider"
      }
    },
    repeat: {
      type: "int",
      default: 1,
      uniform: "repeat",
      min: 1,
      max: 10,
      randMax: 5,
      ui: {
        label: "repeat",
        control: "slider"
      }
    },
    alpha: {
      type: "float",
      default: 1,
      uniform: "alpha",
      min: 0,
      max: 1,
      randMin: 0.5,
      step: 0.01,
      ui: {
        label: "alpha",
        control: "slider"
      }
    }
  },
  paramAliases: { paletteIndex: 'index', paletteOffset: 'offset', paletteRepeat: 'repeat', paletteRotation: 'rotation' },
  passes: [
    {
      name: "render",
      program: "palette3d",
      viewport: {
        width: { param: 'volumeSize', default: 64, inputOverride: 'inputTex3d' },
        height: { param: 'volumeSize', power: 2, default: 4096, inputOverride: 'inputTex3d' }
      },
      inputs: {
        inputTex3d: "inputTex3d"
      },
      outputs: {
        fragColor: "volumeCache"
      }
    }
  ],
  outputGeo: "inputGeo",
  outputTex3d: "volumeCache"
})
