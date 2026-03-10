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
    normalStrength: {
      type: "float",
      default: 1.5,
      uniform: "normalStrength",
      min: 0.0,
      max: 5.0,
      step: 0.01,
      ui: {
        label: "depth",
        control: "slider",
        category: "general"
      }
    },
    smoothing: {
      type: "float",
      default: 1.0,
      uniform: "smoothing",
      min: 1.0,
      max: 10.0,
      step: 0.1,
      ui: {
        label: "smoothing",
        control: "slider",
        category: "general"
      }
    },
    diffuseColor: {
      type: "color",
      default: [1.0, 1.0, 1.0],
      uniform: "diffuseColor",
      ui: {
        label: "color",
        control: "color",
        category: "diffuse"
      }
    },
    specularColor: {
      type: "color",
      default: [1.0, 1.0, 1.0],
      uniform: "specularColor",
      ui: {
        label: "color",
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
        label: "intensity",
        control: "slider",
        category: "specular"
      }
    },
    shininess: {
      type: "float",
      default: 64.0,
      uniform: "shininess",
      min: 8.0,
      max: 256.0,
      step: 1.0,
      ui: {
        label: "shininess",
        control: "slider",
        category: "specular"
      }
    },
    ambientColor: {
      type: "color",
      default: [0.2, 0.2, 0.2],
      uniform: "ambientColor",
      ui: {
        label: "ambient",
        control: "color"
      }
    },
    lightDirection: {
      type: "vec3",
      default: [0.5, 0.5, 1.0],
      uniform: "lightDirection",
      ui: {
        label: "direction",
        control: "vector3",
        category: "diffuse"
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
        label: "reflection",
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
        label: "refraction",
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
        label: "aberration",
        control: "slider",
        category: "reflection",
        enabledBy: { param: "reflection", gt: 0 }
      }
    }
  },
  defaultProgram: "search filter, synth\n\nnoise(ridges: true)\n.lighting(normalStrength: 2)\n.write(o0)",
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
