import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Voronoi",
  namespace: "classicBasics",
  func: "voronoi",

  description: "Voronoi cell noise",
  globals: {
    "scale": {
        "type": "float",
        "default": 5,
        "min": 0,
        "max": 100,
        "uniform": "scale"
    },
    "speed": {
        "type": "float",
        "default": 0,
        "min": -10,
        "max": 10,
        "uniform": "speed"
    },
    "blend": {
        "type": "float",
        "default": 0,
        "min": 0,
        "max": 1,
        "uniform": "blend"
    }
},
  passes: [
    {
      name: "main",
      program: "voronoi",
      inputs: {},
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
