import { Effect } from '../../../src/runtime/effect.js'

/**
 * Fibers
 * /shaders/effects/fibers/fibers.wgsl
 */
export default new Effect({
  name: "Fibers",
  namespace: "classicNoisemaker",
  func: "fibers",
  tags: ["noise"],

  description: "Fiber texture generator",
  globals: {
    speed: {
      type: "float",
      default: 1.0,
      uniform: "speed",
      min: 0.0,
      max: 5.0,
      step: 0.1,
      ui: { label: "Speed", control: "slider" }
    },
    seed: {
      type: "float",
      default: 0.0,
      uniform: "seed",
      min: 0.0,
      max: 100.0,
      step: 1.0,
      ui: { label: "Seed", control: "slider" }
    },
    maskScale: {
      type: "float",
      default: 1.0,
      uniform: "maskScale",
      min: 0.1,
      max: 5.0,
      step: 0.1,
      ui: { label: "Mask Scale", control: "slider" }
    },
    // Worm params
    density: {
        type: "float",
        default: 5,
        uniform: "density",
        min: 1,
        max: 100,
        step: 1,
        ui: { label: "Density", control: "slider" }
    },
    stride: {
        type: "float",
        default: 1,
        uniform: "stride",
        min: 0.1,
        max: 10,
        step: 0.1,
        ui: { label: "Stride", control: "slider" }
    },
    wormLifetime: {
        type: "float",
        default: 30,
        uniform: "wormLifetime",
        min: 0,
        max: 60,
        step: 1,
        ui: { label: "Lifetime", control: "slider" }
    }
  },
  passes: [
    {
      name: "updateAgents",
      program: "updateAgents",
      inputs: {
        agentTex: "globalAgentState",
        inputTex: "inputTex"
      },
      uniforms: {
        density: "density",
        stride: "stride",
        wormLifetime: "wormLifetime"
      },
      outputs: {
        outAgents: "globalAgentState"
      }
    },
    {
      name: "fadeTrails",
      program: "fadeTrails",
      inputs: {
        trailTex: "globalTrailState",
        inputTex: "inputTex"
      },
      outputs: {
        outTrails: "globalTrailState"
      }
    },
    {
      name: "drawAgents",
      program: "drawAgents",
      drawMode: "points",
      blend: true,
      count: 262144, // 512x512 agents
      inputs: {
        agentTex: "globalAgentState"
      },
      outputs: {
        outTrails: "globalTrailState"
      }
    },
    {
      name: "render",
      program: "fibers",
      inputs: {
        inputTex: "inputTex",
        wormTexture: "globalTrailState"
      },
      uniforms: {
        speed: "speed",
        seed: "seed",
        maskScale: "maskScale"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
