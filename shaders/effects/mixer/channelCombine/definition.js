import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "ChannelCombine",
  namespace: "mixer",
  func: "channelCombine",
  tags: ["color"],

  description: "Combine separate surface inputs into R, G, B channels",
  globals: {
    rTex: {
      type: "surface",
      default: "none",
      ui: { label: "red source" }
    },
    gTex: {
      type: "surface",
      default: "none",
      ui: { label: "green source" }
    },
    bTex: {
      type: "surface",
      default: "none",
      ui: { label: "blue source" }
    },
    rLevel: {
      type: "float",
      default: 100,
      uniform: "rLevel",
      min: 0,
      max: 100,
      ui: { label: "red level", control: "slider" }
    },
    gLevel: {
      type: "float",
      default: 100,
      uniform: "gLevel",
      min: 0,
      max: 100,
      ui: { label: "green level", control: "slider" }
    },
    bLevel: {
      type: "float",
      default: 100,
      uniform: "bLevel",
      min: 0,
      max: 100,
      ui: { label: "blue level", control: "slider" }
    }
  },
  defaultProgram: "search mixer, synth, filter\n\nnoise(ridges: true, colorMode: mono)\n.write(o0)\n\nperlin(colorMode: mono)\n.write(o1)\n\ngradient(type: linear)\n.write(o2)\n\nchannelCombine(rTex: read(o0), gTex: read(o1), bTex: read(o2))\n.write(o3)",
  passes: [
    {
      name: "render",
      program: "channelCombine",
      inputs: { rTex: "rTex", gTex: "gTex", bTex: "bTex" },
      outputs: { fragColor: "outputTex" }
    }
  ]
})
