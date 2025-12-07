import { Effect } from '../../../src/runtime/effect.js';
import { stdEnums } from '../../../src/lang/std_enums.js';

const paletteChoices = {};
for (const [key, val] of Object.entries(stdEnums.palette)) {
  paletteChoices[key] = val.value;
}

export default class ColorLab extends Effect {
  name = "ColorLab";
  namespace = "classicNoisedeck";
  func = "colorLab";

  description = "Color manipulation lab";

  globals = {
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
    colorMode: {
      type: "int",
      default: 2,
      uniform: "colorMode",
      choices: {
        mono: 0,
        linearRgb: 1,
        srgbDefault: 2,
        oklab: 3,
        palette: 4
      },
      ui: {
        label: "color space",
        control: "dropdown"
      }
    },
    palette: {
      type: "palette",
      default: 46,
      uniform: "palette",
      choices: paletteChoices,
      ui: {
        label: "palette",
        control: "dropdown"
      }
    },
    paletteMode: {
      type: "int",
      default: 0,
      uniform: "paletteMode",
      ui: {
        control: false
      }
    },
    paletteOffset: {
      type: "vec3",
      default: [0.83, 0.6, 0.63],
      uniform: "paletteOffset",
      ui: {
        label: "palette offset",
        control: "slider",
        hidden: true
      }
    },
    paletteAmp: {
      type: "vec3",
      default: [0.5, 0.5, 0.5],
      uniform: "paletteAmp",
      ui: {
        label: "palette amplitude",
        control: "slider",
        hidden: true
      }
    },
    paletteFreq: {
      type: "vec3",
      default: [1, 1, 1],
      uniform: "paletteFreq",
      ui: {
        label: "palette frequency",
        control: "slider",
        hidden: true
      }
    },
    palettePhase: {
      type: "vec3",
      default: [0.3, 0.1, 0],
      uniform: "palettePhase",
      ui: {
        label: "palette phase",
        control: "slider",
        hidden: true
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
    repeatPalette: {
      type: "int",
      default: 1,
      uniform: "repeatPalette",
      min: 1,
      max: 5,
      ui: {
        label: "repeat palette",
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
      default: 100,
      uniform: "hueRange",
      min: 0,
      max: 200,
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
    invert: {
      type: "boolean",
      default: false,
      uniform: "invert",
      ui: {
        label: "invert",
        control: "checkbox"
      }
    },
    brightness: {
      type: "int",
      default: 0,
      uniform: "brightness",
      min: -100,
      max: 100,
      ui: {
        label: "brightness",
        control: "slider"
      }
    },
    contrast: {
      type: "int",
      default: 50,
      uniform: "contrast",
      min: 0,
      max: 100,
      ui: {
        label: "contrast",
        control: "slider"
      }
    },
    levels: {
      type: "int",
      default: 0,
      uniform: "levels",
      min: 0,
      max: 32,
      ui: {
        label: "posterize",
        control: "slider"
      }
    },
    dither: {
      type: "int",
      default: 0,
      uniform: "dither",
      choices: {
        none: 0,
        threshold: 1,
        random: 2,
        randomTime: 3,
        bayer: 4
      },
      ui: {
        label: "dither",
        control: "dropdown"
      }
    }
  };

  passes = [
    {
      name: "render",
      program: "colorLab",
      inputs: {
        inputTex: "inputTex"
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ];
}
