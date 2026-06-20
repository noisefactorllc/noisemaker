import { Effect } from '../../../src/runtime/effect.js'

/**
 * mixer/mashup — Luminance-band router ("mega mixer").
 *
 * The control input (`source`) is posterized by luminance into `layers`
 * equal bands (boundaries at k/layers). Each band routes to one engine
 * surface (layerN_tex, any of o0..o7), wired in DSL like synth/remap:
 *   mashup(source: read(o3), layer0_tex: read(o0), layer1_tex: read(o1))
 * Darkest band -> layer0, brightest -> layer(layers-1). `smoothness`
 * feathers each band boundary; 0 gives hard posterized edges. A band whose
 * layer source is unwired (layerN_active == 0) falls back to the control
 * input, so unwired bands show `source` through.
 *
 * Starter effect (no chain input): the control is the explicit `source`
 * slot, so output resolution comes from the auto-filled `resolution`
 * uniform (mirrors synth/remap). Active-when-wired also mirrors synth/remap:
 * each layerN_tex carries colorModeUniform 'layerN_active', set to 1 by the
 * expander when the surface is wired and 0 when "none". Uniforms are packed
 * into a single vec4 array (3 slots) to match the WGSL `data[]` layout:
 *   slot 0: layers, smoothness, resolution.x, resolution.y
 *   slot 1: layer0_active..layer3_active (xyzw)
 *   slot 2: layer4_active..layer7_active (xyzw)
 */

const MAX_LAYERS = 8

const uniformLayout = (() => {
    const layout = {
        layers:     { slot: 0, components: 'x' },
        smoothness: { slot: 0, components: 'y' },
        resolution: { slot: 0, components: 'zw' }
    }
    for (let i = 0; i < MAX_LAYERS; i++) {
        const slot = 1 + Math.floor(i / 4)
        const comp = 'xyzw'[i % 4]
        layout[`layer${i}_active`] = { slot, components: comp }
    }
    return layout
})()

const passInputs = (() => {
    const inputs = { source: 'source' }
    for (let i = 0; i < MAX_LAYERS; i++) inputs[`layer${i}_tex`] = `layer${i}_tex`
    return inputs
})()

export default new Effect({
  name: "Mashup",
  namespace: "mixer",
  func: "mashup",
  tags: ["blend"],

  description: "Posterize a control input by luminance and route each band to a different surface",

  uniformLayout,

  globals: {
    source: {
      type: "surface",
      default: "none",
      ui: { label: "input" }
    },

    layers: {
      type: "int",
      default: 4,
      uniform: "layers",
      min: 2,
      max: MAX_LAYERS,
      step: 1,
      ui: { label: "layers", control: "slider" }
    },

    smoothness: {
      type: "float",
      default: 0.1,
      uniform: "smoothness",
      min: 0,
      max: 0.5,
      zero: 0,
      ui: { label: "smoothness", control: "slider" }
    },

    ...makeLayerGlobals()
  },

  defaultProgram: "search mixer, synth\n\nnoise(\n  type: constant,\n  octaves: 4,\n  ridges: true,\n  loopScale: 100,\n  speed: 100\n)\n  .write(o0)\n\nsolid(color: #006d4c)\n  .write(o1)\n\nperlin(ridges: true)\n  .write(o2)\n\ngradient(\n  type: noiseGradient,\n  color1: #ffffffff,\n  color2: #a9a9a9ff,\n  color3: #515151ff,\n  color4: #000000ff,\n  colorCount: 3\n)\n  .write(o3)\n\nmashup(\n  source: read(o3),\n  layers: 3,\n  smoothness: 0.22,\n  layer0_tex: read(o0),\n  layer1_tex: read(o1),\n  layer2_tex: read(o2)\n)\n  .write(o4)",

  passes: [
    {
      name: "render",
      program: "mashup",
      inputs: passInputs,
      outputs: { fragColor: "outputTex" }
    }
  ]
})

// Per-layer source globals. Defined after the Effect export (function
// declarations hoist, so the spread above still resolves at load time).
// Each layerN slot lights up only when `layers` > N, so with layers = 4
// slots 1–4 are interactable and 5–8 are greyed out.
function makeLayerGlobals() {
    const out = {}
    for (let i = 0; i < MAX_LAYERS; i++) {
        const enabled = { enabledBy: { param: 'layers', gt: i } }
        out[`layer${i}_tex`] = {
            type: 'surface',
            default: 'none',
            colorModeUniform: `layer${i}_active`,
            ui: { label: `layer ${i + 1} source`, category: `layer ${i + 1}`, ...enabled }
        }
    }
    return out
}
