import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/lighting - 3D lighting effect for 2D textures
 * Calculates surface normals from luminosity using Sobel convolution
 * and applies diffuse, specular, and ambient lighting
 */
export default new Effect({
  name: "Lighting",
  namespace: "filter",
  func: "lighting",
  tags: ["color"],

  description: "Applies 3D lighting effects",
  globals: {
    diffuseColor: {
      type: "vec3",
      default: [1.0, 1.0, 1.0],
      uniform: "diffuseColor",
      ui: {
        label: "Color",
        control: "color",
        category: "diffuse"
      }
    },
    specularColor: {
      type: "vec3",
      default: [1.0, 1.0, 1.0],
      uniform: "specularColor",
      ui: {
        label: "Color",
        control: "color",
        category: "specular"
      }
    },
    specularIntensity: {
      type: "float",
      default: 0.5,
      uniform: "specularIntensity",
      min: 0.0,
      max: 2.0,
      step: 0.01,
      ui: {
        label: "Intensity",
        control: "slider",
        category: "specular"
      }
    },
    ambientColor: {
      type: "vec3",
      default: [0.2, 0.2, 0.2],
      uniform: "ambientColor",
      ui: {
        label: "Ambient",
        control: "color"
      }
    },
    lightDirection: {
      type: "vec3",
      default: [0.5, 0.5, 1.0],
      uniform: "lightDirection",
      ui: {
        label: "Direction",
        control: "vector3",
        category: "diffuse"
      }
    },
    normalStrength: {
      type: "float",
      default: 1.0,
      uniform: "normalStrength",
      min: 0.0,
      max: 5.0,
      step: 0.01,
      ui: {
        label: "Depth",
        control: "slider"
      }
    },
    reflection: {
      type: "float",
      default: 0.0,
      uniform: "reflection",
      min: 0.0,
      max: 100.0,
      step: 0.1,
      ui: {
        label: "Reflection",
        control: "slider",
        category: "reflection"
      }
    },
    refraction: {
      type: "float",
      default: 0.0,
      uniform: "refraction",
      min: 0.0,
      max: 100.0,
      step: 0.1,
      ui: {
        label: "Refraction",
        control: "slider"
      }
    },
    aberration: {
      type: "float",
      default: 0.0,
      uniform: "aberration",
      min: 0.0,
      max: 100.0,
      step: 0.1,
      ui: {
        label: "Aberration",
        control: "slider",
        category: "reflection"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "lighting",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
