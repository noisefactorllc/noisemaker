import { Effect } from '../../../src/runtime/effect.js'

/**
 * Hydraulic - Hydraulic flow agent effect (gradient descent)
 *
 * Common Agent Architecture middleware:
 * - Reads agent state from pipeline inputs (global_xyz, global_vel, global_rgba)
 * - Applies gradient-descent movement based on input texture luminance
 * - Writes updated state back to global textures
 *
 * State format (matching pointsEmit):
 * - xyz: [x, y, z, alive_flag]  (x,y in normalized coords [0,1], w=1 alive)
 * - vel: [vx, vy, vz, seed]     (velocity in pixel-space, seed for per-agent variation)
 * - rgba: [r, g, b, a]          (agent color)
 *
 * Usage: pointsEmit().hydraulic().pointsRender().write(o0)
 *
 * Can be combined with physical() for gravity/wind effects:
 *   pointsEmit().hydraulic().physical().pointsRender().write(o0)
 */
export default new Effect({
  name: "Hydraulic",
  namespace: "points",
  func: "hydraulic",
  tags: ["sim"],

  description: "Hydraulic erosion flow simulation (gradient descent)",

  // No local textures - use shared global_xyz/vel/rgba from pointsEmit
  textures: {},

  // Expose outputs to pipeline for downstream effects
  outputXyz: "global_xyz",
  outputVel: "global_vel",
  outputRgba: "global_rgba",

  globals: {
    stride: {
      type: "float",
      default: 10,
      uniform: "stride",
      min: 1,
      max: 1000,
      step: 1,
      ui: {
        label: "stride",
        control: "slider",
        category: "agents"
      }
    },
    quantize: {
      type: "boolean",
      default: false,
      uniform: "quantize",
      ui: {
        label: "quantize",
        control: "checkbox",
        category: "agents"
      }
    },
    inverse: {
      type: "boolean",
      default: false,
      uniform: "inverse",
      ui: {
        label: "inverse",
        control: "checkbox",
        category: "agents"
      }
    },
    inputWeight: {
      type: "float",
      default: 100,
      uniform: "inputWeight",
      min: 0,
      max: 100,
      step: 1,
      ui: {
        label: "input weight",
        control: "slider",
        category: "agents"
      }
    }
  },

  passes: [
    // Pass 1: Update agent state (gradient descent movement)
    {
      name: "agent",
      program: "agent",
      drawBuffers: 3,
      inputs: {
        xyzTex: "global_xyz",
        velTex: "global_vel",
        rgbaTex: "global_rgba",
        inputTex: "inputTex"
      },
      uniforms: {
        stride: "stride",
        quantize: "quantize",
        inverse: "inverse",
        inputWeight: "inputWeight"
      },
      outputs: {
        outXYZ: "global_xyz",
        outVel: "global_vel",
        outRGBA: "global_rgba"
      }
    },

    // Pass 2: Copy input texture to output for 2D chain continuity
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
