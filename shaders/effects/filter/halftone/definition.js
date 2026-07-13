import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/halftone - Rotated-screen halftone reproduction with color and
 * monochrome modes.
 *
 * color mode separates the source into CMYK with under-color removal,
 * screens each ink through its own rotated dot grid, and composites the
 * four coverages subtractively. Neutral input therefore uses only the K
 * screen instead of producing colored RGB fringes.
 *
 * mono mode screens image luminance through a single user-selectable
 * spot function (`pattern`: dot / line / circle) and tonemaps between
 * `paperColor` (no ink) and `inkColor` (full ink).
 *
 * Single pass on global (tile-aware) pixel coordinates so the screen
 * grid aligns seamlessly across CLI render tiles.
 */
export default new Effect({
  name: "Halftone",
  namespace: "filter",
  func: "halftone",
  tags: ["color", "pixel", "artist"],

  description: "Rotated-screen halftone reproduction with subtractive color rosettes or monochrome dot, line, and circle screens",
  globals: {
    mode: {
      type: "int",
      default: 0,
      define: "MODE",
      choices: {
        color: 0,
        mono: 1
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    pattern: {
      type: "int",
      default: 0,
      define: "PATTERN",
      choices: {
        dot: 0,
        line: 1,
        circle: 2
      },
      ui: {
        label: "pattern",
        control: "dropdown",
        enabledBy: { param: "mode", eq: 1 }
      }
    },
    frequency: {
      type: "float",
      default: 24,
      uniform: "frequency",
      min: 4,
      max: 128,
      ui: {
        label: "frequency",
        control: "slider"
      }
    },
    cyanAngle: {
      type: "float",
      default: 108,
      uniform: "cyanAngle",
      min: -180,
      max: 180,
      ui: {
        label: "cyan angle",
        control: "slider",
        enabledBy: { param: "mode", eq: 0 }
      }
    },
    magentaAngle: {
      type: "float",
      default: 162,
      uniform: "magentaAngle",
      min: -180,
      max: 180,
      ui: {
        label: "magenta angle",
        control: "slider",
        enabledBy: { param: "mode", eq: 0 }
      }
    },
    yellowAngle: {
      type: "float",
      default: 90,
      uniform: "yellowAngle",
      min: -180,
      max: 180,
      ui: {
        label: "yellow angle",
        control: "slider",
        enabledBy: { param: "mode", eq: 0 }
      }
    },
    blackAngle: {
      type: "float",
      default: 45,
      uniform: "blackAngle",
      min: -180,
      max: 180,
      ui: {
        label: "black angle",
        control: "slider",
        enabledBy: { param: "mode", eq: 0 }
      }
    },
    monoAngle: {
      type: "float",
      default: 45,
      uniform: "monoAngle",
      min: -180,
      max: 180,
      ui: {
        label: "mono angle",
        control: "slider",
        enabledBy: {
          and: [
            { param: "mode", eq: 1 },
            { param: "pattern", in: [0, 1] }
          ]
        }
      }
    },
    sharpness: {
      type: "float",
      default: 80,
      uniform: "sharpness",
      min: 0,
      max: 100,
      ui: {
        label: "sharpness",
        control: "slider"
      }
    },
    inkColor: {
      type: "color",
      default: [0.05, 0.05, 0.05],
      uniform: "inkColor",
      ui: {
        label: "ink color",
        control: "color",
        enabledBy: { param: "mode", eq: 1 }
      }
    },
    paperColor: {
      type: "color",
      default: [0.98, 0.96, 0.9],
      uniform: "paperColor",
      ui: {
        label: "paper color",
        control: "color",
        enabledBy: { param: "mode", eq: 1 }
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "halftone",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
