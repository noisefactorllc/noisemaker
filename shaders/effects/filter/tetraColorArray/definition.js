import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/tetraColorArray - Tetra Color Array Gradient Mapping
 *
 * Applies a discrete color gradient to an input image based on luminance.
 * Supports 2-8 colors with optional custom positions.
 *
 * Compatible with Tetra's color array palette format. Supports RGB, HSV, OkLab, and OKLCH color modes.
 *
 * UI provides a mini version of Tetra's color array editor with:
 * - Preview gradient at top
 * - Up to 8 color pickers
 * - Position sliders for each color (manual mode)
 * - Color mode selector
 * - Config file loading support
 */

// Maps uniform names to packed vec4 slots for WGSL
// data[0].x = colorMode, .y = colorCount, .z = positionMode, .w = repeat
// data[1].x = offset (mapping), .y = alpha, .zw = reserved
// data[2-9] = colors 1-8 (xyz = rgb, w = reserved)
// data[10] = positions 1-4 (xyzw)
// data[11] = positions 5-8 (xyzw)
const uniformLayout = {
  colorMode: { slot: 0, components: 'x' },
  colorCount: { slot: 0, components: 'y' },
  positionMode: { slot: 0, components: 'z' },
  repeat: { slot: 0, components: 'w' },
  offset: { slot: 1, components: 'x' },
  alpha: { slot: 1, components: 'y' },
  smoothness: { slot: 1, components: 'z' },
  color0: { slot: 2, components: 'xyz' },
  color1: { slot: 3, components: 'xyz' },
  color2: { slot: 4, components: 'xyz' },
  color3: { slot: 5, components: 'xyz' },
  color4: { slot: 6, components: 'xyz' },
  color5: { slot: 7, components: 'xyz' },
  color6: { slot: 8, components: 'xyz' },
  color7: { slot: 9, components: 'xyz' },
  pos0: { slot: 10, components: 'x' },
  pos1: { slot: 10, components: 'y' },
  pos2: { slot: 10, components: 'z' },
  pos3: { slot: 10, components: 'w' },
  pos4: { slot: 11, components: 'x' },
  pos5: { slot: 11, components: 'y' },
  pos6: { slot: 11, components: 'z' },
  pos7: { slot: 11, components: 'w' }
}

export default new Effect({
  name: "TetraColorArray",
  namespace: "filter",
  func: "tetraColorArray",
  tags: ["color"],

  description: "Apply Tetra color array palettes based on luminance",

  uniformLayout,

  globals: {
    // === Color Mode ===
    colorMode: {
      type: "int",
      default: 0,
      uniform: "colorMode",
      choices: {
        rgb: 0,
        hsv: 1,
        oklab: 2,
        oklch: 3
      },
      ui: {
        label: "blend space",
        control: "dropdown"
      }
    },

    // === Color Count ===
    colorCount: {
      type: "int",
      default: 6,
      uniform: "colorCount",
      min: 2,
      max: 8,
      step: 1,
      ui: {
        label: "color count",
        control: "slider"
      }
    },

    // === Position Mode ===
    positionMode: {
      type: "int",
      default: 0,
      uniform: "positionMode",
      choices: {
        auto: 0,
        manual: 1
      },
      randChance: 0,
      ui: {
        label: "positioning",
        control: "dropdown"
      }
    },

    // === Colors (up to 8) ===
    // Default: VIBGYORV (reverse rainbow)
    color0: {
      type: "color",
      default: [1.0, 0.0, 0.0],  // Red
      uniform: "color0",
      ui: {
        label: "color 1",
        control: "color",
        category: "colors"
      }
    },
    color1: {
      type: "color",
      default: [1.0, 0.5, 0.0],  // Orange
      uniform: "color1",
      ui: {
        label: "color 2",
        control: "color",
        category: "colors"
      }
    },
    color2: {
      type: "color",
      default: [1.0, 1.0, 0.0],  // Yellow
      uniform: "color2",
      ui: {
        label: "color 3",
        control: "color",
        category: "colors",
        enabledBy: { param: "colorCount", gt: 2 }
      }
    },
    color3: {
      type: "color",
      default: [0.0, 1.0, 0.0],  // Green
      uniform: "color3",
      ui: {
        label: "color 4",
        control: "color",
        category: "colors",
        enabledBy: { param: "colorCount", gt: 3 }
      }
    },
    color4: {
      type: "color",
      default: [0.0, 0.0, 1.0],  // Blue
      uniform: "color4",
      ui: {
        label: "color 5",
        control: "color",
        category: "colors",
        enabledBy: { param: "colorCount", gt: 4 }
      }
    },
    color5: {
      type: "color",
      default: [0.58, 0.0, 0.83],  // Violet
      uniform: "color5",
      ui: {
        label: "color 6",
        control: "color",
        category: "colors",
        enabledBy: { param: "colorCount", gt: 5 }
      }
    },
    color6: {
      type: "color",
      default: [1, 1, 1],  // White
      uniform: "color6",
      ui: {
        label: "color 7",
        control: "color",
        category: "colors",
        enabledBy: { param: "colorCount", gt: 6 }
      }
    },
    color7: {
      type: "color",
      default: [0, 0, 0],  // Black
      uniform: "color7",
      ui: {
        label: "color 8",
        control: "color",
        category: "colors",
        enabledBy: { param: "colorCount", gt: 7 }
      }
    },

    // === Positions (for manual mode) ===
    pos0: {
      type: "float",
      default: 0.0,
      uniform: "pos0",
      min: 0,
      max: 1,
      step: 0.01,
      randChance: 0,
      ui: {
        label: "position 1",
        control: "slider",
        category: "positions",
        enabledBy: { param: "positionMode", eq: 1 }
      }
    },
    pos1: {
      type: "float",
      default: 0.14,
      uniform: "pos1",
      min: 0,
      max: 1,
      step: 0.01,
      randChance: 0,
      ui: {
        label: "position 2",
        control: "slider",
        category: "positions",
        enabledBy: { param: "positionMode", eq: 1 }
      }
    },
    pos2: {
      type: "float",
      default: 0.29,
      uniform: "pos2",
      min: 0,
      max: 1,
      step: 0.01,
      randChance: 0,
      ui: {
        label: "position 3",
        control: "slider",
        category: "positions",
        enabledBy: { and: [{ param: "positionMode", eq: 1 }, { param: "colorCount", gt: 2 }] }
      }
    },
    pos3: {
      type: "float",
      default: 0.43,
      uniform: "pos3",
      min: 0,
      max: 1,
      step: 0.01,
      randChance: 0,
      ui: {
        label: "position 4",
        control: "slider",
        category: "positions",
        enabledBy: { and: [{ param: "positionMode", eq: 1 }, { param: "colorCount", gt: 3 }] }
      }
    },
    pos4: {
      type: "float",
      default: 0.57,
      uniform: "pos4",
      min: 0,
      max: 1,
      step: 0.01,
      randChance: 0,
      ui: {
        label: "position 5",
        control: "slider",
        category: "positions",
        enabledBy: { and: [{ param: "positionMode", eq: 1 }, { param: "colorCount", gt: 4 }] }
      }
    },
    pos5: {
      type: "float",
      default: 0.71,
      uniform: "pos5",
      min: 0,
      max: 1,
      step: 0.01,
      randChance: 0,
      ui: {
        label: "position 6",
        control: "slider",
        category: "positions",
        enabledBy: { and: [{ param: "positionMode", eq: 1 }, { param: "colorCount", gt: 5 }] }
      }
    },
    pos6: {
      type: "float",
      default: 0.86,
      uniform: "pos6",
      min: 0,
      max: 1,
      step: 0.01,
      randChance: 0,
      ui: {
        label: "position 7",
        control: "slider",
        category: "positions",
        enabledBy: { and: [{ param: "positionMode", eq: 1 }, { param: "colorCount", gt: 6 }] }
      }
    },
    pos7: {
      type: "float",
      default: 1.0,
      uniform: "pos7",
      min: 0,
      max: 1,
      step: 0.01,
      randChance: 0,
      ui: {
        label: "position 8",
        control: "slider",
        category: "positions",
        enabledBy: { and: [{ param: "positionMode", eq: 1 }, { param: "colorCount", gt: 7 }] }
      }
    },

    // === Mapping Controls ===
    repeat: {
      type: "float",
      default: 1.0,
      uniform: "repeat",
      min: 0.1,
      max: 10,
      step: 0.1,
      ui: {
        label: "repeat",
        control: "slider",
        category: "mapping"
      }
    },
    offset: {
      type: "float",
      default: 0.0,
      uniform: "offset",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "offset",
        control: "slider",
        category: "mapping"
      }
    },

    // === Output ===
    alpha: {
      type: "float",
      default: 1.0,
      uniform: "alpha",
      min: 0,
      max: 1,
      randMin: 0.5,
      step: 0.01,
      ui: {
        label: "alpha",
        control: "slider"
      }
    },

    // === Smoothness ===
    smoothness: {
      type: "float",
      default: 1,
      uniform: "smoothness",
      min: 0,
      max: 1,
      ui: {
        label: "smoothness",
        control: "slider"
      }
    }
  },

  passes: [
    {
      name: "render",
      program: "tetraColorArray",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
