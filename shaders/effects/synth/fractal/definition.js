import { Effect } from '../../../src/runtime/effect.js';

/**
 * nu/fractal - Mono-only fractal explorer
 * Removed: palette colorization, hsv colorMode, hueRange, all palette uniforms
 * Output: grayscale intensity based on escape iteration
 */
export default new Effect({
  name: "Fractal",
  namespace: "synth",
  func: "fractal",

  description: "Julia, Mandelbrot, Newton fractal explorer",
  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    fractalType: { slot: 1, components: 'x' },
    symmetry: { slot: 1, components: 'y' },
    offsetX: { slot: 1, components: 'z' },
    offsetY: { slot: 1, components: 'w' },
    centerX: { slot: 2, components: 'x' },
    centerY: { slot: 2, components: 'y' },
    zoomAmt: { slot: 2, components: 'z' },
    speed: { slot: 2, components: 'w' },
    rotation: { slot: 3, components: 'x' },
    iterations: { slot: 3, components: 'y' },
    mode: { slot: 3, components: 'z' },
    levels: { slot: 3, components: 'w' },
    backgroundColor: { slot: 4, components: 'xyz' },
    backgroundOpacity: { slot: 4, components: 'w' },
    cutoff: { slot: 5, components: 'x' }
  },
  globals: {
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    fractalType: {
      type: "int",
      default: 0,
      uniform: "fractalType",
      choices: {
        julia: 0,
        mandelbrot: 2,
        newton: 1
      },
      ui: {
        label: "type",
        control: "dropdown"
      }
    },
    symmetry: {
      type: "int",
      default: 0,
      uniform: "symmetry",
      ui: {
        label: "symmetry",
        control: "slider"
      }
    },
    zoomAmt: {
      type: "float",
      default: 0,
      uniform: "zoomAmt",
      min: 0,
      max: 130,
      ui: {
        label: "zoom",
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
    speed: {
      type: "float",
      default: 30,
      uniform: "speed",
      min: 0,
      max: 100,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    offsetX: {
      type: "float",
      default: 70,
      uniform: "offsetX",
      min: -100,
      max: 100,
      ui: {
        label: "offset x",
        control: "slider"
      }
    },
    offsetY: {
      type: "float",
      default: 50,
      uniform: "offsetY",
      min: -100,
      max: 100,
      ui: {
        label: "offset y",
        control: "slider"
      }
    },
    centerX: {
      type: "float",
      default: 0,
      uniform: "centerX",
      min: -100,
      max: 100,
      ui: {
        label: "center x",
        control: "slider"
      }
    },
    centerY: {
      type: "float",
      default: 0,
      uniform: "centerY",
      min: -100,
      max: 100,
      ui: {
        label: "center y",
        control: "slider"
      }
    },
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        iter: 0,
        z: 1
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    iterations: {
      type: "int",
      default: 50,
      uniform: "iterations",
      min: 1,
      max: 50,
      ui: {
        label: "iterations",
        control: "slider"
      }
    },
    levels: {
      type: "int",
      default: 0,
      uniform: "levels",
      min: 0,
      max: 32,
      ui: {
        label: "posterize",
        control: "slider"
      }
    },
    backgroundColor: {
      type: "vec3",
      default: [0.0, 0.0, 0.0],
      uniform: "backgroundColor",
      ui: {
        label: "bkg color",
        control: "color"
      }
    },
    backgroundOpacity: {
      type: "float",
      default: 100,
      uniform: "backgroundOpacity",
      min: 0,
      max: 100,
      ui: {
        label: "bkg opacity",
        control: "slider"
      }
    },
    cutoff: {
      type: "float",
      default: 0,
      uniform: "cutoff",
      min: 0,
      max: 100,
      ui: {
        label: "cutoff",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "fractal",
      inputs: {
      },

      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
