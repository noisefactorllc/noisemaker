import { Effect } from '../../../src/runtime/effect.js'
import { stdEnums } from '../../../src/lang/std_enums.js'

const paletteChoices = {}
for (const [key, val] of Object.entries(stdEnums.palette)) {
  paletteChoices[key] = val.value
}

export default class Shapes extends Effect {
  name = "Shapes"
  namespace = "classicNoisedeck"
  func = "shapes"
  tags = ["geometric"]

  description = "Interference patterns from geometric shapes"


  // WGSL uniform packing layout - maps uniform names to vec4 slots/components
  uniformLayout = {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    wrap: { slot: 1, components: 'x' },
    // slot 1 components y/z intentionally unused — loopAOffset and loopBOffset
    // are compile-time defines (see globals below), not runtime uniforms.
    loopAScale: { slot: 1, components: 'w' },
    loopBScale: { slot: 2, components: 'x' },
    speedA: { slot: 2, components: 'y' },
    speedB: { slot: 2, components: 'z' },
    paletteMode: { slot: 2, components: 'w' },
    paletteOffset: { slot: 3, components: 'xyz' },
    cyclePalette: { slot: 3, components: 'w' },
    paletteAmp: { slot: 4, components: 'xyz' },
    rotatePalette: { slot: 4, components: 'w' },
    paletteFreq: { slot: 5, components: 'xyz' },
    repeatPalette: { slot: 5, components: 'w' },
    palettePhase: { slot: 6, components: 'xyz' }
  }
  globals = {
    loopAOffset: {
      type: "int",
      default: 40,
      // Compile-time define — each (loopA, loopB) combination produces its own
      // compiled program. Avoids the 35s ANGLE→D3D inlining hang on Windows
      // Chrome where the runtime if-cascade in offset() and the 9-way value()
      // dispatch were both being inlined into every call site.
      define: "LOOP_A_OFFSET",
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
        label: "shape a",
        control: "dropdown"
      }
    },
    loopBOffset: {
      type: "int",
      default: 30,
      // Compile-time define — see loopAOffset above.
      define: "LOOP_B_OFFSET",
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
        label: "shape b",
        control: "dropdown"
      }
    },
    loopAScale: {
      type: "float",
      default: 1,
      uniform: "loopAScale",
      min: 1,
      max: 100,
      ui: {
        label: "scale a",
        control: "slider"
      }
    },
    loopBScale: {
      type: "float",
      default: 1,
      uniform: "loopBScale",
      min: 1,
      max: 100,
      ui: {
        label: "scale b",
        control: "slider"
      }
    },
    speedA: {
      type: "float",
      default: 50,
      uniform: "speedA",
      min: -100,
      max: 100,
      zero: 0,
      ui: {
        label: "speed a",
        control: "slider"
      }
    },
    speedB: {
      type: "float",
      default: 50,
      uniform: "speedB",
      min: -100,
      max: 100,
      zero: 0,
      ui: {
        label: "speed b",
        control: "slider"
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
        enabledBy: {
          or: [
            { param: "loopAOffset", in: [300, 310, 320, 330, 340, 350, 360, 370, 380] },
            { param: "loopBOffset", in: [300, 310, 320, 330, 340, 350, 360, 370, 380] }
          ]
        }
      }
    },
    wrap: {
      type: "boolean",
      default: true,
      uniform: "wrap",
      ui: {
        label: "wrap",
        control: "checkbox",
        enabledBy: {
          or: [
            { param: "loopAOffset", in: [300, 310, 320, 330, 340, 350, 360] },
            { param: "loopBOffset", in: [300, 310, 320, 330, 340, 350, 360] }
          ]
        }
      }
    },
    palette: {
      type: "palette",
      default: 46,
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
    }
  }

  paramAliases = { loopAAmp: 'speedA', loopBAmp: 'speedB' }

  passes = [
    {
      name: "render",
      program: "shapes",
      inputs: {
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
}
