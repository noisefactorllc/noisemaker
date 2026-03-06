import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Corrupt",
  namespace: "synth",
  func: "corrupt",
  tags: ["distort", "glitch"],

  description: "Scanline-based data corruption with pixel sorting, byte shifting, and bit manipulation",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    intensity: { slot: 1, components: 'x' },
    sort: { slot: 1, components: 'y' },
    shift: { slot: 1, components: 'z' },
    bits: { slot: 1, components: 'w' },
    channelShift: { slot: 2, components: 'x' },
    speed: { slot: 2, components: 'y' },
    melt: { slot: 2, components: 'z' },
    scatter: { slot: 2, components: 'w' },
    bandHeight: { slot: 3, components: 'x' },
    inputMix: { slot: 3, components: 'y' },
  },
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: {
        label: "texture",
        category: "input"
      }
    },
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
    },
    inputMix: {
      type: "float",
      default: 0,
      uniform: "inputMix",
      min: 0,
      max: 100,
      randChance: 0,
      ui: {
        label: "input mix",
        control: "slider",
        category: "input",
        enabledBy: { param: "tex", neq: "none" }
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "corrupt",
      inputs: {
        inputTex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
