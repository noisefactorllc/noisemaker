import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Quad Tap",
  namespace: "classicNoisedeck",
  func: "quadTap",
  tags: ["gradient"],

  description: "Four-corner color gradient with animated hue shift",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    speed: { slot: 0, components: 'w' },
    intensity: { slot: 1, components: 'x' },
    color1: { slot: 2, components: 'xyzw' },
    color2: { slot: 3, components: 'xyzw' },
    color3: { slot: 4, components: 'xyzw' },
    color4: { slot: 5, components: 'xyzw' }
  },
  globals: {
    speed: {
      type: "float",
      default: 25,
      min: 0,
      max: 100,
      ui: { label: "speed", control: "slider", category: "animation" },
      uniform: "speed"
    },
    intensity: {
      type: "float",
      default: 0,
      min: -100,
      max: 100,
      ui: { label: "intensity", control: "slider", category: "color" },
      uniform: "intensity"
    },
    color1: {
      type: "color",
      default: [1, 0, 0, 1],
      ui: { label: "color 1", control: "color", category: "color" },
      uniform: "color1"
    },
    color2: {
      type: "color",
      default: [0, 1, 0, 1],
      ui: { label: "color 2", control: "color", category: "color" },
      uniform: "color2"
    },
    color3: {
      type: "color",
      default: [0, 0, 1, 1],
      ui: { label: "color 3", control: "color", category: "color" },
      uniform: "color3"
    },
    color4: {
      type: "color",
      default: [1, 1, 0, 1],
      ui: { label: "color 4", control: "color", category: "color" },
      uniform: "color4"
    }
  },
  paramAliases: { loopAmp: 'speed' },
  passes: [
    {
      name: "render",
      program: "quadTap",
      inputs: {
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
