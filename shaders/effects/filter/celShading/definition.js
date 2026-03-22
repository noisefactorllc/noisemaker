import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/celShading - Cel/toon shading effect for 2D textures
 * Multi-pass effect:
 * 1. Color pass: Apply color quantization and diffuse shading
 * 2. Edge pass: Sobel edge detection on original input
 * 3. Blend pass: Combine cel-shaded color with edge outlines
 */
export default new Effect({
  name: "Cel Shading",
  namespace: "filter",
  func: "celShading",
  tags: ["color", "edges"],
  openCategories: ["general", "edges"],

  description: "Cartoon-style shading with posterization and outlines",
  globals: {
        // Mix with original
    mix: {
      type: "float",
      default: 1.0,
      uniform: "mixAmount",
      min: 0.0,
      max: 1.0,
      step: 0.01,
      zero: 0,
      ui: {
        label: "mix",
        control: "slider"
      }
    },
    // Color quantization parameters
    levels: {
      type: "int",
      default: 4,
      uniform: "levels",
      min: 2,
      max: 8,
      step: 1,
      ui: {
        label: "levels",
        control: "slider"
      }
    },
    gamma: {
      type: "float",
      default: 1,
      uniform: "gamma",
      min: 0.1,
      max: 3,
      step: 0.05,
      ui: {
        label: "gamma",
        control: "slider"
      }
    },
    antialias: {
      type: "boolean",
      default: true,
      uniform: "antialias",
      ui: {
        label: "antialias",
        control: "checkbox"
      }
    },

    // Edge parameters
    edgeWidth: {
      type: "int",
      default: 1,
      uniform: "edgeWidth",
      min: 0,
      max: 5,
      randMax: 3,
      zero: 0,
      ui: {
        label: "width",
        control: "slider",
        category: "edges"
      }
    },
    edgeThreshold: {
      type: "float",
      default: 0.15,
      uniform: "edgeThreshold",
      min: 0.01,
      max: 1.0,
      step: 0.01,
      zero: 0,
      ui: {
        label: "threshold",
        control: "slider",
        category: "edges"
      }
    },
    edgeColor: {
      type: "color",
      default: [0.0, 0.0, 0.0],
      uniform: "edgeColor",
      randChance: 0,
      ui: {
        label: "color",
        control: "color",
        category: "edges"
      }
    },

    // Light direction for shading
    lightDirection: {
      type: "vec3",
      default: [0.5, 0.5, 1.0],
      uniform: "lightDirection",
      ui: {
        label: "light dir",
        control: "vector3",
        category: "shading"
      }
    },
    strength: {
      type: "float",
      default: 0.0,
      uniform: "strength",
      min: 0.0,
      max: 1.0,
      step: 0.01,
      randChance: 0,
      ui: {
        label: "shading",
        control: "slider",
        category: "shading"
      }
    }
  },
  textures: {
    celShadingColorTex: { width: "100%", height: "100%", format: "rgba16f" },
    celShadingEdgeTex: { width: "100%", height: "100%", format: "rgba16f" }
  },
  paramAliases: { shadingStrength: 'strength', mixAmount: 'mix' },
  passes: [
    {
      name: "color",
      program: "celShadingColor",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "celShadingColorTex"
      }
    },
    {
      name: "edges",
      program: "celShadingEdges",
      inputs: {
        colorTex: "celShadingColorTex"
      },
      outputs: {
        fragColor: "celShadingEdgeTex"
      }
    },
    {
      name: "blend",
      program: "celShadingBlend",
      inputs: {
        inputTex: "inputTex",
        colorTex: "celShadingColorTex",
        edgeTex: "celShadingEdgeTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
