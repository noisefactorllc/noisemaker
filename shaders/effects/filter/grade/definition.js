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
  tags: ["color"],

  description: "Professional multi-stage color grading pipeline",

  globals: {
    // === LUT PRESETS ===
    preset: {
      type: "int",
      default: 0,
      uniform: "gradePreset",
      choices: {
        none: 0,
        bleachBypass: 4,
        cinematic: 6,
        coolShadows: 3,
        crossProcess: 5,
        dayForNight: 7,
        hardLight: 20,
        infrared: 11,
        matrix: 14,
        monochrome: 17,
        neon: 13,
        noir: 9,
        posterize: 21,
        psychedelic: 18,
        sepia: 10,
        solarize: 22,
        sunset: 16,
        tealOrange: 1,
        technicolor: 12,
        underwater: 15,
        vintage: 8,
        warmFilm: 2
      },
      ui: {
        label: "preset",
        control: "dropdown",
        category: "look"
      }
    },
    alpha: {
      type: "float",
      default: 1,
      uniform: "gradeAlpha",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        label: "alpha",
        control: "slider",
        category: "look",
        enabledBy: "preset"
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
        control: "slider",
        label: "temperature",
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
        control: "slider",
        label: "tint",
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
        control: "slider",
        label: "exposure",
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
        control: "slider",
        label: "contrast",
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
        control: "slider",
        label: "highlights",
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
        control: "slider",
        label: "shadows",
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
        control: "slider",
        label: "whites",
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
        control: "slider",
        label: "blacks",
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
        control: "slider",
        label: "saturation",
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
        control: "slider",
        label: "vibrance",
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
        control: "slider",
        label: "faded film",
        category: "creative"
      }
    },
    shadowTint: {
      type: "vec3",
      default: [0.5, 0.5, 0.5],
      uniform: "gradeShadowTint",
      ui: {
        control: "slider",
        label: "shadow tint",
        category: "creative"
      }
    },
    highlightTint: {
      type: "vec3",
      default: [0.5, 0.5, 0.5],
      uniform: "gradeHighlightTint",
      ui: {
        control: "slider",
        label: "highlight tint",
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
        control: "slider",
        label: "split tone balance",
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
        control: "slider",
        label: "curve shadows",
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
        control: "slider",
        label: "curve midtones",
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
        control: "slider",
        label: "curve highlights",
        category: "curves"
      }
    },

    // === THREE-WAY COLOR WHEELS ===
    wheelShadows: {
      type: "vec3",
      default: [0.5, 0.5, 0.5],
      uniform: "gradeWheelShadows",
      ui: {
        control: "slider",
        label: "shadows wheel",
        category: "wheels"
      }
    },
    wheelMidtones: {
      type: "vec3",
      default: [0.5, 0.5, 0.5],
      uniform: "gradeWheelMidtones",
      ui: {
        control: "slider",
        label: "midtones wheel",
        category: "wheels"
      }
    },
    wheelHighlights: {
      type: "vec3",
      default: [0.5, 0.5, 0.5],
      uniform: "gradeWheelHighlights",
      ui: {
        control: "slider",
        label: "highlights wheel",
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
        control: "slider",
        label: "wheel balance",
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
        control: "slider",
        label: "enable hsl key",
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
        control: "slider",
        label: "hue center",
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
        control: "slider",
        label: "hue range",
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
        control: "slider",
        label: "sat min",
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
        control: "slider",
        label: "sat max",
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
        control: "slider",
        label: "lum min",
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
        control: "slider",
        label: "lum max",
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
        control: "slider",
        label: "feather",
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
        control: "slider",
        label: "hue shift",
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
        control: "slider",
        label: "sat adjust",
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
        control: "slider",
        label: "lum adjust",
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
        control: "slider",
        label: "vignette amount",
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
        control: "slider",
        label: "vignette midpoint",
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
        control: "slider",
        label: "vignette roundness",
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
        control: "slider",
        label: "vignette feather",
        category: "vignette",
        enabledBy: "vignetteAmount"
      }
    },
    vigHiProtect: {
      type: "float",
      default: 0,
      uniform: "gradeVignetteHighlightProtect",
      min: 0,
      max: 1,
      step: 0.01,
      ui: {
        control: "slider",
        label: "highlight protect",
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

  paramAliases: { vignetteHighlightProtect: 'vigHiProtect' },

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
