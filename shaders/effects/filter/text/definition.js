import { Effect } from '../../../src/runtime/effect.js'

/**
 * Text - Text overlay filter
 *
 * Filter effect that overlays text rendered on the CPU side onto an input image.
 * Supports multiple instances per graph, each with independent text content,
 * font, size, position, rotation, and background settings.
 */
export default class Text extends Effect {
  name = "Text"
  namespace = "filter"
  func = "text"
  tags = ["util", "overlay"]
  description = "Text overlay filter"

  // Mark this as requiring external texture updates
  externalTexture = "textTex"

  // WGSL uniform packing layout - maps uniform names to vec4 slots/components
  uniformLayout = {
    resolution: { slot: 0, components: 'xy' },
    time: { slot: 0, components: 'z' },
    seed: { slot: 0, components: 'w' },
    textSize: { slot: 1, components: 'xy' }
  }

  globals = {
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
    textSize: {
      type: "vec2",
      default: [1024, 1024],
      uniform: "textSize",
      ui: {
        control: false
      }
    }
  }

  passes = [
    {
      name: "text",
      program: "text",
      inputs: {
        inputTex: "inputTex",
        textTex: "textTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]

  /**
   * Called when effect is initialized. Set up default text size.
   */
  onInit() {
    this.state.textWidth = 1
    this.state.textHeight = 1
  }

  /**
   * Called every frame before rendering.
   * Updates textSize uniform from current text canvas dimensions.
   */
  onUpdate() {
    return {
      textSize: [this.state.textWidth || 1, this.state.textHeight || 1]
    }
  }

  /**
   * Update text dimensions - called when text canvas is rendered
   */
  setTextDimensions(width, height) {
    this.state.textWidth = width
    this.state.textHeight = height
  }
}
