import TextSynth from '../../synth/text/definition.js'

/**
 * Text - Text overlay filter
 *
 * Filter effect that overlays text rendered on the CPU side onto an input image.
 * Supports multiple instances per graph, each with independent text content,
 * font, size, position, rotation, and background settings.
 *
 * Inherits implementation from synth/text to avoid duplication.
 */
export default class Text extends TextSynth {
  namespace = "filter"
}
