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
  uniformLayout = {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    shapeA: { slot: 1, components: 'x' },
    shapeB: { slot: 1, components: 'y' },
    shapeAScale: { slot: 1, components: 'z' },
    shapeBScale: { slot: 1, components: 'w' },
    shapeAThickness: { slot: 2, components: 'x' },
    shapeBThickness: { slot: 2, components: 'y' },
    blendMode: { slot: 2, components: 'z' },
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
    backgroundOpacity: { slot: 5, components: 'y' },
    colorMode: { slot: 5, components: 'z' },
    source: { slot: 5, components: 'w' },
    backgroundColor: { slot: 6, components: 'xyz' },
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
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    shapeA: {
      type: "int",
      default: 30,
      uniform: "shapeA",
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
      uniform: "shapeB",
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
        label: "a scale",
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
        label: "b scale",
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
        label: "a thickness",
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
        label: "b thickness",
        control: "slider"
      }
    },
    blendMode: {
      type: "int",
      default: 10,
      uniform: "blendMode",
      choices: {
        intersect: null,
        max: 40,
        smoothMax: 20,
        union: null,
        min: 30,
        smoothMin: 10,
        subtract: null,
        aB: 51,
        bA: 50,
        smoothAB: 26,
        smoothBA: 25
      },
      ui: {
        label: "blend",
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
        control: "slider"
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
        category: "transform"
      }
    },
    flip: {
      type: "float",
      default: 0,
      uniform: "flip",
      min: -180,
      max: 180,
      ui: {
        label: "flip",
        control: "slider",
        category: "orientation"
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
        category: "animation"
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
        category: "animation"
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
    backgroundColor: {
      type: "color",
      default: [1.0, 1.0, 1.0],
      uniform: "backgroundColor",
      ui: {
        label: "bkg color",
        control: "color",
        category: "color"
      }
    },
    backgroundOpacity: {
      type: "float",
      default: 0,
      uniform: "backgroundOpacity",
      min: 0,
      max: 100,
      ui: {
        label: "bkg opacity",
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
    source: {
      type: "int",
      default: 0,
      uniform: "source",
      choices: {
        none: 0,
        input: 3
      },
      ui: {
        label: "tex source",
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
        category: "palette"
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
        label: "cycle palette",
        control: "dropdown",
        category: "palette"
      }
    },
    rotatePalette: {
      type: "float",
      default: 0,
      uniform: "rotatePalette",
      min: 0,
      max: 100,
      ui: {
        label: "rotate palette",
        control: "slider",
        category: "palette"
      }
    },
    repeatPalette: {
      type: "int",
      default: 1,
      uniform: "repeatPalette",
      min: 1,
      max: 5,
      ui: {
        label: "repeat palette",
        control: "slider",
        category: "palette"
      }
    },
    wrap: {
      type: "int",
      default: 1,
      uniform: "wrap",
      choices: {
        clamp: 2,
        mirror: 0,
        repeat: 1
      },
      ui: {
        label: "wrap",
        control: "dropdown"
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
        category: "repetition"
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
        category: "animation"
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
        category: "repetition"
      }
    }
  }

  passes = [
    {
      name: "render",
      program: "shapes3d",
      inputs: {
              inputTex: "inputTex"
            }
,
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
}
