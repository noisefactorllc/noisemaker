import { Effect } from '../../../src/runtime/effect.js'

/**
 * Buddhabrot - Progressive orbit accumulation fractal
 *
 * Common Agent Architecture middleware:
 * - Reads agent state from pipeline inputs (global_xyz, global_vel, global_rgba)
 * - Tests random c values against Mandelbrot escape, deposits orbit traces
 * - Writes updated positions to same textures (ping-ponged by runtime)
 *
 * State format:
 * - xyz: [screenX, screenY, phase, alive]  (phase: 0=fresh, 1=depositing)
 * - vel: [c.re, c.im, step, escapeStep]    (orbit seed and progress)
 * - rgba: [brightness, brightness, brightness, 1]  (normalized deposit intensity)
 *
 * Usage: pointsEmit(stateSize: 512).buddhabrot().pointsRender(intensity: 99).write(o0)
 */
export default new Effect({
  name: "Buddhabrot",
  namespace: "points",
  func: "buddhabrot",
  tags: ["sim"],

  description: "Buddhabrot fractal via progressive orbit accumulation",

  textures: {
    global_zState: {
      width: { param: "stateSize", paramDefault: 512 },
      height: { param: "stateSize", paramDefault: 512 },
      format: "rgba32float"
    }
  },

  outputXyz: "global_xyz",
  outputVel: "global_vel",
  outputRgba: "global_rgba",

  globals: {
    stateSize: {
      type: "int",
      default: 512,
      uniform: "stateSize",
      ui: { control: false }
    },

    // === Fractal ===
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        standard: 0,
        anti: 1
      },
      ui: { label: "mode", control: "dropdown", category: "fractal" }
    },
    maxIter: {
      type: "int",
      default: 200,
      uniform: "maxIter",
      min: 20,
      max: 2000,
      step: 10,
      ui: { label: "max iterations", control: "slider", category: "fractal" }
    },
    minIter: {
      type: "int",
      default: 1,
      uniform: "minIter",
      min: 1,
      max: 1000,
      step: 1,
      ui: { label: "min iterations", control: "slider", category: "fractal" }
    },

    // === Navigation ===
    centerX: {
      type: "float",
      default: -0.5,
      uniform: "centerX",
      min: -3,
      max: 3,
      step: 0.01,
      ui: { label: "center y", control: "slider", category: "navigation" }
    },
    centerY: {
      type: "float",
      default: 0,
      uniform: "centerY",
      min: -3,
      max: 3,
      step: 0.01,
      ui: { label: "center x", control: "slider", category: "navigation" }
    },
    zoom: {
      type: "float",
      default: 1.0,
      uniform: "zoom",
      min: 0.1,
      max: 5,
      step: 0.1,
      ui: { label: "zoom", control: "slider", category: "navigation" }
    }
  },

  defaultProgram: "search points, synth, render\n\nsolid()\n  .pointsEmit(stateSize: 512)\n  .buddhabrot()\n  .pointsRender(intensity: 99)\n  .write(o0)\n\nrender(o0)",

  openCategories: ["fractal"],

  passes: [
    {
      name: "agent",
      program: "agent",
      drawBuffers: 3,
      inputs: {
        xyzTex: "global_xyz",
        velTex: "global_vel",
        rgbaTex: "global_rgba"
      },
      uniforms: {
        maxIter: "maxIter",
        minIter: "minIter",
        mode: "mode",
        centerX: "centerX",
        centerY: "centerY",
        zoom: "zoom"
      },
      outputs: {
        outXYZ: "global_xyz",
        outVel: "global_vel",
        outRGBA: "global_rgba"
      }
    },
    {
      name: "zWrite",
      program: "zWrite",
      inputs: {
        xyzTex: "global_xyz",
        velTex: "global_vel"
      },
      outputs: {
        fragColor: "global_zState"
      }
    },
    {
      name: "passthrough",
      program: "passthrough",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
