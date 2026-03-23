import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Distortion",
  namespace: "mixer",
  func: "distortion",
  tags: ["blend","distort"],

  description: "Displace, reflect, and refract with two surfaces",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: {
        label: "source b"
      }
    },
    mapSource: {
      type: "int",
      default: 1,
      uniform: "mapSource",
      choices: {
        sourceA: 0,
        sourceB: 1
      },
      ui: {
        label: "map source",
        control: "dropdown"
      }
    },
    mode: {
      type: "int",
      default: 1,
      uniform: "mode",
      choices: {
        displace: 0,
        refract: 1,
        reflect: 2
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    intensity: {
      type: "float",
      default: 50,
      uniform: "intensity",
      min: 0,
      max: 100,
      ui: {
        label: "intensity",
        control: "slider"
      }
    },
    wrap: {
      type: "int",
      default: 0,
      uniform: "wrap",
      choices: {
        clamp: 2,
        mirror: 0,
        repeat: 1
      },
      ui: {
        label: "wrap",
        control: "dropdown"
      }
    },
    smoothing: {
      type: "float",
      default: 1,
      uniform: "smoothing",
      min: 1,
      max: 100,
      ui: {
        label: "smoothing",
        control: "slider",
        enabledBy: { param: "mode", neq: 0 }
      }
    },
    aberration: {
      type: "float",
      default: 0,
      uniform: "aberration",
      min: 0,
      max: 25,
      ui: {
        label: "aberration",
        control: "slider",
        enabledBy: { param: "mode", eq: 2 }
      }
    },
    antialias: {
      type: "boolean",
      default: false,
      uniform: "antialias",
      ui: {
        label: "antialias",
        control: "checkbox"
      }
    }
  },
  defaultProgram: "search mixer, synth\n\ncell()\n.write(o0)\n\nnoise(ridges: true)\n.distortion(tex: read(o0))\n.write(o1)",
  passes: [
    {
      name: "render",
      program: "distortion",
      inputs: {
        inputTex: "inputTex",
        tex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
