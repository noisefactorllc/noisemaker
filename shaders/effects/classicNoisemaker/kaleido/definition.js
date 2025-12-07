import { Effect } from '../../../src/runtime/effect.js';

/**
 * Kaleido
 * Creates a kaleidoscope mirror effect by reflecting the source texture into wedge slices.
 */
export default new Effect({
  name: "Kaleido",
  namespace: "classicNoisemaker",
  func: "kaleido",
  globals: {
    sides: {
        type: "float",
        default: 6,
        uniform: "sides",
        min: 2,
        max: 32,
        step: 1,
        ui: {
            label: "Sides",
            control: "slider"
        }
    },
    sdfSides: {
        type: "float",
        default: 5,
        uniform: "sdfSides",
        min: 0,
        max: 12,
        step: 1,
        ui: {
            label: "SDF Sides",
            control: "slider"
        }
    },
    blendEdges: {
        type: "boolean",
        default: true,
        uniform: "blendEdges",
        ui: {
            label: "Blend Edges",
            control: "checkbox"
        }
    },
    pointFreq: {
        type: "float",
        default: 1,
        uniform: "pointFreq",
        min: 1,
        max: 32,
        step: 1,
        ui: {
            label: "Point Frequency",
            control: "slider"
        }
    },
    pointGenerations: {
        type: "float",
        default: 1,
        uniform: "pointGenerations",
        min: 1,
        max: 5,
        step: 1,
        ui: {
            label: "Generations",
            control: "slider"
        }
    },
    pointDistrib: {
        type: "enum",
        default: 0,
        uniform: "pointDistrib",
        ui: {
            label: "Distribution"
        }
    },
    pointDrift: {
        type: "float",
        default: 0,
        uniform: "pointDrift",
        min: 0,
        max: 1,
        step: 0.01,
        ui: {
            label: "Point Drift",
            control: "slider"
        }
    },
    pointCorners: {
        type: "boolean",
        default: false,
        uniform: "pointCorners",
        ui: {
            label: "Include Corners",
            control: "checkbox"
        }
    }
  },
  passes: [
    {
      name: "main",
      program: "kaleido",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
