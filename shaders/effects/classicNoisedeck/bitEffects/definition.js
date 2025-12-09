import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "BitEffects",
  namespace: "classicNoisedeck",
  func: "bitEffects",

  description: "Bit-crushing and digital artifacts",
  uniformLayout: {
        resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    formula: { slot: 1, components: 'x' },
    colorScheme: { slot: 1, components: 'y' },
    n: { slot: 1, components: 'z' },
    interp: { slot: 1, components: 'w' },
    scale: { slot: 2, components: 'x' },
    rotation: { slot: 2, components: 'y' },
    loopAmp: { slot: 2, components: 'z' },
    mode: { slot: 2, components: 'w' },
    maskFormula: { slot: 3, components: 'x' },
    tiles: { slot: 3, components: 'y' },
    complexity: { slot: 3, components: 'z' },
    maskColorScheme: { slot: 3, components: 'w' },
    hueRange: { slot: 4, components: 'x' },
    hueRotation: { slot: 4, components: 'y' },
    baseHueRange: { slot: 4, components: 'z' }
  },
  globals: {
    mode: {
      type: "int",
      default: 1,
      uniform: "mode",
      choices: {
        bitField: 0,
        bitMask: 1
      },
      ui: {
        label: "mode",
        control: "dropdown",
        category: "general"
      }
    },
    loopAmp: {
      type: "float",
      default: 50,
      uniform: "loopAmp",
      min: 0,
      max: 100,
      ui: {
        label: "speed",
        control: "slider",
        category: "animation"
      }
    },
    formula: {
      type: "int",
      default: 0,
      uniform: "formula",
      choices: {
        alien: 0,
        sierpinski: 1
      },
      ui: {
        label: "formula",
        control: "dropdown",
        category: "bit field"
      }
    },
    n: {
      type: "int",
      default: 1,
      uniform: "n",
      min: 1,
      max: 200,
      ui: {
        label: "mod",
        control: "slider",
        category: "bit field"
      }
    },
    colorScheme: {
      type: "int",
      default: 20,
      uniform: "colorScheme",
      choices: {
        blue: 0,
        cyan: 1,
        green: 2,
        magenta: 3,
        red: 4,
        white: 5,
        yellow: 6,
        blueAndGreen: 10,
        blueAndRed: 11,
        blueAndYellow: 12,
        greenAndMagenta: 13,
        greenAndRed: 14,
        redAndCyan: 15,
        redGreenAndBlue: 20
      },
      ui: {
        label: "colors",
        control: "dropdown",
        category: "bit field"
      }
    },
    interp: {
      type: "int",
      default: 0,
      uniform: "interp",
      choices: {
        constant: 0,
        linear: 1
      },
      ui: {
        label: "blend",
        control: "dropdown",
        category: "bit field"
      }
    },
    scale: {
      type: "float",
      default: 75,
      uniform: "scale",
      min: 1,
      max: 100,
      ui: {
        label: "scale",
        control: "slider",
        category: "transform"
      }
    },
    rotation: {
      type: "int",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: {
        label: "rotate",
        control: "slider",
        category: "transform"
      }
    },
    maskFormula: {
      type: "int",
      default: 10,
      uniform: "maskFormula",
      choices: {
        invaders: 10,
        wideInvaders: 11,
        glyphs: 20,
        areciboNumber: 30
      },
      ui: {
        label: "formula",
        control: "dropdown",
        category: "bit mask"
      }
    },
    tiles: {
      type: "int",
      default: 5,
      uniform: "tiles",
      min: 1,
      max: 40,
      ui: {
        label: "tiles",
        control: "slider",
        category: "bit mask"
      }
    },
    complexity: {
      type: "float",
      default: 57,
      uniform: "complexity",
      min: 1,
      max: 100,
      ui: {
        label: "complexity",
        control: "slider",
        category: "bit mask"
      }
    },
    maskColorScheme: {
      type: "int",
      default: 1,
      uniform: "maskColorScheme",
      choices: {
        blackWhite: 0,
        justHue: 3,
        hueSaturation: 2,
        hsv: 1
      },
      ui: {
        label: "color space",
        control: "dropdown",
        category: "bit mask"
      }
    },
    baseHueRange: {
      type: "float",
      default: 50,
      uniform: "baseHueRange",
      min: 0,
      max: 100,
      ui: {
        label: "hue variants",
        control: "slider",
        category: "bit mask"
      }
    },
    hueRotation: {
      type: "float",
      default: 180,
      uniform: "hueRotation",
      min: 0,
      max: 360,
      ui: {
        label: "hue rotate",
        control: "slider",
        category: "bit mask"
      }
    },
    hueRange: {
      type: "float",
      default: 25,
      uniform: "hueRange",
      min: 0,
      max: 100,
      ui: {
        label: "hue range",
        control: "slider",
        category: "bit mask"
      }
    },
    seed: {
      type: "int",
      default: 63,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider",
        category: "util"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "bitEffects",
      inputs: {
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
