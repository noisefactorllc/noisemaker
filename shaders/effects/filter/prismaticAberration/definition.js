import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/prismaticAberration - Prismatic aberration effect
 */
export default new Effect({
  name: "PrismaticAberration",
  namespace: "filter",
  func: "prismaticAberration",
  tags: ["color", "lens"],

  description: "Prismatic aberration with hue controls",
  globals: {
    aberration: {
      type: "float",
      default: 50,
      uniform: "aberrationAmt",
      min: 0,
      max: 100,
      ui: {
        label: "aberration",
        control: "slider"
      }
    },
    modulate: {
      type: "boolean",
      default: false,
      uniform: "modulate",
      ui: {
        label: "modulate",
        control: "checkbox"
      }
    },
    hueRotation: {
      type: "float",
      default: 0,
      uniform: "hueRotation",
      min: -180,
      max: 180,
      ui: {
        label: "hue rotate",
        control: "slider"
      }
    },
    hueRange: {
      type: "float",
      default: 0,
      uniform: "hueRange",
      min: 0,
      max: 100,
      ui: {
        label: "hue range",
        control: "slider"
      }
    },
    saturation: {
      type: "float",
      default: 0,
      uniform: "saturation",
      min: -100,
      max: 100,
      ui: {
        label: "saturation",
        control: "slider"
      }
    },
    passthru: {
      type: "float",
      default: 50,
      uniform: "passthru",
      min: 0,
      max: 100,
      ui: {
        label: "passthru",
        control: "slider"
      }
    }
  },
  defaultProgram: "search filter, synth\n\nnoise(ridges: true, colorMode: mono)\n.prismaticAberration(modulate: true)\n.write(o0)",
  paramAliases: { aberrationAmt: 'aberration' },
  passes: [
    {
      name: "render",
      program: "prismaticAberration",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
