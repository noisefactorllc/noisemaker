import { Effect } from '../../../src/runtime/effect.js';

/**
 * Pixel Sort - GPGPU Implementation
 * 
 * Multi-pass GPGPU pipeline using textures as data buffers:
 * 1. Prepare: Pad to square, rotate by angle, optionally invert for darkest
 * 2. Luminance: Compute per-pixel luminance → store in texture
 * 3. Find Brightest: Find brightest x per row → store in texture  
 * 4. Compute Rank: For each pixel, count brighter pixels → store rank
 * 5. Gather: Use ranks to gather sorted pixels with alignment
 * 6. Finalize: Rotate back, max blend with original
 */
export default new Effect({
  name: "PixelSort",
  namespace: "classicNoisemaker",
  func: "pixelSort",

  description: "Pixel sorting glitch effect",
  globals: {
    angled: {
        type: "float",
        default: 0,
        uniform: "angled",
        min: -180,
        max: 180,
        step: 1,
        ui: {
            label: "Angle",
            control: "slider"
        }
    },
    darkest: {
        type: "boolean",
        default: false,
        uniform: "darkest",
        ui: {
            label: "Darkest First",
            control: "checkbox"
        }
    }
  },
  textures: {
    prepared: { width: "100%", height: "100%", format: "rgba16f" },
    luminance: { width: "100%", height: "100%", format: "rgba16f" },
    brightest: { width: "100%", height: "100%", format: "rgba16f" },
    rank: { width: "100%", height: "100%", format: "rgba16f" },
    sorted: { width: "100%", height: "100%", format: "rgba16f" }
  },
  passes: [
    {
      name: "prepare",
      program: "prepare",
      inputs: {
        inputTex: "inputTex"
      },
      uniforms: {
        resolution: "resolution",
        angled: "angled",
        darkest: "darkest"
      },
      outputs: {
        fragColor: "prepared"
      }
    },
    {
      name: "luminance",
      program: "luminance",
      inputs: {
        inputTex: "prepared"
      },
      outputs: {
        fragColor: "luminance"
      }
    },
    {
      name: "findBrightest",
      program: "findBrightest",
      inputs: {
        lumTex: "luminance"
      },
      outputs: {
        fragColor: "brightest"
      }
    },
    {
      name: "computeRank",
      program: "computeRank",
      inputs: {
        lumTex: "luminance"
      },
      outputs: {
        fragColor: "rank"
      }
    },
    {
      name: "gatherSorted",
      program: "gatherSorted",
      inputs: {
        preparedTex: "prepared",
        rankTex: "rank",
        brightestTex: "brightest"
      },
      outputs: {
        fragColor: "sorted"
      }
    },
    {
      name: "finalize",
      program: "finalize",
      inputs: {
        inputTex: "sorted",
        originalTex: "inputTex"
      },
      uniforms: {
        resolution: "resolution",
        angled: "angled",
        darkest: "darkest"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
});
