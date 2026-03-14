import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Gabor",
  namespace: "synth",
  func: "gabor",
  tags: ["noise"],

  description: "Anisotropic bandlimited noise via sparse Gabor convolution",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    scale: { slot: 1, components: 'x' },
    orientation: { slot: 1, components: 'y' },
    bandwidth: { slot: 1, components: 'z' },
    isotropy: { slot: 1, components: 'w' },
    density: { slot: 2, components: 'x' },
    octaves: { slot: 2, components: 'y' },
    speed: { slot: 2, components: 'z' },
  },
  globals: {
    scale: {
      type: "float",
      default: 75,
      uniform: "scale",
      min: 1,
      max: 100,
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    orientation: {
      type: "float",
      default: 0,
      uniform: "orientation",
      min: -180,
      max: 180,
      ui: {
        label: "orientation",
        control: "slider"
      }
    },
    bandwidth: {
      type: "float",
      default: 75,
      uniform: "bandwidth",
      min: 1,
      max: 100,
      ui: {
        label: "bandwidth",
        control: "slider"
      }
    },
    isotropy: {
      type: "float",
      default: 0,
      uniform: "isotropy",
      min: 0,
      max: 100,
      ui: {
        label: "isotropy",
        control: "slider"
      }
    },
    density: {
      type: "int",
      default: 3,
      uniform: "density",
      min: 1,
      max: 8,
      randMax: 5,
      ui: {
        label: "density",
        control: "slider"
      }
    },
    octaves: {
      type: "int",
      default: 1,
      uniform: "octaves",
      min: 1,
      max: 5,
      ui: {
        label: "octaves",
        control: "slider"
      }
    },
    speed: {
      type: "int",
      default: 1,
      uniform: "speed",
      min: 0,
      max: 5,
      zero: 0,
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
  },
  passes: [
    {
      name: "render",
      program: "gabor",
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
