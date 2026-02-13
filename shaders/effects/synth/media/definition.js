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
  tags = ["image", "video"]
  description = "Video/camera/image input"

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
    imageSize: { slot: 4, components: 'xy' }
  }

  globals = {
    position: {
      type: "int",
      default: 4,
      uniform: "position",
      choices: {
        topLeft: 0,
        topCenter: 1,
        topRight: 2,
        midLeft: 3,
        midCenter: 4,
        midRight: 5,
        bottomLeft: 6,
        bottomCenter: 7,
        bottomRight: 8
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
        none: 0,
        horizAndVert: 1,
        horizOnly: 2,
        vertOnly: 3
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
        none: 0,
        all: 1,
        horizontal: 2,
        vertical: 3,
        mirrorLtoR: 11,
        mirrorRtoL: 12,
        mirrorUtoD: 13,
        mirrorDtoU: 14,
        mirrorLtoRUtoD: 15,
        mirrorLtoRDtoU: 16,
        mirrorRtoLUtoD: 17,
        mirrorRtoLDtoU: 18
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
    bgColor: {
      type: "color",
      default: [0, 0, 0],
      uniform: "backgroundColor",
      ui: {
        label: "bg color",
        control: "color",
        category: "background"
      }
    },
    bgAlpha: {
      type: "float",
      default: 0,
      min: 0,
      max: 1,
      uniform: "backgroundOpacity",
      ui: {
        label: "bg opacity",
        control: "slider",
        category: "background"
      }
    },
    seed: {
      type: "int",
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

  paramAliases = { backgroundColor: 'bgColor', backgroundOpacity: 'bgAlpha' }


  passes = [
    {
      name: "main",
      program: "mediaInput",
      inputs: {
        imageTex: "imageTex"
      },
      outputs: {
        fragColor: "outputTex"
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
