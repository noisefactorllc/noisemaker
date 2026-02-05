import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/historicPalette - Apply historical art color palettes
 * Maps luminance to 5-color palettes inspired by art history movements
 */
export default new Effect({
  name: "Historic Palette",
  namespace: "filter",
  func: "historicPalette",
  tags: ["color"],

  description: "Apply historical art color palettes based on luminance",
  globals: {
    index: {
      type: "int",
      default: 4,
      uniform: "paletteIndex",
      choices: {
        aboriginalDot: 0,
        abstractExpressionism: 1,
        artDeco: 2,
        artNouveau: 3,
        bauhaus: 4,
        caveArt: 5,
        chineseInk: 6,
        dutchGoldenAge: 7,
        fauvism: 8,
        impressionism: 9,
        indianMiniature: 10,
        islamicGeometric: 11,
        kenteCloth: 12,
        maoriCarving: 13,
        mexicanMuralism: 14,
        minimalism: 15,
        persianMiniature: 16,
        popArt: 17,
        renaissance: 18,
        surrealism: 19,
        ukiyoe: 20
      },
      ui: {
        label: "palette",
        control: "dropdown"
      }
    },
    smoothness: {
      type: "float",
      default: 0,
      uniform: "smoothness",
      min: 0,
      max: 1,
      ui: {
        label: "smoothness",
        control: "slider"
      }
    }
  },
  paramAliases: { paletteIndex: 'index' },
  passes: [
    {
      name: "render",
      program: "historicPalette",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
