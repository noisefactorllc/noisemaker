import { Effect } from '../../../src/runtime/effect.js'
import { stdEnums } from '../../../src/lang/std_enums.js'

const paletteChoices = {}
for (const [key, val] of Object.entries(stdEnums.palette)) {
  paletteChoices[key] = val.value
}

export default class CellNoise extends Effect {
  name = "CellNoise"
  namespace = "classicNoisedeck"
  func = "cellNoise"
  tags = ["noise", "geometric"]

  description = "Cellular noise patterns"


  // WGSL uniform packing layout - maps uniform names to vec4 slots/components
  uniformLayout = {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    metric: { slot: 1, components: 'x' },
    scale: { slot: 1, components: 'y' },
    cellScale: { slot: 1, components: 'z' },
    cellSmooth: { slot: 1, components: 'w' },
    cellVariation: { slot: 2, components: 'x' },
    loopAmp: { slot: 2, components: 'y' },
    paletteMode: { slot: 2, components: 'z' },
    colorMode: { slot: 2, components: 'w' },
    paletteOffset: { slot: 3, components: 'xyz' },
    cyclePalette: { slot: 3, components: 'w' },
    paletteAmp: { slot: 4, components: 'xyz' },
    rotatePalette: { slot: 4, components: 'w' },
    paletteFreq: { slot: 5, components: 'xyz' },
    repeatPalette: { slot: 5, components: 'w' },
    palettePhase: { slot: 6, components: 'xyz' },
    texInfluence: { slot: 7, components: 'x' },
    texIntensity: { slot: 7, components: 'y' }
  }
  globals = {
    shape: {
      type: "int",
      default: 0,
      uniform: "metric",
      choices: {
        circle: 0,
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
    scale: {
      type: "float",
      default: 75,
      uniform: "scale",
      min: 1,
      max: 100,
      ui: {
        label: "noise scale",
        control: "slider"
      }
    },
    cellScale: {
      type: "float",
      default: 87,
      uniform: "cellScale",
      min: 1,
      max: 100,
      ui: {
        label: "cell scale",
        control: "slider"
      }
    },
    smooth: {
      type: "float",
      default: 11,
      uniform: "cellSmooth",
      min: 0,
      max: 100,
      ui: {
        label: "cell smooth",
        control: "slider"
      }
    },
    variation: {
      type: "float",
      default: 50,
      uniform: "cellVariation",
      min: 0,
      max: 100,
      ui: {
        label: "cell variation",
        control: "slider"
      }
    },
    speed: {
      type: "int",
      default: 1,
      uniform: "loopAmp",
      min: 0,
      max: 5,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    paletteMode: {
      type: "int",
      default: 4,
      uniform: "paletteMode",
      ui: {
        control: false
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
    colorMode: {
      type: "int",
      default: 0,
      uniform: "colorMode",
      choices: {
        mono: 0,
        monoInverse: 1,
        palette: 2
      },
      ui: {
        label: "color mode",
        control: "dropdown"
      }
    },
    palette: {
      type: "palette",
      default: 32,
      uniform: "palette",
      choices: paletteChoices,
      ui: {
        label: "palette",
        control: "dropdown",
        category: "palette",
        enabledBy: { param: "colorMode", eq: 2 }
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
        label: "rotation",
        control: "dropdown",
        category: "palette",
        enabledBy: { param: "colorMode", eq: 2 }
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
    rotatePalette: {
      type: "float",
      default: 0,
      uniform: "rotatePalette",
      min: 0,
      max: 100,
      ui: {
        label: "offset",
        control: "slider",
        category: "palette",
        enabledBy: { param: "colorMode", eq: 2 }
      }
    },
    paletteFreq: {
      type: "vec3",
      default: [2, 2, 2],
      uniform: "paletteFreq",
      ui: {
        label: "palette frequency",
        control: "slider",
        hidden: true
      }
    },
    repeatPalette: {
      type: "int",
      default: 1,
      uniform: "repeatPalette",
      min: 1,
      max: 5,
      ui: {
        label: "repeat",
        control: "slider",
        category: "palette",
        enabledBy: { param: "colorMode", eq: 2 }
      }
    },
    palettePhase: {
      type: "vec3",
      default: [1, 1, 1],
      uniform: "palettePhase",
      ui: {
        label: "palette phase",
        control: "slider",
        hidden: true
      }
    },
    tex: {
      type: "surface",
      default: "none",
      ui: {
        label: "texture",
        category: "input"
      }
    },
    texInfluence: {
      type: "int",
      default: 2,
      uniform: "texInfluence",
      choices: {
        add: 10,
        divide: 11,
        min: 12,
        max: 13,
        mod: 14,
        multiply: 15,
        subtract: 16,
        warp: 2,
      },
      ui: {
        label: "influence",
        control: "dropdown",
        category: "input",
        enabledBy: { param: "tex", neq: "none" }
      }
    },
    texIntensity: {
      type: "float",
      default: 0,
      uniform: "texIntensity",
      min: 0,
      max: 100,
      ui: {
        label: "input weight",
        control: "slider",
        category: "input",
        enabledBy: { param: "tex", neq: "none" }
      }
    }
  }

  paramAliases = { cellSmooth: 'smooth', cellVariation: 'variation', loopAmp: 'speed' }


  passes = [
    {
      name: "render",
      program: "cellNoise",
      inputs: {
        tex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
}
