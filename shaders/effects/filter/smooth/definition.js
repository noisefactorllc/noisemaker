import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/smooth - Anti-aliasing and edge smoothing
 * Three modes: MSAA supersampling, SMAA morphological AA, edge-selective blur
 * Two-pass pipeline:
 * 1. Edge detection: SMAA/Blur write luma edge map, MSAA passes through
 * 2. Blending: mode-specific smoothing with radius control
 */
export default new Effect({
  name: "Smooth",
  namespace: "filter",
  func: "smooth",
  tags: ["antialiasing"],

  description: "Anti-aliasing with MSAA, SMAA, or edge-selective blur modes",
  globals: {
    type: {
      type: "int",
      default: 0,
      uniform: "smoothType",
      choices: { msaa: 0, smaa: 1, blur: 2 },
      ui: {
        label: "type",
        control: "dropdown"
      }
    },
    strength: {
      type: "float",
      default: 1.0,
      uniform: "smoothStrength",
      min: 0,
      max: 1,
      ui: {
        label: "strength",
        control: "slider"
      }
    },
    threshold: {
      type: "float",
      default: 0.1,
      uniform: "smoothThreshold",
      min: 0,
      max: 1,
      ui: {
        label: "threshold",
        control: "slider"
      }
    },
    radius: {
      type: "float",
      default: 2.0,
      uniform: "smoothRadius",
      min: 0.5,
      max: 4,
      step: 0.1,
      ui: {
        label: "radius",
        control: "slider"
      }
    },
    samples: {
      type: "int",
      default: 4,
      uniform: "smoothSamples",
      choices: { x2: 2, x4: 4, x8: 8 },
      ui: {
        label: "samples",
        control: "dropdown",
        enabledBy: { param: "type", eq: 0 } // Only for MSAA mode
      }
    },
    searchSteps: {
      type: "int",
      default: 8,
      uniform: "smoothSearchSteps",
      min: 1,
      max: 32,
      step: 1,
      ui: {
        label: "search steps",
        control: "slider",
        enabledBy: { param: "type", eq: 1 } // Only for SMAA mode
      }
    }
  },
  textures: {
    _smoothEdges: { width: "input", height: "input", format: "rgba8unorm" }
  },
  passes: [
    {
      name: "smoothEdge",
      program: "smoothEdge",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "_smoothEdges"
      }
    },
    {
      name: "smoothBlend",
      program: "smoothBlend",
      inputs: {
        inputTex: "inputTex",
        edgeTex: "_smoothEdges"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
