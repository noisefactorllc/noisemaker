import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Palette",
  namespace: "classicNoisedeck",
  func: "palette",
  globals: {
    paletteType: {
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
    cyclePalette: {
      type: "int",
      default: 1,
      uniform: "cyclePalette",
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
    rotatePalette: {
      type: "float",
      default: 0,
      uniform: "rotatePalette",
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
      type: "vec3",
      default: [1.0, 0.0, 0.0],
      uniform: "color1",
      ui: {
        label: "color 1",
        control: "color"
      }
    },
    color2: {
      type: "vec3",
      default: [1.0, 1.0, 0.0],
      uniform: "color2",
      ui: {
        label: "color 2",
        control: "color"
      }
    },
    color3: {
      type: "vec3",
      default: [0.0, 1.0, 0.0],
      uniform: "color3",
      ui: {
        label: "color 3",
        control: "color"
      }
    },
    color4: {
      type: "vec3",
      default: [0.0, 1.0, 1.0],
      uniform: "color4",
      ui: {
        label: "color 4",
        control: "color"
      }
    },
    color5: {
      type: "vec3",
      default: [0.0, 0.0, 1.0],
      uniform: "color5",
      ui: {
        label: "color 5",
        control: "color"
      }
    },
    tint: {
      type: "vec3",
      default: [1.0, 1.0, 1.0],
      uniform: "tint",
      ui: {
        label: "tint",
        control: "color"
      }
    },
    smoother: {
      type: "boolean",
      default: true,
      uniform: "smoother",
      ui: {
        label: "smoother",
        control: "checkbox"
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
        control: "slider"
      }
    },
    offsetR: {
      type: "float",
      default: 50,
      uniform: "offsetR",
      min: 0,
      max: 100,
      ui: {
        label: "offset R",
        control: "slider"
      }
    },
    phaseR: {
      type: "float",
      default: 0,
      uniform: "phaseR",
      min: 0,
      max: 100,
      ui: {
        label: "phase R",
        control: "slider"
      }
    },
    offsetG: {
      type: "float",
      default: 50,
      uniform: "offsetG",
      min: 0,
      max: 100,
      ui: {
        label: "offset G",
        control: "slider"
      }
    },
    phaseG: {
      type: "float",
      default: 33,
      uniform: "phaseG",
      min: 0,
      max: 100,
      ui: {
        label: "phase G",
        control: "slider"
      }
    },
    offsetB: {
      type: "float",
      default: 50,
      uniform: "offsetB",
      min: 0,
      max: 100,
      ui: {
        label: "offset B",
        control: "slider"
      }
    },
    phaseB: {
      type: "float",
      default: 67,
      uniform: "phaseB",
      min: 0,
      max: 100,
      ui: {
        label: "phase B",
        control: "slider"
      }
    },
    ampR: {
      type: "float",
      default: 50,
      uniform: "ampR",
      min: 0,
      max: 100,
      ui: {
        label: "amp R",
        control: "slider"
      }
    },
    ampG: {
      type: "float",
      default: 50,
      uniform: "ampG",
      min: 0,
      max: 100,
      ui: {
        label: "amp G",
        control: "slider"
      }
    },
    ampB: {
      type: "float",
      default: 50,
      uniform: "ampB",
      min: 0,
      max: 100,
      ui: {
        label: "amp B",
        control: "slider"
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
        label: "mode",
        control: "dropdown"
      }
    }
  },
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
});
