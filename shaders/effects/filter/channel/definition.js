import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Channel",
  namespace: "filter",
  func: "channel",
  tags: ["color", "util"],

  description: "Channel isolation (r, g, b, or a)",
  globals: {
    "channel": {
        "type": "member",
        "default": "channel.r",
        "enum": "channel",
        "uniform": "channel",
        ui: {
            label: "channel"
        }},
    "scale": {
        "type": "float",
        "default": 1,
        "min": -10,
        "max": 10,
        "uniform": "scale",
        ui: {
            label: "scale"
        }},
    "offset": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "offset",
        ui: {
            label: "offset"
        }}
  },
  passes: [
    {
      name: "main",
      program: "channel",
      inputs: {
        "inputTex": "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
