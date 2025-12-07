import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Phoenix",
  namespace: "mixer",
  func: "phoenix",

  description: "Unique blend: min + max - abs(a-b)",
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
      program: "phoenix",
      inputs: { tex0: "inputTex", tex1: "tex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
});
