import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "ThresholdMix",
  namespace: "mixer",
  func: "thresholdMix",
  tags: ["blend"],

  description: "Blend using threshold masking",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: {
        label: "source b"
      }
    },
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        luminance: 0,
        rgb: 1
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    quantize: {
      type: "int",
      default: 0,
      uniform: "quantize",
      min: 0,
      max: 8,
      ui: {
        label: "quantize",
        control: "slider"
      }
    },
    mapSource: {
      type: "int",
      default: 1,
      uniform: "mapSource",
      choices: {
        sourceA: 0,
        sourceB: 1
      },
      ui: {
        label: "map source",
        control: "dropdown"
      }
    },
    threshold: {
      type: "float",
      default: 0.5,
      uniform: "threshold",
      min: 0,
      max: 1,
      ui: {
        label: "threshold",
        control: "slider",
        enabledBy: { param: "mode", eq: 0 }
      }
    },
    range: {
      type: "float",
      default: 0,
      uniform: "range",
      min: 0,
      max: 1,
      ui: {
        label: "range",
        control: "slider",
        enabledBy: { param: "mode", eq: 0 }
      }
    },
    thresholdR: {
      type: "float",
      default: 0.5,
      uniform: "thresholdR",
      min: 0,
      max: 1,
      ui: {
        label: "threshold r",
        control: "slider",
        category: "rgb",
        enabledBy: { param: "mode", eq: 1 }
      }
    },
    rangeR: {
      type: "float",
      default: 0,
      uniform: "rangeR",
      min: 0,
      max: 1,
      ui: {
        label: "range r",
        control: "slider",
        category: "rgb",
        enabledBy: { param: "mode", eq: 1 }
      }
    },
    thresholdG: {
      type: "float",
      default: 0.5,
      uniform: "thresholdG",
      min: 0,
      max: 1,
      ui: {
        label: "threshold g",
        control: "slider",
        category: "rgb",
        enabledBy: { param: "mode", eq: 1 }
      }
    },
    rangeG: {
      type: "float",
      default: 0,
      uniform: "rangeG",
      min: 0,
      max: 1,
      ui: {
        label: "range g",
        control: "slider",
        category: "rgb",
        enabledBy: { param: "mode", eq: 1 }
      }
    },
    thresholdB: {
      type: "float",
      default: 0.5,
      uniform: "thresholdB",
      min: 0,
      max: 1,
      ui: {
        label: "threshold b",
        control: "slider",
        category: "rgb",
        enabledBy: { param: "mode", eq: 1 }
      }
    },
    rangeB: {
      type: "float",
      default: 0,
      uniform: "rangeB",
      min: 0,
      max: 1,
      ui: {
        label: "range b",
        control: "slider",
        category: "rgb",
        enabledBy: { param: "mode", eq: 1 }
      }
    }
  },
  defaultProgram: "search mixer, synth\n\nnoise()\n.write(o0)\n\nsolid(color: #000000)\n.thresholdMix(tex: read(o0))\n.write(o1)\n",
  passes: [
    {
      name: "render",
      program: "thresholdMix",
      inputs: {
        inputTex: "inputTex",
        tex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
