import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Scanline Error",
  namespace: "filter",
  func: "scanlineError",
  tags: ["distort", "glitch"],
  description: "Scanline glitch effect/VHS tape artifacts",
  globals: {
    mode: {
      type: "int",
      default: 1,
      uniform: "mode",
      choices: {
        "scanline": 0,
        "vhs": 1
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    timeOffset: {
      type: "float",
      default: 0,
      uniform: "timeOffset",
      min: -10,
      max: 10,
      step: 0.01,
      ui: {
        label: "time offset",
        control: "slider"
      }
    },
    distortion: {
      type: "float",
      default: 1,
      uniform: "distortion",
      min: 0,
      max: 3,
      step: 0.01,
      ui: {
        label: "distortion",
        control: "slider"
      }
    },
    noise: {
      type: "float",
      default: 1,
      uniform: "noise",
      min: 0,
      max: 3,
      step: 0.01,
      ui: {
        label: "noise",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 1,
      uniform: "speed",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "speed",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "scanlineError",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        speed: "speed",
        timeOffset: "timeOffset",
        distortion: "distortion",
        noise: "noise",
        mode: "mode",
        time: "time"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
