import { Effect } from '../../../src/runtime/effect.js';

export default new Effect({
  name: "Pattern",
  namespace: "classicNoisedeck",
  func: "pattern",
  uniformLayout: {
        resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    patternType: { slot: 1, components: 'x' },
    scale: { slot: 1, components: 'y' },
    skewAmt: { slot: 1, components: 'z' },
    rotation: { slot: 1, components: 'w' },
    lineWidth: { slot: 2, components: 'x' },
    animation: { slot: 2, components: 'y' },
    speed: { slot: 2, components: 'z' },
    sharpness: { slot: 2, components: 'w' },
    color1: { slot: 3, components: 'xyz' },
    color2: { slot: 4, components: 'xyz' }
  },
  globals: {
    patternType: {
      type: "int",
      default: 1,
      uniform: "patternType",
      choices: {
        checkers: 0,
        dots: 1,
        grid: 2,
        hearts: 3,
        hexagons: 4,
        rings: 5,
        squares: 6,
        stripes: 7,
        waves: 8,
        zigzag: 9,
        truchetLines: 10,
        truchetCurves: 11
      },
      ui: {
        label: "pattern",
        control: "dropdown"
      }
    },
    scale: {
      type: "float",
      default: 80,
      uniform: "scale",
      min: 1,
      max: 100,
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    skewAmt: {
      type: "float",
      default: 0,
      uniform: "skewAmt",
      min: -100,
      max: 100,
      ui: {
        label: "skew",
        control: "slider"
      }
    },
    rotation: {
      type: "int",
      default: 0,
      uniform: "rotation",
      min: -180,
      max: 180,
      ui: {
        label: "rotate",
        control: "slider"
      }
    },
    lineWidth: {
      type: "float",
      default: 100,
      uniform: "lineWidth",
      min: 1,
      max: 100,
      ui: {
        label: "width",
        control: "slider"
      }
    },
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "truchet seed",
        control: "slider"
      }
    },
    animation: {
      type: "int",
      default: 0,
      uniform: "animation",
      choices: {
        none: 0,
        panWithRotation: 1,
        panLeft: 2,
        panRight: 3,
        panUp: 4,
        panDown: 5,
        rotateCw: 6,
        rotateCcw: 7
      },
      ui: {
        label: "animation",
        control: "dropdown"
      }
    },
    speed: {
      type: "int",
      default: 1,
      uniform: "speed",
      min: 0,
      max: 10,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    sharpness: {
      type: "float",
      default: 100,
      uniform: "sharpness",
      min: 0,
      max: 100,
      ui: {
        label: "sharpness",
        control: "slider"
      }
    },
    color1: {
      type: "vec3",
      default: [1.0, 0.9176470588235294, 0.19215686274509805],
      uniform: "color1",
      ui: {
        label: "color 1",
        control: "color"
      }
    },
    color2: {
      type: "vec3",
      default: [0.0, 0.0, 0.0],
      uniform: "color2",
      ui: {
        label: "color 2",
        control: "color"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "pattern",
      inputs: {
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
