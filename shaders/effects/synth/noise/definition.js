import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Noise",
  namespace: "synth",
  func: "noise",
  tags: ["noise"],

  description: "Value noise with multiple interpolation types",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    aspectRatio: { slot: 0, components: 'w' },
    scaleX: { slot: 1, components: 'x' },
    scaleY: { slot: 1, components: 'y' },
    seed: { slot: 1, components: 'z' },
    loopScale: { slot: 1, components: 'w' },
    speed: { slot: 2, components: 'x' },
    // slot 2.y was loopOffset — now compile-time LOOP_OFFSET
    // slot 2.z was unused (noiseType/type was promoted to NOISE_TYPE)
    octaves: { slot: 2, components: 'w' },
    ridges: { slot: 3, components: 'x' },
    wrap: { slot: 3, components: 'y' },
    colorMode: { slot: 3, components: 'z' }
  },
  globals: {
    type: {
      type: "int",
      default: 10,
      // Compile-time define (NOT a runtime uniform). Changing this triggers a
      // shader recompile via the expander/UI integration. This avoids ANGLE→D3D
      // inlining the entire noise-variant decision tree at every call site, which
      // produced ~16s shader compiles on Windows Chrome (HANDOFF-shader-compile.md).
      define: "NOISE_TYPE",
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
    scaleX: {
      type: "float",
      default: 75,
      uniform: "scaleX",
      min: 1,
      max: 100,
      ui: {
        label: "horiz scale",
        control: "slider",
        category: "transform"
      }
    },
    scaleY: {
      type: "float",
      default: 75,
      uniform: "scaleY",
      min: 1,
      max: 100,
      ui: {
        label: "vert scale",
        control: "slider",
        category: "transform"
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
    ridges: {
      type: "boolean",
      default: false,
      uniform: "ridges",
      ui: {
        label: "ridges",
        control: "checkbox"
      }
    },
    loopOffset: {
      type: "int",
      default: 300,
      // Compile-time define. Same rationale as classicNoisedeck/noise — the
      // 17-way dispatch in offset() is dispatched once per fragment but its
      // unreachable branches still inflate ANGLE→D3D inlining.
      define: "LOOP_OFFSET",
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
      type: "int",
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
    colorMode: {
      type: "int",
      default: 1,
      uniform: "colorMode",
      choices: {
        mono: 0,
        rgb: 1
      },
      ui: {
        label: "color mode",
        control: "dropdown"
      }
    }
  },
  paramAliases: { noiseType: 'type', loopAmp: 'speed', xScale: 'scaleX', yScale: 'scaleY' },
  passes: [
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
})
