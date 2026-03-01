import { Effect } from '../../../src/runtime/effect.js'
import { stdEnums } from '../../../src/lang/std_enums.js'

const paletteChoices = {}
for (const [key, val] of Object.entries(stdEnums.palette)) {
  paletteChoices[key] = val.value
}

export default class Noise extends Effect {
  name = "Noise"
  namespace = "classicNoisedeck"
  func = "noise"
  tags = ["noise"]
  openCategories = ["general", "transform", "color"]

  description = "Noise pattern generator"

  // WGSL uniform packing layout - maps uniform names to vec4 slots/components
  uniformLayout = {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    aspectRatio: { slot: 0, components: 'w' },
    xScale: { slot: 1, components: 'x' },
    yScale: { slot: 1, components: 'y' },
    seed: { slot: 1, components: 'z' },
    loopScale: { slot: 1, components: 'w' },
    speed: { slot: 2, components: 'x' },
    loopOffset: { slot: 2, components: 'y' },
    type: { slot: 2, components: 'z' },
    octaves: { slot: 2, components: 'w' },
    ridges: { slot: 3, components: 'x' },
    wrap: { slot: 3, components: 'y' },
    refractMode: { slot: 3, components: 'z' },
    refractAmt: { slot: 3, components: 'w' },
    kaleido: { slot: 4, components: 'x' },
    metric: { slot: 4, components: 'y' },
    colorMode: { slot: 4, components: 'z' },
    paletteMode: { slot: 4, components: 'w' },
    cyclePalette: { slot: 5, components: 'x' },
    rotatePalette: { slot: 5, components: 'y' },
    repeatPalette: { slot: 5, components: 'z' },
    hueRange: { slot: 5, components: 'w' },
    hueRotation: { slot: 6, components: 'x' },
    paletteOffset: { slot: 7, components: 'xyz' },
    paletteAmp: { slot: 8, components: 'xyz' },
    paletteFreq: { slot: 9, components: 'xyz' },
    palettePhase: { slot: 10, components: 'xyz' }
  }

  globals = {
    type: {
      type: "int",
      default: 10,
      uniform: "type",
      choices: {
        constant: 0,
        linear: 1,
        hermite: 2,
        catmullRom3x3: 3,
        catmullRom4x4: 4,
        bSpline3x3: 5,
        bSpline4x4: 6,
        simplex: 10,
        sine: 11
      },
      ui: {
        label: "noise type",
        control: "dropdown"
      }
    },
    octaves: {
      type: "int",
      default: 2,
      uniform: "octaves",
      min: 1,
      max: 8,
      ui: {
        label: "octaves",
        control: "slider"
      }
    },
    xScale: {
      type: "float",
      default: 75,
      uniform: "xScale",
      min: 1,
      max: 100,
      ui: {
        label: "horiz scale",
        control: "slider",
        category: "transform"
      }
    },
    yScale: {
      type: "float",
      default: 75,
      uniform: "yScale",
      min: 1,
      max: 100,
      ui: {
        label: "vert scale",
        control: "slider",
        category: "transform"
      }
    },
    ridges: {
      type: "boolean",
      default: false,
      uniform: "ridges",
      ui: {
        label: "ridges",
        control: "checkbox"
      }
    },
    wrap: {
      type: "boolean",
      default: true,
      uniform: "wrap",
      ui: {
        label: "wrap",
        control: "checkbox",
        enabledBy: { param: "type", notIn: [10, 11] },
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
    refractMode: {
      type: "int",
      default: 2,
      uniform: "refractMode",
      choices: {
        color: 0,
        topology: 1,
        colorTopology: 2
      },
      ui: {
        label: "refract mode",
        control: "dropdown",
        category: "refract"
      }
    },
    refractAmt: {
      type: "float",
      default: 0,
      uniform: "refractAmt",
      min: 0,
      max: 100,
      ui: {
        label: "refract",
        control: "slider",
        category: "refract"
      }
    },

    loopOffset: {
      type: "int",
      default: 300,
      uniform: "loopOffset",
      choices: {
        "Shapes:": null,
        circle: 10,
        triangle: 20,
        diamond: 30,
        square: 40,
        pentagon: 50,
        hexagon: 60,
        heptagon: 70,
        octagon: 80,
        nonagon: 90,
        decagon: 100,
        hendecagon: 110,
        dodecagon: 120,
        "Directional:": null,
        horizontalScan: 200,
        verticalScan: 210,
        "Misc:": null,
        noise: 300,
        rings: 400,
        sine: 410
      },
      ui: {
        label: "loop offset",
        control: "dropdown",
        category: "animation"
      }
    },
    loopScale: {
      type: "float",
      default: 75,
      uniform: "loopScale",
      min: 1,
      max: 100,
      ui: {
        label: "loop scale",
        control: "slider",
        category: "animation"
      }
    },
    speed: {
      type: "float",
      default: 25,
      uniform: "speed",
      min: -100,
      max: 100,
      zero: 0,
      ui: {
        label: "speed",
        control: "slider",
        category: "animation"
      }
    },
    kaleido: {
      type: "int",
      default: 1,
      uniform: "kaleido",
      min: 1,
      max: 32,
      randChance: 0,
      ui: {
        label: "kaleido sides",
        control: "slider",
        category: "kaleido"
      }
    },
    metric: {
      type: "int",
      default: 0,
      uniform: "metric",
      choices: {
        circle: 0,
        diamond: 1,
        hexagon: 2,
        octagon: 3,
        square: 4,
        triangle: 5
      },
      ui: {
        label: "kaleido shape",
        control: "dropdown",
        category: "kaleido",
        enabledBy: { param: "kaleido", gt: 1 }
      }
    },
    colorMode: {
      type: "int",
      default: 6,
      uniform: "colorMode",
      choices: {
        mono: 0,
        linearRgb: 1,
        srgb: 2,
        oklab: 3,
        palette: 4,
        hsv: 6
      },
      ui: {
        label: "color mode",
        control: "dropdown",
        category: "color"
      }
    },
    paletteMode: {
      type: "int",
      default: 3,
      uniform: "paletteMode",
      ui: {
        control: false
      }
    },
    hueRotation: {
      type: "float",
      default: 179,
      uniform: "hueRotation",
      min: 0,
      max: 360,
      ui: {
        label: "hue rotate",
        control: "slider",
        category: "color",
        enabledBy: { param: "colorMode", eq: 6 }
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
        category: "color",
        enabledBy: { param: "colorMode", eq: 6 }
      }
    },
    palette: {
      type: "palette",
      default: 2,
      uniform: "palette",
      choices: paletteChoices,
      ui: {
        label: "palette",
        control: "dropdown",
        category: "palette",
        enabledBy: { param: "colorMode", eq: 4 }
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
        label: "offset",
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
      max: 10,
      randMax: 5,
      ui: {
        label: "repeat",
        control: "slider",
        category: "palette",
        enabledBy: { param: "colorMode", eq: 4 }
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
      default: [0.3, 0.2, 0.2],
      uniform: "palettePhase",
      ui: {
        label: "palette phase",
        control: "slider",
        hidden: true
      }
    }
  }

  paramAliases = { noiseType: 'type', loopAmp: 'speed' }


  passes = [
    {
      name: "render",
      program: "noise",
      inputs: {
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
}
