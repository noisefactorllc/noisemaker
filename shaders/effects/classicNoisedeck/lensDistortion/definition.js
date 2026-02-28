import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "LensDistortion",
  namespace: "classicNoisedeck",
  func: "lensDistortion",
  tags: ["distort", "color"],

  description: "Lens distortion simulation",
  globals: {
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
    speed: {
      type: "float",
      default: 0,
      uniform: "speed",
      min: -100,
      max: 100,
      ui: {
        label: "speed",
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
        control: "dropdown",
        category: "aberration"
      }
    },
    aberration: {
      type: "float",
      default: 50,
      uniform: "aberration",
      min: 0,
      max: 100,
      ui: {
        label: "aberration",
        control: "slider",
        category: "aberration"
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
        label: "blend mode",
        control: "dropdown",
        category: "aberration"
      }
    },
    modulate: {
      type: "boolean",
      default: false,
      uniform: "modulate",
      ui: {
        label: "modulate",
        control: "checkbox",
        category: "aberration"
      }
    },
    tint: {
      type: "color",
      default: [0.0, 0.0, 0.0],
      uniform: "tint",
      ui: {
        label: "tint",
        control: "color",
        category: "effect"
      }
    },
    alpha: {
      type: "float",
      default: 0,
      uniform: "alpha",
      min: 0,
      max: 100,
      ui: {
        label: "tint opacity",
        control: "slider",
        category: "effect"
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
        control: "slider",
        category: "aberration"
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
        control: "slider",
        category: "aberration"
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
        control: "slider",
        category: "aberration"
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
        control: "slider",
        category: "aberration"
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
        control: "slider",
        category: "effect"
      }
    }
  },
  paramAliases: { aberrationAmt: 'aberration', opacity: 'alpha', loopAmp: 'speed' },
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
})
