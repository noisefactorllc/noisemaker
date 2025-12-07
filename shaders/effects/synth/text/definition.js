import { Effect } from '../../../src/runtime/effect.js';

/**
 * Text effect - renders text to a texture and displays it.
 *
 * This is a synth-type effect that generates visuals from text input.
 * The text is rendered to a 2D canvas on the CPU side and uploaded as a texture.
 */
export default new Effect({
  name: "Text",
  namespace: "synth",
  func: "text",
  externalTexture: "textTex",
  globals: {
    // Note: Most text parameters are controlled via the UI module
    // and applied during CPU-side text rendering. The shader just
    // displays the pre-rendered texture.
  },
  passes: [{
    name: "text",
    program: "text",
    inputs: { textTex: "textTex" },
    outputs: { fragColor: "outputTex" }
  }]
});
