import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Splat",
  namespace: "classicNoisedeck",
  func: "splat",
  tags: ["noise"],

  description: "Splatter paint effect",
  globals: {
    enabled: {
      type: "boolean",
      default: true,
      uniform: "enabled",
      ui: {
        label: "splats",
        control: "checkbox"
      }
    },
    useSpecks: {
      type: "boolean",
      default: true,
      uniform: "useSpecks",
      ui: {
        label: "specks",
        control: "checkbox",
        category: "specks"
      }
    },
    scale: {
      type: "float",
      default: 3,
      uniform: "scale",
      min: 1,
      max: 5,
      ui: {
        label: "splat scale",
        control: "slider",
        category: "transform"
      }
    },
    cutoff: {
      type: "float",
      default: 25,
      uniform: "cutoff",
      min: 0,
      max: 100,
      ui: {
        label: "splat cutoff",
        control: "slider"
      }
    },
    speed: {
      type: "int",
      default: 1,
      uniform: "speed",
      min: 0,
      max: 5,
      ui: {
        label: "splat speed",
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
        label: "splat seed",
        control: "slider"
      }
    },
    mode: {
      type: "int",
      default: 2,
      uniform: "mode",
      choices: {
        color: 0,
        displace: 1,
        invert: 2,
        negative: 3
      },
      ui: {
        label: "splat mode",
        control: "dropdown"
      }
    },
    color: {
      type: "color",
      default: [1.0, 1.0, 1.0],
      uniform: "color",
      ui: {
        label: "splat color",
        control: "color"
      }
    },
    speckScale: {
      type: "float",
      default: 5,
      uniform: "speckScale",
      min: 1,
      max: 5,
      ui: {
        label: "speck scale",
        control: "slider",
        category: "transform"
      }
    },
    speckCutoff: {
      type: "float",
      default: 70,
      uniform: "speckCutoff",
      min: 0,
      max: 100,
      ui: {
        label: "speck cutoff",
        control: "slider",
        category: "specks"
      }
    },
    speckSpeed: {
      type: "int",
      default: 1,
      uniform: "speckSpeed",
      min: 0,
      max: 5,
      ui: {
        label: "speck speed",
        control: "slider"
      }
    },
    speckSeed: {
      type: "int",
      default: 1,
      uniform: "speckSeed",
      min: 1,
      max: 100,
      ui: {
        label: "speck seed",
        control: "slider",
        category: "specks"
      }
    },
    speckMode: {
      type: "int",
      default: 0,
      uniform: "speckMode",
      choices: {
        color: 0,
        displace: 1,
        invert: 2,
        negative: 3
      },
      ui: {
        label: "speck mode",
        control: "dropdown",
        category: "specks"
      }
    },
    speckColor: {
      type: "color",
      default: [0.8, 0.8, 0.8],
      uniform: "speckColor",
      ui: {
        label: "speck color",
        control: "color",
        category: "specks"
      }
    }
  },
  paramAliases: { splatColor: 'color', splatCutoff: 'cutoff', splatMode: 'mode', splatScale: 'scale', splatSeed: 'seed', splatSpeed: 'speed', useSplats: 'enabled' },
  passes: [
    {
      name: "render",
      program: "splat",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        splatColor: "color"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
