import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/chroma - Isolate specific color with range and feathering
 * Outputs mono mask based on color distance from target hue
 */
export default new Effect({
  name: "Chroma",
  namespace: "filter",
  func: "chroma",
  globals: {
    targetHue: {
      type: "float",
      default: 0.33,
      uniform: "targetHue",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Target Hue",
        control: "slider"
      }
    },
    range: {
      type: "float",
      default: 0.1,
      uniform: "range",
      min: 0,
      max: 0.5,
      step: 0.01,
      ui: {
        label: "Range",
        control: "slider"
      }
    },
    feather: {
      type: "float",
      default: 0.05,
      uniform: "feather",
      min: 0,
      max: 0.25,
      step: 0.01,
      ui: {
        label: "Feather",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "chroma",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
