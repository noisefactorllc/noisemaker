import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Cell",
  namespace: "synth",
  func: "cell",
  tags: ["noise", "geometric"],

  description: "Cellular/Voronoi noise with distance metrics",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    metric: { slot: 1, components: 'x' },
    scale: { slot: 1, components: 'y' },
    cellScale: { slot: 1, components: 'z' },
    cellSmooth: { slot: 1, components: 'w' },
    cellVariation: { slot: 2, components: 'x' },
    loopAmp: { slot: 2, components: 'y' },
    texInfluence: { slot: 2, components: 'z' },
    texIntensity: { slot: 2, components: 'w' }
  },
  globals: {
    metric: {
      type: "int",
      default: 0,
      uniform: "metric",
      choices: {
        circle: 0,
        diamond: 1,
        hexagon: 2,
        octagon: 3,
        square: 4,
        triangle: 6
      },
      ui: {
        label: "metric",
        control: "dropdown"
      }
    },
    scale: {
      type: "float",
      default: 75,
      uniform: "scale",
      min: 1,
      max: 100,
      ui: {
        label: "noise scale",
        control: "slider"
      }
    },
    cellScale: {
      type: "float",
      default: 87,
      uniform: "cellScale",
      min: 1,
      max: 100,
      ui: {
        label: "cell scale",
        control: "slider"
      }
    },
    cellSmooth: {
      type: "float",
      default: 11,
      uniform: "cellSmooth",
      min: 0,
      max: 100,
      ui: {
        label: "cell smooth",
        control: "slider"
      }
    },
    cellVariation: {
      type: "float",
      default: 50,
      uniform: "cellVariation",
      min: 0,
      max: 100,
      ui: {
        label: "cell variation",
        control: "slider"
      }
    },
    loopAmp: {
      type: "int",
      default: 1,
      uniform: "loopAmp",
      min: 0,
      max: 5,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    tex: {
      type: "surface",
      default: "none",
      ui: {
        label: "texture"
      }
    },
    texInfluence: {
      type: "int",
      default: 1,
      uniform: "texInfluence",
      choices: {
        warp: null,
        cellScale: 1,
        noiseScale: 2,
        combine: null,
        add: 10,
        divide: 11,
        min: 12,
        max: 13,
        mod: 14,
        multiply: 15,
        subtract: 16
      },
      ui: {
        label: "influence",
        control: "dropdown"
      }
    },
    texIntensity: {
      type: "float",
      default: 100,
      uniform: "texIntensity",
      min: 0,
      max: 100,
      ui: {
        label: "intensity",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "cell",
      inputs: {
        tex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
