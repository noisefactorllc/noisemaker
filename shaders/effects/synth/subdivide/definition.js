import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Subdivide",
  namespace: "synth",
  func: "subdivide",
  tags: ["geometric", "pattern"],

  description: "Recursive grid subdivision with shapes",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    mode: { slot: 0, components: 'z' },
    depth: { slot: 0, components: 'w' },
    density: { slot: 1, components: 'x' },
    seed: { slot: 1, components: 'y' },
    fill: { slot: 1, components: 'z' },
    outline: { slot: 1, components: 'w' },
    inputMix: { slot: 2, components: 'x' },
    wrap: { slot: 2, components: 'y' },
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
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        binary: 0,
        quad: 1
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    depth: {
      type: "int",
      default: 5,
      uniform: "depth",
      min: 1,
      max: 6,
      randMin: 3,
      ui: {
        label: "depth",
        control: "slider"
      }
    },
    density: {
      type: "float",
      default: 75,
      uniform: "density",
      min: 30,
      max: 100,
      randMin: 50,
      ui: {
        label: "density",
        control: "slider"
      }
    },
    seed: {
      type: "int",
      default: 69,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    fill: {
      type: "int",
      default: 0,
      uniform: "fill",
      choices: {
        solid: 0,
        circle: 1,
        diamond: 2,
        square: 3,
        arc: 4,
        mixed: 5
      },
      ui: {
        label: "fill",
        control: "dropdown",
        enabledBy: { param: "mode", neq: 0 }
      }
    },
    outline: {
      type: "float",
      default: 3,
      uniform: "outline",
      min: 0,
      max: 10,
      zero: 0,
      ui: {
        label: "outline",
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
    },
    wrap: {
      type: "int",
      default: 0,
      uniform: "wrap",
      choices: {
        mirror: 0,
        repeat: 1,
        clamp: 2
      },
      randChance: 0,
      ui: {
        label: "wrap",
        control: "dropdown",
        category: "input",
        enabledBy: { param: "tex", neq: "none" }
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "subdivide",
      inputs: {
        inputTex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
