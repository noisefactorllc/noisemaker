import { Effect } from '../../../src/runtime/effect.js'

/**
 * Voronoi
 * /shaders/effects/voronoi/voronoi.wgsl
 */
export default new Effect({
  name: "Voronoi",
  namespace: "classicNoisemaker",
  tags: ["noise", "geometric"],
  func: "voronoi",

  description: "Voronoi cell pattern",
  globals: {
    diagramType: {
        type: "integer",
        default: 1,
        uniform: "diagramType",
        min: 0,
        max: 7,
        step: 1,
        ui: {
            label: "Diagram Type",
            control: "slider"
        }
    },
    nth: {
        type: "integer",
        default: 0,
        uniform: "nth",
        min: -4,
        max: 4,
        step: 1,
        ui: {
            label: "Nth Neighbor",
            control: "slider"
        }
    },
    distMetric: {
        type: "integer",
        default: 1,
        uniform: "distMetric",
        min: 1,
        max: 4,
        step: 1,
        ui: {
            label: "Distance Metric",
            control: "slider"
        }
    },
    sdfSides: {
        type: "integer",
        default: 3,
        uniform: "sdfSides",
        min: 3,
        max: 24,
        step: 1,
        ui: {
            label: "SDF Sides",
            control: "slider"
        }
    },
    alpha: {
        type: "float",
        default: 1,
        uniform: "alpha",
        min: 0,
        max: 1,
        step: 0.01,
        ui: {
            label: "Alpha",
            control: "slider"
        }
    },
    withRefract: {
        type: "float",
        default: 0,
        uniform: "withRefract",
        min: 0,
        max: 2,
        step: 0.01,
        ui: {
            label: "Refract",
            control: "slider"
        }
    },
    inverse: {
        type: "boolean",
        default: false,
        uniform: "inverse",
        ui: {
            label: "Inverse",
            control: "checkbox"
        }
    },
    ridgesHint: {
        type: "boolean",
        default: false,
        uniform: "ridgesHint",
        ui: {
            label: "Ridges Hint",
            control: "checkbox"
        }
    },
    refractYFromOffset: {
        type: "boolean",
        default: true,
        uniform: "refractYFromOffset",
        ui: {
            label: "Refract Offset",
            control: "checkbox"
        }
    },
    pointFreq: {
        type: "integer",
        default: 3,
        uniform: "pointFreq",
        min: 1,
        max: 10,
        step: 1,
        ui: {
            label: "Point Frequency",
            control: "slider"
        }
    },
    pointGenerations: {
        type: "integer",
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
        type: "integer",
        default: 0,
        uniform: "pointDistrib",
        min: 0,
        max: 9,
        step: 1,
        ui: {
            label: "Distribution",
            control: "slider"
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
    },
    downsample: {
        type: "boolean",
        default: true,
        uniform: "downsample",
        ui: {
            label: "Downsample",
            control: "checkbox"
        }
    }
  },
  passes: [
    {
      name: "main",
      program: "voronoi",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        diagramType: "diagramType",
        nth: "nth",
        distMetric: "distMetric",
        sdfSides: "sdfSides",
        alpha: "alpha",
        withRefract: "withRefract",
        pointFreq: "pointFreq",
        pointDistrib: "pointDistrib",
        pointDrift: "pointDrift"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
