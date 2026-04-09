import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Split",
  namespace: "mixer",
  func: "split",
  tags: ["blend"],

  description: "Split/wipe between two inputs",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: { label: "source b" }
    },
    invert: {
      type: "int",
      default: 0,
      uniform: "invert",
      choices: {
        off: 0,
        on: 1
      },
      ui: {
        label: "swap a/b",
        control: "dropdown"
      }
    },
    position: {
      type: "float",
      default: 0.0,
      uniform: "position",
      min: -1,
      max: 1,
      ui: {
        label: "position",
        control: "slider",
        enabledBy: { param: 'speed', eq: 0 }
      }
    },
    rotation: {
      type: "float",
      default: 0.0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: { label: "rotation", control: "slider" }
    },
    softness: {
      type: "float",
      default: 0.0,
      uniform: "softness",
      min: 0,
      max: 1,
      zero: 0,
      ui: { label: "softness", control: "slider" }
    },
    speed: {
      type: "int",
      default: 0,
      uniform: "speed",
      min: 0,
      max: 4,
      zero: 0,
      randMax: 2,
      ui: { label: "speed", control: "slider" }
    }
  },
  defaultProgram: "search mixer, synth\n\nnoise(ridges: true, colorMode: mono)\n.write(o0)\n\nnoise(seed: 2, ridges: true)\n.split(tex: read(o0), softness: 1)\n.write(o1)",
  passes: [
    {
      name: "render",
      program: "split",
      inputs: { inputTex: "inputTex", tex: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
