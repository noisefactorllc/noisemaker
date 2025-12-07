import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "LensDistortion",
  namespace: "classicNoisedeck",
  func: "lensDistortion",

  description: "Lens distortion simulation",
  globals: {
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
    shape: {
      type: "int",
      default: 0,
      uniform: "shape",
      choices: {
        circle: 0,
        cosine: 10,
        diamond: 1,
        hexagon: 2,
        octagon: 3,
        square: 4,
        triangle: 6
      },
      ui: {
        label: "shape",
        control: "dropdown"
      }
    },
    distortion: {
      type: "float",
      default: 0,
      uniform: "distortion",
      min: -100,
      max: 100,
      ui: {
        label: "distortion",
        control: "slider"
      }
    },
    loopScale: {
      type: "float",
      default: 100,
      uniform: "loopScale",
      min: 1,
      max: 100,
      ui: {
        label: "loop scale",
        control: "slider"
      }
    },
    loopAmp: {
      type: "float",
      default: 0,
      uniform: "loopAmp",
      min: -100,
      max: 100,
      ui: {
        label: "loop power",
        control: "slider"
      }
    },
    aspectLens: {
      type: "boolean",
      default: false,
      uniform: "aspectLens",
      ui: {
        label: "1:1 aspect",
        control: "checkbox"
      }
    },
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        chromaticRgb: 0,
        prismaticHsv: 1
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
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
    blendMode: {
      type: "int",
      default: 0,
      uniform: "blendMode",
      choices: {
        add: 0,
        alpha: 1
      },
      ui: {
        label: "blend",
        control: "dropdown"
      }
    },
    modulate: {
      type: "boolean",
      default: false,
      uniform: "modulate",
      ui: {
        label: "modulate",
        control: "checkbox"
      }
    },
    tint: {
      type: "vec3",
      default: [0.0, 0.0, 0.0],
      uniform: "tint",
      ui: {
        label: "tint",
        control: "color"
      }
    },
    opacity: {
      type: "float",
      default: 0,
      uniform: "opacity",
      min: 0,
      max: 100,
      ui: {
        label: "tint opacity",
        control: "slider"
      }
    },
    hueRotation: {
      type: "float",
      default: 0,
      uniform: "hueRotation",
      min: 0,
      max: 360,
      ui: {
        label: "hue rotate",
        control: "slider"
      }
    },
    hueRange: {
      type: "float",
      default: 0,
      uniform: "hueRange",
      min: 0,
      max: 100,
      ui: {
        label: "hue range",
        control: "slider"
      }
    },
    saturation: {
      type: "float",
      default: 0,
      uniform: "saturation",
      min: -100,
      max: 100,
      ui: {
        label: "saturation",
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
    },
    vignetteAmt: {
      type: "float",
      default: 0,
      uniform: "vignetteAmt",
      min: -100,
      max: 100,
      ui: {
        label: "vignette",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "lensDistortion",
      inputs: {
        inputTex: "inputTex"
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
