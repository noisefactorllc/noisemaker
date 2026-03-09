import { Effect } from '../../../src/runtime/effect.js'

/**
 * Fibers - Chaotic worm-trail fiber overlay
 *
 * Agent-based effect: chaotic agents with high kink and low density
 * scatter thin trails that are blended over the input as fiber textures.
 *
 * Pipeline:
 *   1. updateAgents (compute): move agents with chaotic steering
 *   2. fadeTrails: decay trail accumulation texture
 *   3. drawAgents (points): scatter agent positions onto trail texture
 *   4. fibers (render): blend trails over input with brightness noise
 */
export default new Effect({
  name: "Fibers",
  namespace: "filter",
  func: "fibers",
  tags: ["noise"],

  description: "Chaotic fiber texture overlay",

  textures: {
    _agentState: {
      width: 128,
      height: 128,
      format: "rgba16f"
    },
    _trailState: {
      width: "100%",
      height: "100%",
      format: "rgba16f"
    }
  },

  globals: {
    density: {
      type: "float",
      default: 0.1,
      uniform: "density",
      min: 0,
      max: 1,
      step: 0.01,
      ui: { label: "density", control: "slider" }
    },
    speed: {
      type: "float",
      default: 1.0,
      uniform: "speed",
      min: 0,
      max: 5,
      step: 0.1,
      ui: { label: "speed", control: "slider" }
    },
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      step: 1,
      ui: { label: "seed", control: "slider" }
    },
    alpha: {
      type: "float",
      default: 0.5,
      uniform: "alpha",
      min: 0,
      max: 1,
      step: 0.01,
      ui: { label: "alpha", control: "slider" }
    }
  },

  passes: [
    {
      name: "updateAgents",
      program: "updateAgents",
      inputs: {
        agentTex: "_agentState",
        inputTex: "inputTex"
      },
      uniforms: {
        density: "density",
        speed: "speed",
        seed: "seed"
      },
      outputs: {
        fragColor: "_agentState"
      }
    },
    {
      name: "fadeTrails",
      program: "fadeTrails",
      inputs: {
        trailTex: "_trailState"
      },
      outputs: {
        fragColor: "_trailState"
      }
    },
    {
      name: "drawAgents",
      program: "drawAgents",
      drawMode: "points",
      blend: true,
      count: 16384, // 128x128 agents
      inputs: {
        agentTex: "_agentState"
      },
      outputs: {
        fragColor: "_trailState"
      }
    },
    {
      name: "render",
      program: "fibers",
      inputs: {
        inputTex: "inputTex",
        trailTex: "_trailState"
      },
      uniforms: {
        speed: "speed",
        seed: "seed",
        alpha: "alpha"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
