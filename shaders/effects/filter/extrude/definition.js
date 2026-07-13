import { Effect } from '../../../src/runtime/effect.js'

/**
 * filter/extrude - Extrude: the image is broken into a grid of
 * blocks or pyramids that project toward the viewer, taller/nearer where
 * the source is brighter (or randomly, per depthSource) and displaced
 * outward from the image center (a perspective-from-center illusion, not
 * a real camera). See glsl/extrude.glsl for the full algorithm,
 * occlusion-ordering, and shading derivation - this is a 1:1 port.
 *
 * `type` is the public parameter key, but the compile-time define is named
 * `EXTRUDE_TYPE`: `type` collides with a WGSL reserved keyword (`type`
 * aliases) and is generically overloaded enough elsewhere to risk an
 * identifier collision, so the shader binding is renamed
 * (checkEffectStructure guards this class of bug).
 */
export default new Effect({
  name: "Extrude",
  namespace: "filter",
  func: "extrude",
  tags: ["distort", "geometric", "artist"],

  description: "Break the image into 3D blocks or pyramids projecting toward the viewer (Extrude)",
  globals: {
    type: {
      type: "int",
      default: 0,
      define: "EXTRUDE_TYPE",
      choices: {
        blocks: 0,
        pyramids: 1
      },
      ui: {
        label: "type",
        control: "dropdown"
      }
    },
    size: {
      type: "float",
      default: 24,
      uniform: "size",
      min: 4,
      max: 128,
      ui: {
        label: "size",
        control: "slider"
      }
    },
    depth: {
      type: "float",
      default: 30,
      uniform: "depth",
      min: 0,
      max: 100,
      zero: 0,
      ui: {
        label: "depth",
        control: "slider"
      }
    },
    depthSource: {
      type: "int",
      default: 0,
      define: "DEPTH_SOURCE",
      choices: {
        luminance: 0,
        random: 1
      },
      ui: {
        label: "depth source",
        control: "dropdown"
      }
    },
    solidFront: {
      type: "boolean",
      default: true,
      uniform: "solidFront",
      ui: {
        label: "solid front faces",
        control: "checkbox"
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "extrude",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
