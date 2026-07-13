import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/craquelure - cracked-plaster groove network with carved relief
 * over the image.
 *
 * Single pass on global (tile-aware) pixel coordinates: a Voronoi-derived
 * jittered-grid Voronoi field is extended to track F1 (nearest seed
 * distance) AND F2 (second-nearest), whose difference is a standard
 * "distance to cell border" proxy used to carve a groove network, then
 * filter/relief's directional shading (fixed 135-degree light) is beveled onto the
 * groove walls from a true central-difference gradient of the crack
 * mask. See glsl/craquelure.glsl for the full derivation.
 */
export default new Effect({
  name: "Craquelure",
  namespace: "filter",
  func: "craquelure",
  tags: ["noise", "edges", "artist"],

  description: "Cracked-plaster groove network with carved relief shading over the image (Craquelure)",
  globals: {
    spacing: {
      type: "float",
      default: 40,
      uniform: "spacing",
      min: 5,
      max: 100,
      ui: {
        label: "spacing",
        control: "slider"
      }
    },
    depth: {
      type: "float",
      default: 50,
      uniform: "depth",
      min: 0,
      max: 100,
      ui: {
        label: "depth",
        control: "slider"
      }
    },
    brightness: {
      type: "float",
      default: 50,
      uniform: "brightness",
      min: 0,
      max: 100,
      ui: {
        label: "brightness",
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
        label: "seed",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "craquelure",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
