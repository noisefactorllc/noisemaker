import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Skew",
  namespace: "filter",
  func: "skew",
  tags: ["transform"],

  description: "Skew and rotate transform",
  globals: {
    skew: {
      type: "float",
      default: 0.25,
      uniform: "skewAmt",
      min: -1,
      max: 1,
      zero: 0,
      ui: {
        label: "skew",
        control: "slider"
      }
    },
    rotate: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: {
        label: "rotate",
        control: "slider"
      }
    },
    wrap: {
      type: "int",
      default: 1,
      uniform: "wrap",
      choices: {
        clamp: 0,
        mirror: 1,
        repeat: 2
      },
      ui: {
        label: "wrap",
        control: "dropdown"
      }
    }
  },
  defaultProgram: "search filter, synth\n\ntestPattern()\n.skew(wrap: repeat)\n.write(o0)",
  passes: [
    {
      name: "render",
      program: "skew",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
