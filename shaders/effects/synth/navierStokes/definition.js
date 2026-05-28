import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Navier-Stokes",
  func: "navierStokes",
  tags: ["sim"],

  description: "Stable-fluids Navier-Stokes solver",

  defaultProgram: `search synth

noise(
  type: hermite,
  ridges: true,
  speed: 30,
  colorMode: mono
)
  .write(o0)

navierStokes(
  tex: read(o0),
  dyeDecay: 98,
  inputForce: 0.5,
  inputIntensity: 10
)
  .write(o1)

render(o1)`,

  uniformLayouts: {
    nsSplat: {
      resolution: { slot: 0, components: 'xy' },
      seed: { slot: 0, components: 'w' },
      speed: { slot: 1, components: 'x' },
      inputForce: { slot: 1, components: 'y' },
      inputDye: { slot: 1, components: 'z' },
      resetState: { slot: 1, components: 'w' }
    },
    nsAdvect: {
      resolution: { slot: 0, components: 'xy' },
      speed: { slot: 0, components: 'w' },
      dyeDecay: { slot: 1, components: 'x' },
      velocityDecay: { slot: 1, components: 'y' }
    },
    nsSmooth: {
      resolution: { slot: 0, components: 'xy' },
      smoothing: { slot: 0, components: 'z' }
    },
    nsDivergence: {
      resolution: { slot: 0, components: 'xy' }
    },
    nsPressure: {
      resolution: { slot: 0, components: 'xy' }
    },
    nsGradient: {
      resolution: { slot: 0, components: 'xy' }
    },
    ns: {
      resolution: { slot: 0, components: 'xy' },
      inputIntensity: { slot: 1, components: 'x' }
    }
  },

  textures: {
    global_ns_velocity: {
      width: { screenDivide: 'zoom', default: 4 },
      height: { screenDivide: 'zoom', default: 4 },
      format: "rgba16f"
    },
    global_ns_pressure: {
      width: { screenDivide: 'zoom', default: 4 },
      height: { screenDivide: 'zoom', default: 4 },
      format: "rgba16f"
    },
    global_ns_smoothed: {
      // Intermediate texture: the smoothing kernel runs during upsample from the zoom-divided
      // compute canvas into this intermediate. Lives in its own texture so the kernel never
      // pollutes the compute canvas and never runs inside the final outputTex draw pass.
      width: "100%",
      height: "100%"
    }
  },

  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: {
        label: "texture",
        category: "input"
      }
    },
    zoom: {
      type: "int",
      default: 1,
      choices: {
        x1: 1,
        x2: 2,
        x4: 4,
        x8: 8,
        x16: 16,
        x32: 32
      },
      randChoices: [2, 4, 8],
      ui: {
        label: "zoom",
        control: "dropdown"
      }
    },
    iterations: {
      type: "int",
      default: 30,
      uniform: "iterations",
      min: 4,
      max: 40,
      ui: {
        label: "pressure iter",
        control: "slider",
        category: "solver"
      }
    },
    smoothing: {
      type: "int",
      default: 1,
      uniform: "smoothing",
      choices: {
        constant: 0,
        linear: 1,
        hermite: 2,
        catmullRom3x3: 3,
        catmullRom4x4: 4,
        bSpline3x3: 5,
        bSpline4x4: 6
      },
      ui: {
        label: "smoothing",
        control: "dropdown"
      }
    },
    speed: {
      type: "float",
      default: 100,
      uniform: "speed",
      min: 5,
      max: 145,
      ui: {
        label: "speed",
        control: "slider"
      }
    },
    dyeDecay: {
      type: "float",
      default: 98,
      uniform: "dyeDecay",
      min: 80,
      max: 100,
      ui: {
        label: "dye decay",
        control: "slider",
        category: "decay"
      }
    },
    velocityDecay: {
      type: "float",
      default: 99,
      uniform: "velocityDecay",
      min: 80,
      max: 100,
      ui: {
        label: "vel decay",
        control: "slider",
        category: "decay"
      }
    },
    inputForce: {
      type: "float",
      default: 0.5,
      uniform: "inputForce",
      min: 0,
      max: 1,
      step: 0.01,
      randChance: 0,
      ui: {
        label: "input force",
        control: "slider",
        category: "input",
        enabledBy: { param: "tex", neq: "none" }
      }
    },
    inputDye: {
      type: "float",
      default: 0.9,
      uniform: "inputDye",
      min: 0,
      max: 1,
      step: 0.01,
      randChance: 0,
      ui: {
        label: "input dye",
        control: "slider",
        category: "input",
        enabledBy: { param: "tex", neq: "none" }
      }
    },
    inputIntensity: {
      type: "float",
      default: 10,
      uniform: "inputIntensity",
      min: 0,
      max: 100,
      randChance: 0,
      ui: {
        label: "input mix",
        control: "slider",
        category: "input",
        enabledBy: { param: "tex", neq: "none" }
      }
    },
    resetState: {
      type: "boolean",
      default: false,
      uniform: "resetState",
      ui: {
        control: "button",
        buttonLabel: "stir",
        label: "state"
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
        control: false
      }
    }
  },

  passes: [
    {
      name: "splat",
      program: "nsSplat",
      inputs: {
        bufTex: "global_ns_velocity",
        inputTex: "tex"
      },
      outputs: {
        fragColor: "global_ns_velocity"
      }
    },
    {
      name: "advect",
      program: "nsAdvect",
      inputs: {
        bufTex: "global_ns_velocity"
      },
      outputs: {
        fragColor: "global_ns_velocity"
      }
    },
    {
      name: "divergence",
      program: "nsDivergence",
      inputs: {
        velTex: "global_ns_velocity"
      },
      outputs: {
        fragColor: "global_ns_pressure"
      }
    },
    {
      name: "pressure",
      program: "nsPressure",
      repeat: "iterations",
      inputs: {
        bufTex: "global_ns_pressure"
      },
      outputs: {
        fragColor: "global_ns_pressure"
      }
    },
    {
      name: "gradient",
      program: "nsGradient",
      inputs: {
        velTex: "global_ns_velocity",
        pressureTex: "global_ns_pressure"
      },
      outputs: {
        fragColor: "global_ns_velocity"
      }
    },
    {
      name: "smooth",
      program: "nsSmooth",
      inputs: {
        canvasTex: "global_ns_velocity"
      },
      outputs: {
        fragColor: "global_ns_smoothed"
      }
    },
    {
      name: "render",
      program: "ns",
      inputs: {
        fbTex: "global_ns_smoothed",
        inputTex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
