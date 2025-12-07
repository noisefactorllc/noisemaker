import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/zoomBlur - Zoom/radial blur effect
 * Creates a radial blur emanating from the center
 */
export default new Effect({
  name: "ZoomBlur",
  namespace: "filter",
  func: "zoomBlur",
  globals: {
    strength: {
      type: "float",
      default: 0.5,
      uniform: "strength",
      min: 0,
      max: 1,
      ui: {
        label: "strength",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "zoomBlur",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
