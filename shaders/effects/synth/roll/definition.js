import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Roll",
  namespace: "synth",
  func: "roll",
  tags: ["midi"],

  description: "MIDI piano roll visualizer",
  globals: {
    "color": {
        "type": "color",
        "default": [0, 1, 0],
        "uniform": "lineColor",
        "ui": {
            "label": "color",
            "control": "color"
        }
    },
    "gain": {
        "type": "float",
        "default": 1.0,
        "min": 0.1,
        "max": 5.0,
        "step": 0.1,
        "uniform": "gain",
        "ui": {
            "label": "gain",
            "control": "slider"
        }
    },
    "speed": {
        "type": "float",
        "default": 1.0,
        "min": 0.5,
        "max": 5.0,
        "step": 0.1,
        "uniform": "speed",
        "ui": {
            "label": "speed",
            "control": "slider"
        }
    }
  },
  textures: {
    _rollFb: {
      width: "100%",
      height: "100%",
      format: "rgba16f"
    }
  },
  passes: [
    {
      name: "scroll",
      program: "roll",
      inputs: {
        feedbackTex: "_rollFb",
        noteGridTex: "midiNoteGrid"
      },
      outputs: {
        fragColor: "outputTex"
      }
    },
    {
      name: "feedback",
      program: "copy",
      inputs: {
        inputTex: "outputTex"
      },
      outputs: {
        fragColor: "_rollFb"
      }
    }
  ]
})
