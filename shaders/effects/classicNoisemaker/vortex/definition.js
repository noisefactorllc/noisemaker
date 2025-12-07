import { Effect } from '../../../src/runtime/effect.js';

/**
 * Vortex - swirling distortion from center
 */
export default new Effect({
  name: "Vortex",
  namespace: "classicNoisemaker",
  func: "vortex",

  description: "Vortex/spiral distortion",
  globals: {
    displacement: {
      type: "float",
      default: 1.0,
      uniform: "displacement",
      min: 0,
      max: 4,
      step: 0.01,
      ui: {
        label: "Displacement",
        control: "slider"
      }
    },
    speed: {
      type: "float",
      default: 1.0,
      uniform: "speed",
      min: 0,
      max: 5,
      step: 0.1,
      ui: {
        label: "Speed",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "vortex",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        displacement: "displacement",
        speed: "speed"
      },
      outputs: {
        color: "outputTex"
      }
    }
  ]
});
