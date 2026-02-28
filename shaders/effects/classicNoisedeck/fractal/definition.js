import { Effect } from '../../../src/runtime/effect.js'
import { stdEnums } from '../../../src/lang/std_enums.js'

const paletteChoices = {}
for (const [key, val] of Object.entries(stdEnums.palette)) {
  paletteChoices[key] = val.value
}

export default class Fractal extends Effect {
  name = "Fractal"
  namespace = "classicNoisedeck"
  func = "fractal"
  tags = ["geometric"]

  description = "Fractal pattern generator"

  // WGSL uniform packing layout - contiguous vec3/vec4 layout
  uniformLayout = {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    type: { slot: 1, components: 'x' },
    symmetry: { slot: 1, components: 'y' },
    offsetX: { slot: 1, components: 'z' },
    offsetY: { slot: 1, components: 'w' },
    centerX: { slot: 2, components: 'x' },
    centerY: { slot: 2, components: 'y' },
    zoomAmt: { slot: 2, components: 'z' },
    speed: { slot: 2, components: 'w' },
    rotation: { slot: 3, components: 'x' },
    iterations: { slot: 3, components: 'y' },
    mode: { slot: 3, components: 'z' },
    colorMode: { slot: 3, components: 'w' },
    paletteMode: { slot: 4, components: 'x' },
    cyclePalette: { slot: 4, components: 'y' },
    rotatePalette: { slot: 4, components: 'z' },
    repeatPalette: { slot: 4, components: 'w' },
    paletteOffset: { slot: 5, components: 'xyz' },
    hueRange: { slot: 5, components: 'w' },
    paletteAmp: { slot: 6, components: 'xyz' },
    levels: { slot: 6, components: 'w' },
    paletteFreq: { slot: 7, components: 'xyz' },
    bgAlpha: { slot: 7, components: 'w' },
    palettePhase: { slot: 8, components: 'xyz' },
    cutoff: { slot: 8, components: 'w' },
    bgColor: { slot: 9, components: 'xyz' }
  }

  globals = {
    type: {
      type: "int",
      default: 0,
      uniform: "type",
      choices: {
        julia: 0,
        mandelbrot: 2,
        newton: 1
      },
      ui: {
        label: "type",
        control: "dropdown"
      }
    },
    symmetry: {
      type: "int",
      default: 0,
      uniform: "symmetry",
      ui: {
        label: "symmetry",
        control: "slider"
      }
    },
    zoomAmt: {
      type: "float",
      default: 0,
      uniform: "zoomAmt",
      min: 0,
      max: 130,
      ui: {
        label: "zoom",
        control: "slider",
        category: "transform"
      }
    },
    rotation: {
      type: "float",
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
    speed: {
      type: "float",
      default: 30,
      uniform: "speed",
      min: 0,
      max: 100,
      ui: {
        label: "speed",
        control: "slider",
        category: "animation"
      }
    },
    offsetX: {
      type: "float",
      default: 70,
      uniform: "offsetX",
      min: -100,
      max: 100,
      ui: {
        label: "offset x",
        control: "slider",
        category: "transform"
      }
    },
    offsetY: {
      type: "float",
      default: 50,
      uniform: "offsetY",
      min: -100,
      max: 100,
      ui: {
        label: "offset y",
        control: "slider",
        category: "transform"
      }
    },
    centerX: {
      type: "float",
      default: 0,
      uniform: "centerX",
      min: -100,
      max: 100,
      ui: {
        label: "center x",
        control: "slider",
        category: "transform"
      }
    },
    centerY: {
      type: "float",
      default: 0,
      uniform: "centerY",
      min: -100,
      max: 100,
      ui: {
        label: "center y",
        control: "slider",
        category: "transform"
      }
    },
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        iter: 0,
        z: 1
      },
      ui: {
        label: "mode",
        control: "dropdown",
        category: "rendering"
      }
    },
    iterations: {
      type: "int",
      default: 50,
      uniform: "iterations",
      min: 1,
      max: 50,
      ui: {
        label: "iterations",
        control: "slider",
        category: "rendering"
      }
    },
    colorMode: {
      type: "int",
      default: 4,
      uniform: "colorMode",
      choices: {
        mono: 0,
        palette: 4,
        hsv: 6
      },
      ui: {
        label: "color mode",
        control: "dropdown",
        category: "color"
      }
    },
    palette: {
      type: "palette",
      default: 12,
      uniform: "palette",
      choices: paletteChoices,
      ui: {
        label: "palette",
        control: "dropdown",
        category: "palette",
        enabledBy: { param: "colorMode", eq: 4 }
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
      default: [0.5, 0.5, 0.5],
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
      default: [0, 0, 0],
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
        control: "dropdown",
        category: "palette",
        enabledBy: { param: "colorMode", eq: 4 }
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
        control: "slider",
        category: "palette",
        enabledBy: { param: "colorMode", eq: 4 }
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
        control: "slider",
        category: "palette",
        enabledBy: { param: "colorMode", eq: 4 }
      }
    },
    hueRange: {
      type: "float",
      default: 100,
      uniform: "hueRange",
      min: 1,
      max: 100,
      ui: {
        label: "hue range",
        control: "slider",
        category: "color"
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
        control: "slider",
        category: "color"
      }
    },
    bgColor: {
      type: "color",
      default: [0.0, 0.0, 0.0],
      uniform: "bgColor",
      ui: {
        label: "background color",
        control: "color",
        category: "background"
      }
    },
    bgAlpha: {
      type: "float",
      default: 100,
      uniform: "bgAlpha",
      min: 0,
      max: 100,
      ui: {
        label: "background opacity",
        control: "slider",
        category: "background"
      }
    },
    cutoff: {
      type: "float",
      default: 0,
      uniform: "cutoff",
      min: 0,
      max: 100,
      ui: {
        label: "cutoff",
        control: "slider",
        category: "background"
      }
    }
  }

  paramAliases = { fractalType: 'type', backgroundColor: 'bgColor', backgroundOpacity: 'bgAlpha' }


  passes = [
    {
      name: "render",
      program: "fractal",
      inputs: {
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
}
