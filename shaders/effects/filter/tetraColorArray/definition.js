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
  tetraColorArrayColorMode: { slot: 0, components: 'x' },
  tetraColorArrayColorCount: { slot: 0, components: 'y' },
  tetraColorArrayPositionMode: { slot: 0, components: 'z' },
  tetraColorArrayRepeat: { slot: 0, components: 'w' },
  tetraColorArrayOffset: { slot: 1, components: 'x' },
  tetraColorArrayAlpha: { slot: 1, components: 'y' },
  tetraColorArrayColor0: { slot: 2, components: 'xyz' },
  tetraColorArrayColor1: { slot: 3, components: 'xyz' },
  tetraColorArrayColor2: { slot: 4, components: 'xyz' },
  tetraColorArrayColor3: { slot: 5, components: 'xyz' },
  tetraColorArrayColor4: { slot: 6, components: 'xyz' },
  tetraColorArrayColor5: { slot: 7, components: 'xyz' },
  tetraColorArrayColor6: { slot: 8, components: 'xyz' },
  tetraColorArrayColor7: { slot: 9, components: 'xyz' },
  tetraColorArrayPos0: { slot: 10, components: 'x' },
  tetraColorArrayPos1: { slot: 10, components: 'y' },
  tetraColorArrayPos2: { slot: 10, components: 'z' },
  tetraColorArrayPos3: { slot: 10, components: 'w' },
  tetraColorArrayPos4: { slot: 11, components: 'x' },
  tetraColorArrayPos5: { slot: 11, components: 'y' },
  tetraColorArrayPos6: { slot: 11, components: 'z' },
  tetraColorArrayPos7: { slot: 11, components: 'w' }
}

export default new Effect({
  name: "TetraColorArray",
  namespace: "filter",
  func: "tetraColorArray",
  tags: ["color"],

  description: "Apply Tetra color array gradients based on luminance",

  uniformLayout,

  globals: {
    // === Color Mode ===
    colorMode: {
      type: "int",
      default: 0,
      uniform: "tetraColorArrayColorMode",
      choices: {
        rgb: 0,
        hsv: 1,
        oklab: 2,
        oklch: 3
      },
      ui: {
        label: "Color Mode",
        control: "dropdown",
        category: "mode"
      }
    },

    // === Color Count ===
    colorCount: {
      type: "int",
      default: 8,
      uniform: "tetraColorArrayColorCount",
      min: 2,
      max: 8,
      step: 1,
      ui: {
        label: "Color Count",
        control: "slider",
        category: "mode"
      }
    },

    // === Position Mode ===
    positionMode: {
      type: "int",
      default: 0,
      uniform: "tetraColorArrayPositionMode",
      choices: {
        auto: 0,
        manual: 1
      },
      ui: {
        label: "Position Mode",
        control: "dropdown",
        category: "mode"
      }
    },

    // === Colors (up to 8) ===
    // Default: VIBGYORV (reverse rainbow)
    color0: {
      type: "color",
      default: [0.58, 0.0, 0.83],  // Violet
      uniform: "tetraColorArrayColor0",
      ui: {
        label: "Color 1",
        control: "color",
        category: "colors"
      }
    },
    color1: {
      type: "color",
      default: [0.29, 0.0, 0.51],  // Indigo
      uniform: "tetraColorArrayColor1",
      ui: {
        label: "Color 2",
        control: "color",
        category: "colors"
      }
    },
    color2: {
      type: "color",
      default: [0.0, 0.0, 1.0],  // Blue
      uniform: "tetraColorArrayColor2",
      ui: {
        label: "Color 3",
        control: "color",
        category: "colors"
      }
    },
    color3: {
      type: "color",
      default: [0.0, 1.0, 0.0],  // Green
      uniform: "tetraColorArrayColor3",
      ui: {
        label: "Color 4",
        control: "color",
        category: "colors"
      }
    },
    color4: {
      type: "color",
      default: [1.0, 1.0, 0.0],  // Yellow
      uniform: "tetraColorArrayColor4",
      ui: {
        label: "Color 5",
        control: "color",
        category: "colors"
      }
    },
    color5: {
      type: "color",
      default: [1.0, 0.5, 0.0],  // Orange
      uniform: "tetraColorArrayColor5",
      ui: {
        label: "Color 6",
        control: "color",
        category: "colors",
        enabledBy: { param: "colorCount", gt: 5 }
      }
    },
    color6: {
      type: "color",
      default: [1.0, 0.0, 0.0],  // Red
      uniform: "tetraColorArrayColor6",
      ui: {
        label: "Color 7",
        control: "color",
        category: "colors",
        enabledBy: { param: "colorCount", gt: 6 }
      }
    },
    color7: {
      type: "color",
      default: [0.58, 0.0, 0.83],  // Violet
      uniform: "tetraColorArrayColor7",
      ui: {
        label: "Color 8",
        control: "color",
        category: "colors",
        enabledBy: { param: "colorCount", gt: 7 }
      }
    },

    // === Positions (for manual mode) ===
    pos0: {
      type: "float",
      default: 0.0,
      uniform: "tetraColorArrayPos0",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Position 1",
        control: "slider",
        category: "positions",
        enabledBy: "positionMode"
      }
    },
    pos1: {
      type: "float",
      default: 0.14,
      uniform: "tetraColorArrayPos1",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Position 2",
        control: "slider",
        category: "positions",
        enabledBy: "positionMode"
      }
    },
    pos2: {
      type: "float",
      default: 0.29,
      uniform: "tetraColorArrayPos2",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Position 3",
        control: "slider",
        category: "positions",
        enabledBy: "positionMode"
      }
    },
    pos3: {
      type: "float",
      default: 0.43,
      uniform: "tetraColorArrayPos3",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Position 4",
        control: "slider",
        category: "positions",
        enabledBy: "positionMode"
      }
    },
    pos4: {
      type: "float",
      default: 0.57,
      uniform: "tetraColorArrayPos4",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Position 5",
        control: "slider",
        category: "positions",
        enabledBy: "positionMode"
      }
    },
    pos5: {
      type: "float",
      default: 0.71,
      uniform: "tetraColorArrayPos5",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Position 6",
        control: "slider",
        category: "positions",
        enabledBy: { and: [{ param: "positionMode", eq: 1 }, { param: "colorCount", gt: 5 }] }
      }
    },
    pos6: {
      type: "float",
      default: 0.86,
      uniform: "tetraColorArrayPos6",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Position 7",
        control: "slider",
        category: "positions",
        enabledBy: { and: [{ param: "positionMode", eq: 1 }, { param: "colorCount", gt: 6 }] }
      }
    },
    pos7: {
      type: "float",
      default: 1.0,
      uniform: "tetraColorArrayPos7",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Position 8",
        control: "slider",
        category: "positions",
        enabledBy: { and: [{ param: "positionMode", eq: 1 }, { param: "colorCount", gt: 7 }] }
      }
    },

    // === Mapping Controls ===
    repeat: {
      type: "float",
      default: 1.0,
      uniform: "tetraColorArrayRepeat",
      min: 0.1,
      max: 10,
      step: 0.1,
      ui: {
        label: "Repeat",
        control: "slider",
        category: "mapping"
      }
    },
    offset: {
      type: "float",
      default: 0.0,
      uniform: "tetraColorArrayOffset",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "Offset",
        control: "slider",
        category: "mapping"
      }
    },

    // === Output ===
    alpha: {
      type: "float",
      default: 1.0,
      uniform: "tetraColorArrayAlpha",
      min: 0,
      max: 1,
      randMin: 0.5,
      step: 0.01,
      ui: {
        label: "Alpha",
        control: "slider",
        category: "output"
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
