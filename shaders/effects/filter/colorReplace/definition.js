import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Color Replace",
  namespace: "filter",
  func: "colorReplace",
  tags: ["color", "util"],

  description: "Color replacement with alpha output. Matches pixels near targetColor and remaps their RGB and/or alpha.",
  globals: {
    targetColor: {
      type: "color",
      default: [0.0, 0.0, 0.0],
      uniform: "targetColor",
      ui: {
        label: "target color",
        control: "color"
      }
    },
    replaceColor: {
      type: "color",
      default: [1.0, 1.0, 1.0],
      uniform: "replaceColor",
      ui: {
        label: "replace color",
        control: "color"
      }
    },
    sensitivity: {
      type: "float",
      default: 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      uniform: "sensitivity",
      ui: {
        label: "sensitivity",
        control: "slider"
      }
    },
    smoothing: {
      type: "float",
      default: 0.1,
      min: 0,
      max: 1,
      step: 0.01,
      uniform: "smoothing",
      ui: {
        label: "smoothing",
        control: "slider"
      }
    },
    colorMix: {
      type: "float",
      default: 1.0,
      min: 0,
      max: 1,
      step: 0.01,
      uniform: "colorMix",
      ui: {
        label: "color mix",
        control: "slider"
      }
    },
    replaceAlpha: {
      type: "float",
      default: 1.0,
      min: 0,
      max: 1,
      step: 0.01,
      uniform: "replaceAlpha",
      ui: {
        label: "matched α",
        control: "slider"
      }
    },
    keepAlpha: {
      type: "float",
      default: 1.0,
      min: 0,
      max: 1,
      step: 0.01,
      uniform: "keepAlpha",
      ui: {
        label: "unmatched α",
        control: "slider"
      }
    }
  },
  defaultProgram: "search filter, synth\n\nnoise(ridges: true, colorMode: mono)\n.colorReplace(targetColor: #000000, replaceColor: #ff0000, sensitivity: 0.4, smoothing: 0.2)\n.write(o0)",
  passes: [
    {
      name: "main",
      program: "colorReplace",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
})
