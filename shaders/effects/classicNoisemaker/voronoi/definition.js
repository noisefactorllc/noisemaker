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
        type: "int",
        default: 1,
        uniform: "diagramType",
        min: 0,
        max: 7,
        step: 1,
        ui: {
            label: "diagram type",
            control: "slider"
        }
    },
    nth: {
        type: "int",
        default: 0,
        uniform: "nth",
        min: -4,
        max: 4,
        step: 1,
        ui: {
            label: "nth neighbor",
            control: "slider"
        }
    },
    shape: {
        type: "int",
        default: 1,
        uniform: "distMetric",
        min: 1,
        max: 4,
        step: 1,
        ui: {
            label: "shape",
            control: "slider"
        }
    },
    sdfSides: {
        type: "int",
        default: 3,
        uniform: "sdfSides",
        min: 3,
        max: 24,
        step: 1,
        ui: {
            label: "sdf sides",
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
            label: "alpha",
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
            label: "refract",
            control: "slider"
        }
    },
    inverse: {
        type: "boolean",
        default: false,
        uniform: "inverse",
        ui: {
            label: "inverse",
            control: "checkbox"
        }
    },
    ridgesHint: {
        type: "boolean",
        default: false,
        uniform: "ridgesHint",
        ui: {
            label: "ridges hint",
            control: "checkbox"
        }
    },
    refractYFromOffset: {
        type: "boolean",
        default: true,
        uniform: "refractYFromOffset",
        ui: {
            label: "refract offset",
            control: "checkbox"
        }
    },
    pointFreq: {
        type: "int",
        default: 3,
        uniform: "pointFreq",
        min: 1,
        max: 10,
        step: 1,
        ui: {
            label: "point frequency",
            control: "slider"
        }
    },
    pointGenerations: {
        type: "int",
        default: 1,
        uniform: "pointGenerations",
        min: 1,
        max: 5,
        step: 1,
        ui: {
            label: "generations",
            control: "slider"
        }
    },
    pointDistrib: {
        type: "int",
        default: 0,
        uniform: "pointDistrib",
        min: 0,
        max: 9,
        step: 1,
        ui: {
            label: "distribution",
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
            label: "point drift",
            control: "slider"
        }
    },
    pointCorners: {
        type: "boolean",
        default: false,
        uniform: "pointCorners",
        ui: {
            label: "include corners",
            control: "checkbox"
        }
    },
    downsample: {
        type: "boolean",
        default: true,
        uniform: "downsample",
        ui: {
            label: "downsample",
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
        shape: "distMetric",
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
