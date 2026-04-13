import { Effect } from '../../../src/runtime/effect.js'

/**
 * synth3d/shape3d - 3D polyhedral shape volume generator
 *
 * Generates a 3D shape volume stored as a 2D atlas texture.
 * Can be used standalone or chained after another 3D effect.
 *
 * Usage:
 *   shape3d(volumeSize: x64).render3d().write(o0)
 *   noise3d().shape3d().render3d().write(o0)  // uses noise3d's volume size
 *
 * If inputTex3d is provided from upstream, its dimensions take precedence
 * over volumeSize. Otherwise, allocates fresh volumeCache and geoBuffer.
 */
export default new Effect({
  name: "Shape3D",
  namespace: "synth3d",
  func: "shape3d",
  tags: ["3d", "geometric"],

  description: "3D polyhedral shape generator",
  textures: {
    volumeCache: {
      width: { param: 'volumeSize', default: 64 },
      height: { param: 'volumeSize', power: 2, default: 4096 },
      format: "rgba16f"
    },
    geoBuffer: {
      width: { param: 'volumeSize', default: 64 },
      height: { param: 'volumeSize', power: 2, default: 4096 },
      format: "rgba16f"
    }
  },
  globals: {
    "volumeSize": {
      "type": "int",
      "default": 64,
      "uniform": "volumeSize",
      "choices": {
        "x16": 16,
        "x32": 32,
        "x64": 64,
        "x128": 128
      },
      "randChoices": [16, 32, 64],
      "ui": {
        "label": "volume size",
        "control": "dropdown"
      }
    },
    colorMode: {
      type: "int",
      default: 0,
      uniform: "colorMode",
      choices: {
        "mono": 0,
        "rgb": 1
      },
      ui: {
        label: "color mode",
        control: "dropdown"
      }
    },
    loopAOffset: {
      type: "int",
      default: 40,
      uniform: "loopAOffset",
      choices: {
        "Platonic Solids:": null,
        tetrahedron: 10,
        cube: 20,
        octahedron: 30,
        dodecahedron: 40,
        icosahedron: 50,
        "Other Primitives:": null,
        sphere: 100,
        torus: 110,
        cylinder: 120,
        cone: 130,
        capsule: 140
      },
      ui: {
        label: "loop a",
        control: "dropdown"
      }
    },
    loopBOffset: {
      type: "int",
      default: 30,
      uniform: "loopBOffset",
      choices: {
        "Platonic Solids:": null,
        tetrahedron: 10,
        cube: 20,
        octahedron: 30,
        dodecahedron: 40,
        icosahedron: 50,
        "Other Primitives:": null,
        sphere: 100,
        torus: 110,
        cylinder: 120,
        cone: 130,
        capsule: 140
      },
      ui: {
        label: "loop b",
        control: "dropdown"
      }
    },
    loopAScale: {
      type: "float",
      default: 1,
      uniform: "loopAScale",
      min: 1,
      max: 100,
      ui: {
        label: "a scale",
        control: "slider"
      }
    },
    loopBScale: {
      type: "float",
      default: 1,
      uniform: "loopBScale",
      min: 1,
      max: 100,
      ui: {
        label: "b scale",
        control: "slider"
      }
    },
    speedA: {
      type: "int",
      default: 1,
      uniform: "speedA",
      min: -5,
      max: 5,
      zero: 0,
      ui: {
        label: "speed a",
        control: "slider"
      }
    },
    speedB: {
      type: "int",
      default: 1,
      uniform: "speedB",
      min: -5,
      max: 5,
      zero: 0,
      ui: {
        label: "speed b",
        control: "slider"
      }
    }
  },
  defaultProgram: "search synth3d, filter3d, render\n\nshape3d(speedA: -2, speedB: 2)\n.render3d(threshold: 0.75)\n.write(o0)",
  passes: [
    {
      name: "precompute",
      program: "precompute",
      drawBuffers: 2,
      viewport: {
        width: { param: 'volumeSize', default: 64 },
        height: { param: 'volumeSize', power: 2, default: 4096 }
      },
      inputs: {},
      outputs: {
        color: "volumeCache",
        geoOut: "geoBuffer"
      }
    }
  ],
  outputTex3d: "volumeCache",
  outputGeo: "geoBuffer"
})
