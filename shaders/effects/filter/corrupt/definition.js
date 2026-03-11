import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Corrupt",
  namespace: "filter",
  func: "corrupt",
  tags: ["distort", "glitch"],

  description: "Scanline-based data corruption",
  uniformLayout: {
    time: { slot: 0, components: 'x' },
    seed: { slot: 0, components: 'y' },
    intensity: { slot: 0, components: 'z' },
    sort: { slot: 0, components: 'w' },
    shift: { slot: 1, components: 'x' },
    bits: { slot: 1, components: 'y' },
    channelShift: { slot: 1, components: 'z' },
    speed: { slot: 1, components: 'w' },
    melt: { slot: 2, components: 'x' },
    scatter: { slot: 2, components: 'y' },
    bandHeight: { slot: 2, components: 'z' },
  },
  globals: {
    intensity: {
      type: "float",
      default: 50,
      uniform: "intensity",
      min: 0,
      max: 100,
      ui: {
        label: "intensity",
        control: "slider"
      }
    },
    bandHeight: {
      type: "float",
      default: 10,
      uniform: "bandHeight",
      min: 1,
      max: 100,
      ui: {
        label: "band height",
        control: "slider"
      }
    },
    sort: {
      type: "float",
      default: 50,
      uniform: "sort",
      min: 0,
      max: 100,
      ui: {
        label: "sort",
        control: "slider"
      }
    },
    shift: {
      type: "float",
      default: 50,
      uniform: "shift",
      min: 0,
      max: 100,
      ui: {
        label: "shift",
        control: "slider"
      }
    },
    channelShift: {
      type: "float",
      default: 0,
      uniform: "channelShift",
      min: 0,
      max: 100,
      ui: {
        label: "channel shift",
        control: "slider"
      }
    },
    melt: {
      type: "float",
      default: 0,
      uniform: "melt",
      min: 0,
      max: 100,
      ui: {
        label: "melt",
        control: "slider"
      }
    },
    scatter: {
      type: "float",
      default: 0,
      uniform: "scatter",
      min: 0,
      max: 100,
      ui: {
        label: "scatter",
        control: "slider"
      }
    },
    bits: {
      type: "float",
      default: 0,
      uniform: "bits",
      min: 0,
      max: 100,
      ui: {
        label: "bits",
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
    }
  },
  passes: [
    {
      name: "render",
      program: "corrupt",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
