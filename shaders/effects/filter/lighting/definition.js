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
        label: "Diffuse Color",
        control: "color"
      }
    },
    specularColor: {
      type: "vec3",
      default: [1.0, 1.0, 1.0],
      uniform: "specularColor",
      ui: {
        label: "Specular Color",
        control: "color"
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
        label: "Specular Intensity",
        control: "slider"
      }
    },
    ambientColor: {
      type: "vec3",
      default: [0.2, 0.2, 0.2],
      uniform: "ambientColor",
      ui: {
        label: "Ambient Color",
        control: "color"
      }
    },
    lightDirection: {
      type: "vec3",
      default: [0.5, 0.5, 1.0],
      uniform: "lightDirection",
      ui: {
        label: "Light Direction",
        control: "vector3"
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
        label: "Normal Strength",
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
        label: "Reflection Intensity",
        control: "slider"
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
        label: "Refraction Intensity",
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
        label: "Chromatic Aberration",
        control: "slider"
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
