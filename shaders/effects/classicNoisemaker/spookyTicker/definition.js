import { Effect } from '../../../src/runtime/effect.js'

/**
 * Spooky Ticker
 * /shaders/effects/spooky_ticker/spooky_ticker.wgsl
 */
export default new Effect({
  name: "SpookyTicker",
  namespace: "classicNoisemaker",
  func: "spookyTicker",

  description: "Spooky scrolling text",
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
    }
  },
  passes: [
    {
      name: "main",
      program: "spookyTicker",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        speed: "speed"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
