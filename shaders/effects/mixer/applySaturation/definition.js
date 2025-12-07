import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Apply Saturation",
  namespace: "mixer",
  func: "applySaturation",
  globals: {
    tex: {
      type: "surface",
      default: "inputTex",
      ui: { label: "source B" }
    },
    mixAmt: {
      type: "float",
      default: 0,
      uniform: "mixAmt",
      min: -100,
      max: 100,
      ui: { label: "mix", control: "slider" }
    }
  },
  passes: [
    {
      name: "render",
      program: "applySaturation",
      inputs: { tex0: "inputTex", tex1: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
});
