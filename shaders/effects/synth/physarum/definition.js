import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Physarum",
  func: "physarum",
  tags: ["sim"],

  description: "Physarum slime mold simulation",
  textures: {
    globalPhysarumState: { width: 1000, height: 1000, format: "rgba32f" },
    globalPhysarumColor: { width: 1000, height: 1000, format: "rgba16f" },
    globalPhysarumTrail: { width: "100%", height: "100%", format: "rgba16f" }
  },
  globals: {
    tex: {
      type: "surface",
      default: "none",
      colorModeUniform: "colorMode",
      ui: { label: "texture" }
    },
    colorMode: {
      type: "int",
      default: 1,
      uniform: "colorMode",
      ui: { control: false }
    },
    deltaTime: {
      type: "float",
      default: 0.016,
      uniform: "deltaTime",
      ui: {
        control: false
      }
    },
    moveSpeed: {
      type: "float",
      default: 1.7800000000000011,
      uniform: "moveSpeed",
      min: 0.05,
      max: 3,
      ui: {
        label: "move speed",
        type: "float",
        step: 0.01,
        category: "agents"
      }
    },
    turnSpeed: {
      type: "float",
      default: 1,
      uniform: "turnSpeed",
      min: 0,
      max: 3.14159,
      ui: {
        label: "turn speed",
        type: "float",
        step: 0.01,
        category: "agents"
      }
    },
    sensorAngle: {
      type: "float",
      default: 1.2599999999999971,
      uniform: "sensorAngle",
      min: 0.1,
      max: 1.5,
      ui: {
        label: "sensor angle",
        type: "float",
        step: 0.01,
        category: "agents"
      }
    },
    sensorDistance: {
      type: "float",
      default: 30.700000000000003,
      uniform: "sensorDistance",
      min: 2,
      max: 32,
      ui: {
        label: "sensor distance",
        type: "float",
        step: 0.1,
        category: "agents"
      }
    },
    decay: {
      type: "float",
      default: 0.1,
      uniform: "decay",
      min: 0,
      max: 0.1,
      ui: {
        label: "decay",
        type: "float",
        step: 0.001,
        category: "chemistry"
      }
    },
    intensity: {
      type: "float",
      default: 75,
      uniform: "intensity",
      min: 0,
      max: 100,
      step: 1,
      ui: {
        label: "trail intensity",
        type: "float",
        category: "blending"
      }
    },
    depositAmount: {
      type: "float",
      default: 0.05,
      uniform: "depositAmount",
      min: 0,
      max: 0.05,
      ui: {
        label: "deposit",
        type: "float",
        step: 0.001,
        category: "chemistry"
      }
    },
    density: {
      type: "float",
      default: 100,
      uniform: "density",
      min: 0,
      max: 100,
      step: 1,
      ui: {
        label: "density",
        type: "float",
        category: "agents"
      }
    },
    attrition: {
      type: "float",
      default: 1,
      uniform: "attrition",
      min: 0,
      max: 10,
      step: 0.1,
      ui: {
        label: "attrition",
        type: "float",
        category: "agents"
      }
    },
    inputWeight: {
      type: "float",
      default: 0,
      uniform: "inputWeight",
      min: 0,
      max: 100,
      ui: {
        label: "input weight",
        type: "float",
        category: "blending"
      }
    },
    inputIntensity: {
      type: "float",
      default: 50,
      uniform: "inputIntensity",
      min: 0,
      max: 100,
      step: 1,
      ui: {
        label: "input intensity",
        type: "float",
        category: "blending"
      }
    },
    spawnPattern: {
      type: "int",
      default: 1,
      uniform: "spawnPattern",
      choices: {
        "random": 0,
        "clusters": 1,
        "ring": 2,
        "spiral": 3
      },
      ui: {
        label: "pattern",
        type: "option",
        category: "state"
      }
    },
    resetState: {
      type: "boolean",
      default: false,
      uniform: "resetState",
      ui: {
        control: "button",
        buttonLabel: "reset",
        label: "state"
      }
    }
  },
  passes: [
    {
      name: "initFromPrev",
      program: "initFromPrev",
      inputs: {
        prevTrailTex: "globalPhysarumTrail"
      },
      uniforms: {
        intensity: "intensity"
      },
      outputs: {
        fragColor: "globalPhysarumTrail"
      }
    },
    {
      name: "agent",
      program: "agent",
      inputs: {
        stateTex: "globalPhysarumState",
        colorTex: "globalPhysarumColor",
        bufTex: "globalPhysarumTrail",
        inputTex: "tex"
      },
      outputs: {
        fragColor: "globalPhysarumState",
        outColor: "globalPhysarumColor"
      },
      uniforms: {
        spawnPattern: "spawnPattern",
        colorMode: "colorMode"
      }
    },
    {
      name: "deposit",
      program: "deposit",
      drawMode: "points",
      count: 1000000,
      blend: true,
      inputs: {
        stateTex: "globalPhysarumState",
        colorTex: "globalPhysarumColor",
        inputTex: "tex"
      },
      uniforms: {
        density: "density"
      },
      outputs: {
        fragColor: "globalPhysarumTrail"
      }
    },
    {
      name: "render",
      program: "physarum",
      inputs: {
        bufTex: "globalPhysarumTrail",
        inputTex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
