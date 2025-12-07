import { Effect } from '../../../src/runtime/effect.js';

/**
 * filter/chromaticAberration - Chromatic aberration effect
 */
export default new Effect({
  name: "ChromaticAberration",
  namespace: "filter",
  func: "chromaticAberration",
  globals: {
    aberrationAmt: {
      type: "float",
      default: 50,
      uniform: "aberrationAmt",
      min: 0,
      max: 100,
      ui: {
        label: "aberration",
        control: "slider"
      }
    },
    passthru: {
      type: "float",
      default: 50,
      uniform: "passthru",
      min: 0,
      max: 100,
      ui: {
        label: "passthru",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "chromaticAberration",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
