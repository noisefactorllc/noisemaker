import { Effect } from '../../../src/runtime/effect.js'
import { stdEnums } from '../../../src/lang/std_enums.js'

const paletteChoices = {}
for (const [key, val] of Object.entries(stdEnums.palette)) {
  paletteChoices[key] = val.value
}

export default class Shapes3D extends Effect {
  name = "Shapes3d"
  namespace = "classicNoisedeck"
  func = "shapes3d"
  tags = ["geometric"]

  description = "3D geometric shapes"

  // WGSL uniform packing layout - contiguous vec3/vec4 layout
  // Slots marked "unused" used to hold ints that have since been promoted to
  // compile-time defines (see globals.{shapeA,shapeB,blendMode}.define).
  uniformLayout = {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    // slot 1.x was shapeA — now compile-time SHAPE_A
    // slot 1.y was shapeB — now compile-time SHAPE_B
    shapeAScale: { slot: 1, components: 'z' },
    shapeBScale: { slot: 1, components: 'w' },
    shapeAThickness: { slot: 2, components: 'x' },
    shapeBThickness: { slot: 2, components: 'y' },
    // slot 2.z was blendMode — now compile-time BLEND_MODE
    smoothness: { slot: 2, components: 'w' },
    spin: { slot: 3, components: 'x' },
    flip: { slot: 3, components: 'y' },
    spinSpeed: { slot: 3, components: 'z' },
    flipSpeed: { slot: 3, components: 'w' },
    repetition: { slot: 4, components: 'x' },
    animation: { slot: 4, components: 'y' },
    flythroughSpeed: { slot: 4, components: 'z' },
    spacing: { slot: 4, components: 'w' },
    cameraDist: { slot: 5, components: 'x' },
    bgAlpha: { slot: 5, components: 'y' },
    colorMode: { slot: 5, components: 'z' },
    weight: { slot: 5, components: 'w' },
    bgColor: { slot: 6, components: 'xyz' },
    paletteMode: { slot: 6, components: 'w' },
    paletteOffset: { slot: 7, components: 'xyz' },
    cyclePalette: { slot: 7, components: 'w' },
    paletteAmp: { slot: 8, components: 'xyz' },
    rotatePalette: { slot: 8, components: 'w' },
    paletteFreq: { slot: 9, components: 'xyz' },
    repeatPalette: { slot: 9, components: 'w' },
    palettePhase: { slot: 10, components: 'xyz' }
  }

  globals = {
    shapeA: {
      type: "int",
      default: 30,
      // Compile-time define. shapeA is consumed by shape3dA() inside getDist(),
      // which the raymarcher inlines per-step (~100+ inlines per pixel). The
      // 9-way runtime dispatch was the dominant compile cost.
      define: "SHAPE_A",
      choices: {
        capsuleHoriz: 70,
        capsuleVert: 60,
        cube: 10,
        cylinderHoriz: 50,
        cylinderVert: 40,
        octahedron: 80,
        sphere: 20,
        torusHoriz: 31,
        torusVert: 30
      },
      ui: {
        label: "shape a",
        control: "dropdown"
      }
    },
    shapeB: {
      type: "int",
      default: 10,
      // Compile-time define. Same rationale as SHAPE_A.
      define: "SHAPE_B",
      choices: {
        capsuleHoriz: 70,
        capsuleVert: 60,
        cube: 10,
        cylinderHoriz: 50,
        cylinderVert: 40,
        octahedron: 80,
        sphere: 20,
        torusHoriz: 31,
        torusVert: 30
      },
      ui: {
        label: "shape b",
        control: "dropdown"
      }
    },
    shapeAScale: {
      type: "float",
      default: 64,
      uniform: "shapeAScale",
      min: 1,
      max: 100,
      ui: {
        label: "scale a",
        control: "slider"
      }
    },
    shapeBScale: {
      type: "float",
      default: 27,
      uniform: "shapeBScale",
      min: 1,
      max: 100,
      ui: {
        label: "scale b",
        control: "slider"
      }
    },
    shapeAThickness: {
      type: "float",
      default: 5,
      uniform: "shapeAThickness",
      min: 1,
      max: 50,
      ui: {
        label: "thickness a",
        control: "slider"
      }
    },
    shapeBThickness: {
      type: "float",
      default: 5,
      uniform: "shapeBThickness",
      min: 1,
      max: 50,
      ui: {
        label: "thickness b",
        control: "slider"
      }
    },
    blendMode: {
      type: "int",
      default: 10,
      // Compile-time define. 8-way blend dispatch in blend(), called per
      // raymarch step.
      define: "BLEND_MODE",
      choices: {
        intersect: 40,
        union: 30,
        smoothIntersect: 20,
        smoothUnion: 10,
        aMinusB: 51,
        bMinusA: 50,
        smoothAMinusB: 26,
        smoothBMinusA: 25
      },
      ui: {
        label: "blend mode",
        control: "dropdown"
      }
    },
    smoothness: {
      type: "float",
      default: 1,
      uniform: "smoothness",
      min: 1,
      max: 100,
      ui: {
        label: "smoothness",
        control: "slider",
        enabledBy: {
          or: [
            { param: "blendMode", in: [10, 20, 25, 26] },
          ]
        }
      }
    },
    repetition: {
      type: "boolean",
      default: false,
      uniform: "repetition",
      ui: {
        label: "repeat",
        control: "checkbox",
        category: "repetition"
      }
    },
    animation: {
      type: "int",
      default: 1,
      uniform: "animation",
      choices: {
        rotateScene: 0,
        rotateShape: 1
      },
      ui: {
        label: "rotation",
        control: "dropdown",
        category: "repetition",
        enabledBy: { param: "repetition", eq: true }
      }
    },
    spacing: {
      type: "int",
      default: 10,
      uniform: "spacing",
      min: 5,
      max: 20,
      ui: {
        label: "spacing",
        control: "slider",
        category: "repetition",
        enabledBy: { param: "repetition", eq: true }
      }
    },
    flythroughSpeed: {
      type: "float",
      default: 0,
      uniform: "flythroughSpeed",
      min: -10,
      max: 10,
      ui: {
        label: "flythrough",
        control: "slider",
        category: "repetition",
        enabledBy: {
          and: [
            { param: "repetition", eq: true },
            { param: "animation", eq: 1 }
          ]
        }
      }
    },
    spin: {
      type: "float",
      default: 0,
      uniform: "spin",
      min: -180,
      max: 180,
      ui: {
        label: "spin",
        control: "slider",
        category: "rotation"
      }
    },
    spinSpeed: {
      type: "float",
      default: 2,
      uniform: "spinSpeed",
      min: -10,
      max: 10,
      ui: {
        label: "spin speed",
        control: "slider",
        category: "rotation"
      }
    },
    flip: {
      type: "int",
      default: 0,
      uniform: "flip",
      min: -180,
      max: 180,
      ui: {
        label: "flip",
        control: "slider",
        category: "rotation"
      }
    },
    flipSpeed: {
      type: "float",
      default: 2,
      uniform: "flipSpeed",
      min: -10,
      max: 10,
      ui: {
        label: "flip speed",
        control: "slider",
        category: "rotation"
      }
    },
    cameraDist: {
      type: "float",
      default: 8,
      uniform: "cameraDist",
      min: 5,
      max: 20,
      ui: {
        label: "cam distance",
        control: "slider"
      }
    },
    bgColor: {
      type: "color",
      default: [1.0, 1.0, 1.0],
      uniform: "bgColor",
      ui: {
        label: "bg color",
        control: "color",
        category: "color"
      }
    },
    bgAlpha: {
      type: "float",
      default: 0,
      uniform: "bgAlpha",
      min: 0,
      max: 100,
      ui: {
        label: "bg opacity",
        control: "slider",
        category: "color"
      }
    },
    tex: {
      type: "surface",
      default: "none",
      ui: {
        label: "texture",
        category: "color",
      }
    },
    weight: {
      type: "float",
      default: 0,
      uniform: "weight",
      min: 0,
      max: 100,
      randChance: 0,
      ui: {
        label: "input weight",
        control: "slider",
        category: "color"
      }
    },
    colorMode: {
      type: "int",
      default: 10,
      uniform: "colorMode",
      choices: {
        depth: 0,
        diffuse: 1,
        palette: 10
      },
      ui: {
        label: "color mode",
        control: "dropdown",
        category: "color"
      }
    },
    palette: {
      type: "palette",
      default: 40,
      uniform: "palette",
      choices: paletteChoices,
      ui: {
        label: "palette",
        control: "dropdown",
        category: "palette",
        enabledBy: { param: "colorMode", eq: 10 }
      }
    },
    cyclePalette: {
      type: "int",
      default: 1,
      uniform: "cyclePalette",
      choices: {
        off: 0,
        forward: 1,
        backward: -1
      },
      ui: {
        label: "rotation",
        control: "dropdown",
        category: "palette",
        enabledBy: { param: "colorMode", eq: 10 }
      }
    },
    rotatePalette: {
      type: "float",
      default: 0,
      uniform: "rotatePalette",
      min: 0,
      max: 100,
      ui: {
        label: "offset",
        control: "slider",
        category: "palette",
        enabledBy: { param: "colorMode", eq: 10 }
      }
    },
    repeatPalette: {
      type: "int",
      default: 1,
      uniform: "repeatPalette",
      min: 1,
      max: 10,
      randMax: 5,
      ui: {
        label: "repeat",
        control: "slider",
        category: "palette",
        enabledBy: { param: "colorMode", eq: 10 }
      }
    },
    paletteMode: {
      type: "int",
      default: 0,
      uniform: "paletteMode",
      ui: {
        control: false
      }
    },
    paletteOffset: {
      type: "vec3",
      default: [0.83, 0.6, 0.63],
      uniform: "paletteOffset",
      ui: {
        label: "palette offset",
        control: "slider",
        hidden: true
      }
    },
    paletteAmp: {
      type: "vec3",
      default: [0.5, 0.5, 0.5],
      uniform: "paletteAmp",
      ui: {
        label: "palette amplitude",
        control: "slider",
        hidden: true
      }
    },
    paletteFreq: {
      type: "vec3",
      default: [1, 1, 1],
      uniform: "paletteFreq",
      ui: {
        label: "palette frequency",
        control: "slider",
        hidden: true
      }
    },
    palettePhase: {
      type: "vec3",
      default: [0.3, 0.1, 0],
      uniform: "palettePhase",
      ui: {
        label: "palette phase",
        control: "slider",
        hidden: true
      }
    }
  }

  paramAliases = { backgroundColor: 'bgColor', backgroundOpacity: 'bgAlpha' }


  passes = [
    {
      name: "render",
      program: "shapes3d",
      inputs: {
        inputTex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
}
