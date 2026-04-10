import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Shape",
  namespace: "synth",
  func: "shape",
  tags: ["geometric"],

  description: "Interference patterns from geometric shapes",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    wrap: { slot: 1, components: 'x' },
    // slot 1 components y/z intentionally unused — loopAOffset and loopBOffset
    // are compile-time defines (see globals below), not runtime uniforms.
    loopAScale: { slot: 1, components: 'w' },
    loopBScale: { slot: 2, components: 'x' },
    speedA: { slot: 2, components: 'y' },
    speedB: { slot: 2, components: 'z' }
  },
  globals: {
    loopAOffset: {
      type: "int",
      default: 40,
      // Compile-time define — same fix as classicNoisedeck/shapes. Each
      // (loopA, loopB) combination produces its own compiled program.
      // Avoids the 25s ANGLE→D3D inlining hang on Windows Chrome.
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
        label: "loop a",
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
        label: "loop b",
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
        label: "a scale",
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
        label: "b scale",
        control: "slider"
      }
    },
    speedA: {
      type: "int",
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
      type: "int",
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
        category: "noise",
        enabledBy: {
          or: [
            { param: "loopAOffset", gte: 300, lt: 400 },
            { param: "loopBOffset", gte: 300, lt: 400 }
        ]}
      }
    },
    wrap: {
      type: "boolean",
      default: true,
      uniform: "wrap",
      ui: {
        label: "wrap",
        control: "checkbox",
        category: "noise",
        enabledBy: {
          or: [
            { param: "loopAOffset", gte: 300, lt: 370 },
            { param: "loopBOffset", gte: 300, lt: 370 }
        ]}
      }
    }
  },
  paramAliases: {
    loopAAmp: 'speedA',
    loopBAmp: 'speedB'
  },
  passes: [
    {
      name: "render",
      program: "shape",
      inputs: {},
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
