import { Effect } from '../../../src/runtime/effect.js'

/**
 * Media - Video/camera input with transform controls
 *
 * Synth effect that displays camera or uploaded media with positioning,
 * tiling, flip/mirror, and transform controls. Supports motion blur via
 * feedback texture.
 */
export default class Media extends Effect {
  name = "Media"
  namespace = "synth"
  func = "media"
  description = "Video/camera input with transforms"

  // Mark this as requiring external texture updates
  externalTexture = "imageTex"

  // WGSL uniform packing layout - maps uniform names to vec4 slots/components
  uniformLayout = {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    position: { slot: 1, components: 'x' },
    rotation: { slot: 1, components: 'y' },
    scaleAmt: { slot: 1, components: 'z' },
    offsetX: { slot: 1, components: 'w' },
    offsetY: { slot: 2, components: 'x' },
    tiling: { slot: 2, components: 'y' },
    flip: { slot: 2, components: 'z' },
    backgroundOpacity: { slot: 2, components: 'w' },
    backgroundColor: { slot: 3, components: 'xyz' },
    motionBlur: { slot: 3, components: 'w' },
    imageSize: { slot: 4, components: 'xy' }
  }

  globals = {
    position: {
      type: "int",
      default: 4,
      uniform: "position",
      choices: {
        "top left": 0,
        "top center": 1,
        "top right": 2,
        "mid left": 3,
        "mid center": 4,
        "mid right": 5,
        "bottom left": 6,
        "bottom center": 7,
        "bottom right": 8
      },
      ui: {
        label: "position",
        control: "dropdown",
        category: "orientation"
      }
    },
    tiling: {
      type: "int",
      default: 0,
      uniform: "tiling",
      choices: {
        "none": 0,
        "horiz and vert": 1,
        "horiz only": 2,
        "vert only": 3
      },
      ui: {
        label: "tiling",
        control: "dropdown",
        category: "orientation"
      }
    },
    flip: {
      type: "int",
      default: 0,
      uniform: "flip",
      choices: {
        "none": 0,
        "all": 1,
        "horizontal": 2,
        "vertical": 3,
        "mirror l→r": 11,
        "mirror l←r": 12,
        "mirror u→d": 13,
        "mirror u←d": 14,
        "mirror l→r u→d": 15,
        "mirror l→r u←d": 16,
        "mirror l←r u→d": 17,
        "mirror l←r u←d": 18
      },
      ui: {
        label: "flip/mirror",
        control: "dropdown",
        category: "orientation"
      }
    },
    scaleAmt: {
      type: "float",
      default: 100,
      min: 25,
      max: 400,
      uniform: "scaleAmt",
      ui: {
        label: "scale %",
        control: "slider",
        category: "transform"
      }
    },
    rotation: {
      type: "float",
      default: 0,
      min: -180,
      max: 180,
      uniform: "rotation",
      ui: {
        label: "rotate",
        control: "slider",
        category: "transform"
      }
    },
    offsetX: {
      type: "float",
      default: 0,
      min: -100,
      max: 100,
      uniform: "offsetX",
      ui: {
        label: "offset x",
        control: "slider",
        category: "transform"
      }
    },
    offsetY: {
      type: "float",
      default: 0,
      min: -100,
      max: 100,
      uniform: "offsetY",
      ui: {
        label: "offset y",
        control: "slider",
        category: "transform"
      }
    },
    backgroundColor: {
      type: "vec3",
      default: [0, 0, 0],
      uniform: "backgroundColor",
      ui: {
        label: "background color",
        control: "color",
        category: "background"
      }
    },
    backgroundOpacity: {
      type: "float",
      default: 0,
      min: 0,
      max: 100,
      uniform: "backgroundOpacity",
      ui: {
        label: "background opacity",
        control: "slider",
        category: "background"
      }
    },
    motionBlur: {
      type: "float",
      default: 0,
      min: 0,
      max: 100,
      uniform: "motionBlur",
      ui: {
        label: "motion blur",
        control: "slider",
        category: "util"
      }
    },
    seed: {
      type: "float",
      default: 1,
      min: 1,
      max: 100,
      uniform: "seed",
      ui: {
        control: false
      }
    },
    imageSize: {
      type: "vec2",
      default: [1024, 1024],
      uniform: "imageSize",
      ui: {
        control: false
      }
    }
  }

  textures = {
    _selfTex: {
      width: "input",
      height: "input",
      format: "rgba8unorm"
    }
  }

  passes = [
    {
      name: "main",
      program: "mediaInput",
      inputs: {
        imageTex: "imageTex",
        selfTex: "_selfTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    },
    {
      name: "feedback",
      program: "copy",
      inputs: {
        inputTex: "outputTex"
      },
      outputs: {
        fragColor: "_selfTex"
      }
    }
  ]

  /**
   * Called when effect is initialized. Set up default image size.
   */
  onInit() {
    this.state.imageWidth = 1
    this.state.imageHeight = 1
  }

  /**
   * Called every frame before rendering.
   * Updates imageSize uniform from current media dimensions.
   */
  onUpdate() {
    return {
      imageSize: [this.state.imageWidth || 1, this.state.imageHeight || 1]
    }
  }

  /**
   * Update media dimensions - called when video/image source changes
   */
  setMediaDimensions(width, height) {
    this.state.imageWidth = width
    this.state.imageHeight = height
  }
}
