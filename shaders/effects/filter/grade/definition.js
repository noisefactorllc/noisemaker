import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/grade - Professional color grading pipeline
 *
 * Multi-pass color grading with:
 * - Primary correction (white balance, exposure, contrast, tone mapping)
 * - Creative look (vibrance, faded film, split toning)
 * - Three-way color wheels (shadows/mids/highlights)
 * - HSL secondary isolation and correction
 * - Vignette with highlight preservation
 *
 * All processing in linear color space with proper color management.
 */
export default new Effect({
  name: "Grade",
  namespace: "filter",
  func: "grade",

  description: "Professional multi-stage color grading pipeline",

  globals: {
    // === LUT PRESETS ===
    lutPreset: {
      type: "int",
      default: 0,
      uniform: "gradeLutPreset",
      choices: {
        none: 0,
        tealOrange: 1,
        warmFilm: 2,
        coolShadows: 3,
        bleachBypass: 4,
        crossProcess: 5,
        cinematic: 6,
        dayForNight: 7,
        vintage: 8,
        noir: 9,
        sepia: 10,
        infrared: 11,
        technicolor: 12,
        neon: 13,
        matrix: 14,
        underwater: 15,
        sunset: 16,
        monochrome: 17,
        psychedelic: 18
      },
      ui: {
        label: "LUT Preset",
        control: "dropdown",
        category: "look"
      }
    },
    lutIntensity: {
      type: "float",
      default: 1,
      uniform: "gradeLutIntensity",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "LUT Intensity",
        control: "slider",
        category: "look",
        enabledBy: "lutPreset"
      }
    },

    // === PRIMARY CORRECTION ===
    temperature: {
      type: "float",
      default: 0,
      uniform: "gradeTemperature",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Temperature",
        category: "primary"
      }
    },
    tint: {
      type: "float",
      default: 0,
      uniform: "gradeTint",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Tint",
        category: "primary"
      }
    },
    exposure: {
      type: "float",
      default: 0,
      uniform: "gradeExposure",
      min: -4,
      max: 4,
      step: 0.05,
      ui: {
        control: false,
        label: "Exposure",
        category: "primary"
      }
    },
    contrast: {
      type: "float",
      default: 0,
      uniform: "gradeContrast",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Contrast",
        category: "primary"
      }
    },
    highlights: {
      type: "float",
      default: 0,
      uniform: "gradeHighlights",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Highlights",
        category: "primary"
      }
    },
    shadows: {
      type: "float",
      default: 0,
      uniform: "gradeShadows",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Shadows",
        category: "primary"
      }
    },
    whites: {
      type: "float",
      default: 0,
      uniform: "gradeWhites",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Whites",
        category: "primary"
      }
    },
    blacks: {
      type: "float",
      default: 0,
      uniform: "gradeBlacks",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Blacks",
        category: "primary"
      }
    },
    saturation: {
      type: "float",
      default: 1,
      uniform: "gradeSaturation",
      min: 0,
      max: 2,
      step: 0.01,
      ui: {
        control: false,
        label: "Saturation",
        category: "primary"
      }
    },

    // === CREATIVE ===
    vibrance: {
      type: "float",
      default: 0,
      uniform: "gradeVibrance",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Vibrance",
        category: "creative"
      }
    },
    fadedFilm: {
      type: "float",
      default: 0,
      uniform: "gradeFadedFilm",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Faded Film",
        category: "creative"
      }
    },
    shadowTint: {
      type: "vec3",
      default: [0.5, 0.5, 0.5],
      uniform: "gradeShadowTint",
      ui: {
        control: false,
        label: "Shadow Tint",
        category: "creative"
      }
    },
    highlightTint: {
      type: "vec3",
      default: [0.5, 0.5, 0.5],
      uniform: "gradeHighlightTint",
      ui: {
        control: false,
        label: "Highlight Tint",
        category: "creative"
      }
    },
    splitToneBalance: {
      type: "float",
      default: 0,
      uniform: "gradeSplitToneBalance",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Split Tone Balance",
        category: "creative"
      }
    },

    // === CURVES (simplified: lift/gamma/gain per channel) ===
    curveShadows: {
      type: "float",
      default: 0,
      uniform: "gradeCurveShadows",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Curve Shadows",
        category: "curves"
      }
    },
    curveMidtones: {
      type: "float",
      default: 0,
      uniform: "gradeCurveMidtones",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Curve Midtones",
        category: "curves"
      }
    },
    curveHighlights: {
      type: "float",
      default: 0,
      uniform: "gradeCurveHighlights",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Curve Highlights",
        category: "curves"
      }
    },

    // === THREE-WAY COLOR WHEELS ===
    wheelShadows: {
      type: "vec3",
      default: [0.5, 0.5, 0.5],
      uniform: "gradeWheelShadows",
      ui: {
        control: false,
        label: "Shadows Wheel",
        category: "wheels"
      }
    },
    wheelMidtones: {
      type: "vec3",
      default: [0.5, 0.5, 0.5],
      uniform: "gradeWheelMidtones",
      ui: {
        control: false,
        label: "Midtones Wheel",
        category: "wheels"
      }
    },
    wheelHighlights: {
      type: "vec3",
      default: [0.5, 0.5, 0.5],
      uniform: "gradeWheelHighlights",
      ui: {
        control: false,
        label: "Highlights Wheel",
        category: "wheels"
      }
    },
    wheelBalance: {
      type: "float",
      default: 0,
      uniform: "gradeWheelBalance",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Wheel Balance",
        category: "wheels",
        hint: "Adjust a color wheel above first"
      }
    },

    // === HSL SECONDARY ===
    hslEnable: {
      type: "int",
      default: 0,
      uniform: "gradeHslEnable",
      min: 0,
      max: 1,
      step: 1,
      ui: {
        control: false,
        label: "Enable HSL Key",
        category: "hslSecondary"
      }
    },
    hslHueCenter: {
      type: "float",
      default: 0,
      uniform: "gradeHslHueCenter",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Hue Center",
        category: "hslSecondary",
        enabledBy: "hslEnable"
      }
    },
    hslHueRange: {
      type: "float",
      default: 0.1,
      uniform: "gradeHslHueRange",
      min: 0,
      max: 0.5,
      step: 0.01,
      ui: {
        control: false,
        label: "Hue Range",
        category: "hslSecondary",
        enabledBy: "hslEnable"
      }
    },
    hslSatMin: {
      type: "float",
      default: 0,
      uniform: "gradeHslSatMin",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Sat Min",
        category: "hslSecondary",
        enabledBy: "hslEnable"
      }
    },
    hslSatMax: {
      type: "float",
      default: 1,
      uniform: "gradeHslSatMax",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Sat Max",
        category: "hslSecondary",
        enabledBy: "hslEnable"
      }
    },
    hslLumMin: {
      type: "float",
      default: 0,
      uniform: "gradeHslLumMin",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Lum Min",
        category: "hslSecondary",
        enabledBy: "hslEnable"
      }
    },
    hslLumMax: {
      type: "float",
      default: 1,
      uniform: "gradeHslLumMax",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Lum Max",
        category: "hslSecondary",
        enabledBy: "hslEnable"
      }
    },
    hslFeather: {
      type: "float",
      default: 0.1,
      uniform: "gradeHslFeather",
      min: 0,
      max: 0.5,
      step: 0.01,
      ui: {
        control: false,
        label: "Feather",
        category: "hslSecondary",
        enabledBy: "hslEnable"
      }
    },
    hslHueShift: {
      type: "float",
      default: 0,
      uniform: "gradeHslHueShift",
      min: -0.5,
      max: 0.5,
      step: 0.01,
      ui: {
        control: false,
        label: "Hue Shift",
        category: "hslSecondary",
        enabledBy: "hslEnable"
      }
    },
    hslSatAdjust: {
      type: "float",
      default: 0,
      uniform: "gradeHslSatAdjust",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Sat Adjust",
        category: "hslSecondary",
        enabledBy: "hslEnable"
      }
    },
    hslLumAdjust: {
      type: "float",
      default: 0,
      uniform: "gradeHslLumAdjust",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Lum Adjust",
        category: "hslSecondary",
        enabledBy: "hslEnable"
      }
    },

    // === VIGNETTE ===
    vignetteAmount: {
      type: "float",
      default: 0,
      uniform: "gradeVignetteAmount",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Vignette Amount",
        category: "vignette"
      }
    },
    vignetteMidpoint: {
      type: "float",
      default: 0.5,
      uniform: "gradeVignetteMidpoint",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Vignette Midpoint",
        category: "vignette",
        enabledBy: "vignetteAmount"
      }
    },
    vignetteRoundness: {
      type: "float",
      default: 0,
      uniform: "gradeVignetteRoundness",
      min: -1,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Vignette Roundness",
        category: "vignette",
        enabledBy: "vignetteAmount"
      }
    },
    vignetteFeather: {
      type: "float",
      default: 0.5,
      uniform: "gradeVignetteFeather",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Vignette Feather",
        category: "vignette",
        enabledBy: "vignetteAmount"
      }
    },
    vignetteHighlightProtect: {
      type: "float",
      default: 0,
      uniform: "gradeVignetteHighlightProtect",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        control: false,
        label: "Highlight Protect",
        category: "vignette",
        enabledBy: "vignetteAmount"
      }
    }
  },

  textures: {
    _primaryTex: {
      width: "input",
      height: "input",
      format: "rgba16float"
    },
    _creativeTex: {
      width: "input",
      height: "input",
      format: "rgba16float"
    },
    _wheelsTex: {
      width: "input",
      height: "input",
      format: "rgba16float"
    },
    _hslTex: {
      width: "input",
      height: "input",
      format: "rgba16float"
    },
    _lutTex: {
      width: "input",
      height: "input",
      format: "rgba16float"
    }
  },

  passes: [
    {
      name: "primary",
      program: "primary",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "_primaryTex"
      }
    },
    {
      name: "creative",
      program: "creative",
      inputs: {
        inputTex: "_primaryTex"
      },
      outputs: {
        fragColor: "_creativeTex"
      }
    },
    {
      name: "wheels",
      program: "wheels",
      inputs: {
        inputTex: "_creativeTex"
      },
      outputs: {
        fragColor: "_wheelsTex"
      }
    },
    {
      name: "hslSecondary",
      program: "hslSecondary",
      inputs: {
        inputTex: "_wheelsTex"
      },
      outputs: {
        fragColor: "_hslTex"
      }
    },
    {
      name: "lut",
      program: "lut",
      inputs: {
        inputTex: "_hslTex"
      },
      outputs: {
        fragColor: "_lutTex"
      }
    },
    {
      name: "vignette",
      program: "vignette",
      inputs: {
        inputTex: "_lutTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
