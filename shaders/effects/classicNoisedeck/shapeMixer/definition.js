import { Effect } from '../../../src/runtime/effect.js'
import { stdEnums } from '../../../src/lang/std_enums.js'

const paletteChoices = {}
for (const [key, val] of Object.entries(stdEnums.palette)) {
  paletteChoices[key] = val.value
}

export default class ShapeMixer extends Effect {
  name = "ShapeMixer"
  namespace = "classicNoisedeck"
  func = "shapeMixer"
  tags = ["blend", "geometric"]

  description = "Shape-based mixing"

  globals = {
    tex: {
      type: "surface",
      default: "none",
      ui: {
        label: "source b"
      }
    },
    blendMode: {
      type: "int",
      default: 2,
      uniform: "blendMode",
      choices: {
        add: 0,
        divide: 1,
        max: 2,
        min: 3,
        mix: 4,
        mod: 5,
        multiply: 6,
        reflect: 7,
        refract: 8,
        subtract: 9
      },
      ui: {
        label: "blend mode",
        control: "dropdown"
      }
    },
    loopOffset: {
      type: "int",
      default: 10,
      uniform: "loopOffset",
      choices: {
        none: 0,
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
        "Noise:": null,
        noiseConstant: 300,
        noiseLinear: 310,
        noiseHermite: 320,
        noiseCatmullRom3x3: 330,
        noiseCatmullRom4x4: 340,
        noiseBSpline3x3: 350,
        noiseBSpline4x4: 360,
        noiseSimplex: 370,
        noiseSine: 380,
        "Misc:": null,
        rings: 400,
        sine: 410
      },
      ui: {
        label: "shape",
        control: "dropdown"
      }
    },
    loopScale: {
      type: "float",
      default: 80,
      uniform: "loopScale",
      min: 1,
      max: 100,
      ui: {
        label: "shape scale",
        control: "slider"
      }
    },
    wrap: {
      type: "boolean",
      default: true,
      uniform: "wrap",
      ui: {
        label: "noise wrap",
        control: "checkbox",
        enabledBy: { param: "loopOffset", in: [300, 310, 320, 330, 340, 350, 360] }
      }
    },
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "noise seed",
        control: "slider",
        enabledBy: { param: "loopOffset", in: [300, 310, 320, 330, 340, 350, 360, 370, 380] },
      }
    },
    animate: {
      type: "int",
      default: 1,
      uniform: "animate",
      choices: {
        off: 0,
        forward: 1,
        backward: -1
      },
      ui: {
        label: "animate",
        control: "dropdown"
      }
    },
    palette: {
      type: "palette",
      default: 41,
      uniform: "palette",
      choices: paletteChoices,
      ui: {
        label: "palette",
        control: "dropdown",
        category: "palette"
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
        label: "rotation",
        control: "dropdown",
        category: "palette"
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
        category: "palette"
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
        category: "palette"
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
        category: "palette"
      }
    }
  }

  passes = [
    {
      name: "render",
      program: "shapeMixer",
      inputs: {
        inputTex: "inputTex",
        tex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
}
