import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "CellRefract",
  namespace: "classicNoisedeck",
  func: "cellRefract",
  tags: ["distort", "noise"],

  description: "Cell-based refraction",
  globals: {
    amount: {
      type: "float",
      default: 23,
      uniform: "refractAmt",
      min: 0,
      max: 100,
      ui: {
        label: "refract",
        control: "slider"
      }
    },
    direction: {
      type: "float",
      default: 0,
      uniform: "direction",
      min: 0,
      max: 360,
      ui: {
        label: "refract dir",
        control: "slider"
      }
    },
    wrap: {
      type: "int",
      default: 0,
      uniform: "wrap",
      choices: {
        mirror: 0,
        repeat: 1
      },
      ui: {
        label: "wrap",
        control: "dropdown"
      }
    },
    speed: {
      type: "int",
      default: 1,
      uniform: "speed",
      min: 0,
      max: 5,
      zero: 0,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    shape: {
      type: "int",
      default: 1,
      // Compile-time define. The 5-way shape dispatch is hit 25 times per
      // pixel inside the cells() inner loop; baking it lets the compiler
      // emit only the active branch. Side note: the WGSL backend had a pre-
      // existing latent bug here where the uniform name didn't match the
      // global, so it always rendered circle regardless — promoting to a
      // define routes through injectDefines and fixes that as a side effect.
      define: "SHAPE",
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
        control: "dropdown",
        category: "cells"
      }
    },
    scale: {
      type: "float",
      default: 50,
      uniform: "scale",
      min: 1,
      max: 100,
      ui: {
        label: "scale",
        control: "slider",
        category: "cells"
      }
    },
    cellScale: {
      type: "float",
      default: 75,
      uniform: "cellScale",
      min: 1,
      max: 100,
      ui: {
        label: "cell scale",
        control: "slider",
        category: "cells"
      }
    },
    smooth: {
      type: "float",
      default: 0,
      uniform: "cellSmooth",
      min: 0,
      max: 100,
      ui: {
        label: "cell smooth",
        control: "slider",
        category: "cells"
      }
    },
    variation: {
      type: "float",
      default: 0,
      uniform: "variation",
      min: 0,
      max: 100,
      ui: {
        label: "cell variation",
        control: "slider",
        category: "cells"
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
        control: "slider",
        category: "cells"
      }
    },
    kernel: {
      type: "int",
      default: 0,
      // Compile-time define. Same multi-way convolution dispatch as
      // classicNoisedeck/effects, called once at the end of main(). Each
      // kernel is a separate function inlined into the call site, so DCE
      // is the win — only one body is compiled.
      define: "KERNEL",
      choices: {
        none: 0,
        blur: 1,
        derivatives: 120,
        derivDivide: 2,
        edge: 3,
        emboss: 4,
        litEdge: 9,
        outline: 5,
        pixels: 100,
        posterize: 110,
        shadow: 6,
        sharpen: 7,
        sobel: 8
      },
      ui: {
        label: "effect",
        control: "dropdown",
        category: "effect"
      }
    },
    effectWidth: {
      type: "int",
      default: 0,
      uniform: "effectWidth",
      min: 0,
      max: 10,
      ui: {
        label: "effect width",
        control: "slider",
        category: "effect",
        enabledBy: { param: "kernel", neq: 0 }
      }
    }
  },
  paramAliases: { cellSmooth: 'smooth', cellVariation: 'variation', refractAmt: 'amount', refractDir: 'direction', loopAmp: 'speed' },
  passes: [
    {
      name: "render",
      program: "cellRefract",
      inputs: {
        inputTex: "inputTex"
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
