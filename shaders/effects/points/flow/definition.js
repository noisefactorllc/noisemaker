import { Effect } from '../../../src/runtime/effect.js'

/**
 * Flow - Agent-based flow field effect with behaviors
 *
 * Common Agent Architecture middleware:
 * - Reads agent state from pipeline inputs (inputXyz, inputVel, inputRgba)
 * - Applies flow-field movement based on input texture luminance
 * - Writes updated state to own textures (ping-ponged by runtime)
 *
 * State format (matching pointsEmit):
 * - xyz: [x, y, z, alive_flag]  (x,y in normalized coords [0,1], w=1 alive)
 * - vel: [vx, vy, rotRand, strideRand]  (rotRand/strideRand for per-agent variation)
 * - rgba: [r, g, b, a]          (agent color)
 *
 * Usage: pointsEmit().flow().pointsRender().write(o0)
 */
export default new Effect({
  name: "Flow",
  namespace: "points",
  func: "flow",
  tags: ["sim"],

  description: "Agent-based luminosity flow field with behaviors",

  // global_xyz/vel/rgba are created by pointsEmit and shared across the
  // particle pipeline. global_flow_base_color keeps each agent's own color
  // while a diffuse map recolors it.
  textures: {
    global_flow_base_color: {
      width: { param: 'stateSize', inherit: true, default: 256 },
      height: { param: 'stateSize', inherit: true, default: 256 },
      format: "rgba8"
    }
  },

  // Expose outputs to pipeline for downstream effects
  outputXyz: "global_xyz",
  outputVel: "global_vel",
  outputRgba: "global_rgba",

  globals: {
    heightTex: {
      type: "surface", default: "none", colorModeUniform: "fieldActive",
      ui: { label: "height map", category: "agents" }
    },
    diffuseTex: {
      type: "surface", default: "none", colorModeUniform: "diffuseActive",
      ui: { label: "diffuse map", category: "agents" }
    },
    // stateSize parameter for texture sizing (must match pointsEmit)
    stateSize: {
      type: "int",
      default: 256,
      uniform: "stateSize",
      ui: { control: false }  // Inherited from pointsEmit
    },
    behavior: {
      type: "int",
      default: 1,
      uniform: "behavior",
      choices: {
        none: 0,
        obedient: 1,
        crosshatch: 2,
        unruly: 3,
        chaotic: 4,
        randomMix: 5,
        meandering: 10
      },
      ui: {
        label: "behavior",
        control: "dropdown",
        category: "agents"
      }
    },
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
    strideDeviation: {
      type: "float",
      default: 0.05,
      uniform: "strideDeviation",
      min: 0,
      max: 0.5,
      step: 0.01,
      ui: {
        label: "deviation",
        control: "slider",
        category: "agents"
      }
    },
    kink: {
      type: "float",
      default: 1,
      uniform: "kink",
      min: 0,
      max: 10,
      step: 0.1,
      ui: {
        label: "kink",
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

  paramAliases: { fieldTex: 'heightTex' },

  passes: [
    // Pass 1: Update flow agent movement
    // Read from shared global textures (previous frame or pointsEmit output)
    // Write back to same textures (ping-pong handled by runtime)
    {
      name: "agent",
      program: "agent",
      drawBuffers: 4,
      inputs: {
        // Read from shared global textures
        xyzTex: "global_xyz",
        velTex: "global_vel",
        rgbaTex: "global_rgba",
        // Flow reads input for luminance-based direction
        inputTex: "inputTex",
        heightTex: "heightTex",
        diffuseTex: "diffuseTex",
        baseColorTex: "global_flow_base_color"
      },
      uniforms: {
        diffuseActive: "diffuseActive",
        fieldActive: "fieldActive",
        behavior: "behavior",
        stride: "stride",
        strideDeviation: "strideDeviation",
        kink: "kink",
        quantize: "quantize",
        inputWeight: "inputWeight"
      },
      outputs: {
        // Write to shared global textures (ping-pong for next frame)
        outXYZ: "global_xyz",
        outVel: "global_vel",
        outRGBA: "global_rgba",
        outBaseColor: "global_flow_base_color"
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
