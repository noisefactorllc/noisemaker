import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/bulge - Bulge distortion
 * Direct port of nd.warp's bulge mode
 */
export default new Effect({
  name: "Bulge",
  namespace: "filter",
  func: "bulge",
  tags: ["distort"],

  description: "Bulge distortion from center",
  globals: {
    strength: {
      type: "float",
      default: 25,
      uniform: "strength",
      min: 0,
      max: 100,
      zero: 0,
      ui: {
        label: "strength",
        control: "slider"
      }
    },
    aspectLens: {
      type: "boolean",
      default: true,
      uniform: "aspectLens",
      ui: {
        label: "1:1 aspect",
        control: "checkbox"
      }
    },
    wrap: {
      type: "int",
      default: 0,
      uniform: "wrap",
      choices: {
        mirror: 0,
        repeat: 1,
        clamp: 2
      },
      ui: {
        label: "wrap",
        control: "dropdown"
      }
    },
    rotation: {
      type: "float",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: {
        label: "rotation",
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
    }
  },
  defaultProgram: "search synth, filter\ntestPattern(gridSize: 8)\n.bulge()\n.write(o0)",
  passes: [
    {
      name: "render",
      program: "bulge",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
