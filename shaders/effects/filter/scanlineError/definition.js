import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Scanline Error",
  namespace: "filter",
  func: "scanlineError",
  tags: ["distort", "glitch"],
  description: "Scanline glitch effect",
  globals: {
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
    enabled: {
      type: "boolean",
      default: true,
      uniform: "enabled",
      ui: {
        label: "enabled",
        control: "checkbox"
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
        enabled: "enabled",
        time: "time"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
