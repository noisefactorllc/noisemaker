import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "BlendMode",
  namespace: "mixer",
  func: "blendMode",
  tags: ["color"],

  description: "Blend two inputs using selectable blend mode",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: { label: "source b" }
    },
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        add: 0,
        burn: 1,
        darken: 2,
        diff: 3,
        dodge: 4,
        exclusion: 5,
        hardLight: 6,
        lighten: 7,
        mix: 8,
        multiply: 9,
        negation: 10,
        overlay: 11,
        phoenix: 12,
        screen: 13,
        softLight: 14,
        subtract: 15
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    mix: {
      type: "float",
      default: 0,
      uniform: "mixAmt",
      min: -100,
      max: 100,
      ui: { label: "mix", control: "slider" }
    }
  },
  defaultProgram: "search mixer, synth\n\nnoise(ridges: true, colorMode: mono)\n.write(o0)\n\nperlin()\n.blendMode(tex: read(o0), mode: phoenix)\n.write(o1)",
  paramAliases: { mixAmt: 'mix' },
  passes: [
    {
      name: "render",
      program: "blendMode",
      inputs: { inputTex: "inputTex", tex: "tex" },
      uniforms: { mixAmt: "mix" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
