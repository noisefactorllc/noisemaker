import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Palette",
  namespace: "classicNoisedeck",
  func: "palette",
  tags: ["color"],

  description: "Color palette mapping",
  globals: {
    type: {
      type: "int",
      default: 0,
      uniform: "paletteType",
      choices: {
        cosine: 0,
        fiveColor: 1
      },
      ui: {
        label: "palette type",
        control: "dropdown"
      }
    },
    cycle: {
      type: "int",
      default: 1,
      uniform: "cycle",
      choices: {
        off: 0,
        forward: 1,
        backward: -1
      },
      ui: {
        label: "cycle palette",
        control: "dropdown"
      }
    },
    rotate: {
      type: "float",
      default: 0,
      uniform: "rotate",
      min: 0,
      max: 100,
      ui: {
        label: "rotate palette",
        control: "slider"
      }
    },
    freq: {
      type: "int",
      default: 1,
      uniform: "freq",
      min: 1,
      max: 4,
      ui: {
        label: "freq",
        control: "slider"
      }
    },
    color1: {
      type: "color",
      default: [1.0, 0.0, 0.0],
      uniform: "color1",
      ui: {
        label: "color 1",
        control: "color",
        category: "five color"
      }
    },
    color2: {
      type: "color",
      default: [1.0, 1.0, 0.0],
      uniform: "color2",
      ui: {
        label: "color 2",
        control: "color",
        category: "five color"
      }
    },
    color3: {
      type: "color",
      default: [0.0, 1.0, 0.0],
      uniform: "color3",
      ui: {
        label: "color 3",
        control: "color",
        category: "five color"
      }
    },
    color4: {
      type: "color",
      default: [0.0, 1.0, 1.0],
      uniform: "color4",
      ui: {
        label: "color 4",
        control: "color",
        category: "five color"
      }
    },
    color5: {
      type: "color",
      default: [0.0, 0.0, 1.0],
      uniform: "color5",
      ui: {
        label: "color 5",
        control: "color",
        category: "five color"
      }
    },
    tint: {
      type: "color",
      default: [1.0, 1.0, 1.0],
      uniform: "tint",
      ui: {
        label: "tint",
        control: "color",
        category: "five color"
      }
    },
    smoother: {
      type: "boolean",
      default: true,
      uniform: "smoother",
      ui: {
        label: "smoother",
        control: "checkbox",
        category: "five color"
      }
    },
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider",
        category: "util"
      }
    },
    offsetR: {
      type: "float",
      default: 50,
      uniform: "offsetR",
      min: 0,
      max: 100,
      ui: {
        label: "offset r",
        control: "slider",
        category: "cosine"
      }
    },
    phaseR: {
      type: "float",
      default: 0,
      uniform: "phaseR",
      min: 0,
      max: 100,
      ui: {
        label: "phase r",
        control: "slider",
        category: "cosine"
      }
    },
    offsetG: {
      type: "float",
      default: 50,
      uniform: "offsetG",
      min: 0,
      max: 100,
      ui: {
        label: "offset g",
        control: "slider",
        category: "cosine"
      }
    },
    phaseG: {
      type: "float",
      default: 33,
      uniform: "phaseG",
      min: 0,
      max: 100,
      ui: {
        label: "phase g",
        control: "slider",
        category: "cosine"
      }
    },
    offsetB: {
      type: "float",
      default: 50,
      uniform: "offsetB",
      min: 0,
      max: 100,
      ui: {
        label: "offset b",
        control: "slider",
        category: "cosine"
      }
    },
    phaseB: {
      type: "float",
      default: 67,
      uniform: "phaseB",
      min: 0,
      max: 100,
      ui: {
        label: "phase b",
        control: "slider",
        category: "cosine"
      }
    },
    ampR: {
      type: "float",
      default: 50,
      uniform: "ampR",
      min: 0,
      max: 100,
      ui: {
        label: "amp r",
        control: "slider",
        category: "cosine"
      }
    },
    ampG: {
      type: "float",
      default: 50,
      uniform: "ampG",
      min: 0,
      max: 100,
      ui: {
        label: "amp g",
        control: "slider",
        category: "cosine"
      }
    },
    ampB: {
      type: "float",
      default: 50,
      uniform: "ampB",
      min: 0,
      max: 100,
      ui: {
        label: "amp b",
        control: "slider",
        category: "cosine"
      }
    },
    colorMode: {
      type: "int",
      default: 2,
      uniform: "colorMode",
      choices: {
        hsv: 0,
        oklab: 1,
        rgb: 2
      },
      ui: {
        label: "color mode",
        control: "dropdown",
        category: "cosine"
      }
    }
  },
  paramAliases: { paletteType: 'type', cyclePalette: 'cycle', rotatePalette: 'rotate' },
  passes: [
    {
      name: "render",
      program: "palette",
      inputs: {
        inputTex: "inputTex"
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
