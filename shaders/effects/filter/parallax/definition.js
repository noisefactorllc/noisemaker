import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/parallax - Pseudo-3D perspective shift from a height map
 * Ray-marched parallax occlusion mapping: the input is re-projected as if
 * extruded by the height map and viewed from an angle
 */
export default new Effect({
  name: "Parallax",
  namespace: "filter",
  func: "parallax",
  tags: ["distort"],

  description: "Pseudo-3D perspective shift from a height map",
  globals: {
    heightMap: {
      type: "surface",
      default: "inputTex",
      ui: {
        label: "height map",
        category: "general"
      }
    },
    direction: {
      type: "vec3",
      default: [0.5, 0.5, 1.0],
      uniform: "direction",
      ui: {
        label: "direction",
        control: "vector3",
        category: "general"
      }
    },
    pivot: {
      type: "float",
      default: 0.0,
      uniform: "pivot",
      min: 0.0,
      max: 1.0,
      step: 0.01,
      ui: {
        label: "pivot",
        control: "slider",
        category: "general"
      }
    }
  },
  defaultProgram: "search filter, synth\n\nnoise(ridges: true)\n.parallax()\n.write(o0)",
  passes: [
    {
      name: "render",
      program: "parallax",
      inputs: {
        inputTex: "inputTex",
        heightMap: "heightMap"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
