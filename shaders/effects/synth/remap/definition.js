import { Effect } from '../../../src/runtime/effect.js'

/**
 * synth/remap — Projection-mapping zone router.
 *
 * Renders up to eight polygonal zones, each routed to one engine surface
 * (any of o0..o7, written by an upstream effect). Companion to the Remap
 * web app at https://remap.noisedeck.app — the app produces a portable
 * JSON describing the zones, which fills the per-zone vertex / warp
 * uniforms here. Each zone declares its source via a `zoneN_tex` surface
 * input, wired in DSL: `remap(zone0_tex: read(o0), zone1_tex: read(o3))`.
 *
 * Zone vertices are packed two per vec4 (xy = vert n, zw = vert n+1) for
 * eight zones × eight vertex pairs. Zones with vertexCount < 3 or with
 * zoneN_tex unwired (default "none") are skipped, and pixels falling
 * outside every active zone show the background color.
 */

const MAX_ZONES = 8
const MAX_VERTS_PER_ZONE = 16

// Build the uniformLayout programmatically so the per-zone slots stay in sync.
// Layout (79 vec4 slots total):
//   slot 0:      bgR, bgG, bgB, bgAlpha
//   slot 1:      zoneCount, smoothEdge, warpEnabled, time
//   slot 2..9:   zone meta (xyzw = vertexCount, active, _, alpha) for zones 0..7
//                `active` is set by the runtime via colorModeUniform: 1 when
//                the zoneN_tex surface input is wired, 0 when it's "none".
//   slot 10..73: zone polygons
//                Each zone gets MAX_VERTS_PER_ZONE/2 = 8 vec4s
//                packed vec4 = (vert n.x, vert n.y, vert n+1.x, vert n+1.y)
//   slot 74:     warp corner 0 (TL.xy) + corner 1 (TR.xy) packed
//   slot 75:     warp corner 2 (BR.xy) + corner 3 (BL.xy) packed
//   slot 76:     warp midpoint 0 (T.xy) + midpoint 1 (R.xy) packed
//   slot 77:     warp midpoint 2 (B.xy) + midpoint 3 (L.xy) packed
//   slot 78.xy:  resolution (auto-filled by the runtime; needed because
//                this is a starter effect with no inputTex binding)
const uniformLayout = (() => {
    const layout = {
        bgColor:     { slot: 0, components: 'xyz' },
        bgAlpha:     { slot: 0, components: 'w' },
        zoneCount:   { slot: 1, components: 'x' },
        smoothEdge:  { slot: 1, components: 'y' },
        warpEnabled: { slot: 1, components: 'z' },
        time:        { slot: 1, components: 'w' },
        warpCorner0: { slot: 74, components: 'xy' },
        warpCorner1: { slot: 74, components: 'zw' },
        warpCorner2: { slot: 75, components: 'xy' },
        warpCorner3: { slot: 75, components: 'zw' },
        warpMid0:    { slot: 76, components: 'xy' },
        warpMid1:    { slot: 76, components: 'zw' },
        warpMid2:    { slot: 77, components: 'xy' },
        warpMid3:    { slot: 77, components: 'zw' },
        resolution:  { slot: 78, components: 'xy' }
    }
    for (let z = 0; z < MAX_ZONES; z++) {
        const metaSlot = 2 + z
        layout[`zone${z}_count`]  = { slot: metaSlot, components: 'x' }
        layout[`zone${z}_active`] = { slot: metaSlot, components: 'y' }
        layout[`zone${z}_alpha`]  = { slot: metaSlot, components: 'w' }
        for (let pair = 0; pair < MAX_VERTS_PER_ZONE / 2; pair++) {
            const slot = 10 + z * (MAX_VERTS_PER_ZONE / 2) + pair
            layout[`zone${z}_v${pair}`] = { slot, components: 'xyzw' }
        }
    }
    return layout
})()

function makeZoneGlobals() {
    const out = {}
    for (let z = 0; z < MAX_ZONES; z++) {
        // Zone N's UI controls light up only when zoneCount > N — so with
        // zoneCount = 0 nothing under "zone 1" is interactable, with
        // zoneCount = 2 zones 1 and 2 are interactable, etc.
        const enabled = { enabledBy: { param: 'zoneCount', gt: z } }
        const cat = `zone ${z + 1}`
        out[`zone${z}_tex`] = {
            type: 'surface',
            default: 'none',
            colorModeUniform: `zone${z}_active`,
            ui: { label: `zone ${z + 1} source`, category: cat, ...enabled }
        }
        out[`zone${z}_count`] = {
            type: 'int',
            default: 0,
            uniform: `zone${z}_count`,
            min: 0,
            max: MAX_VERTS_PER_ZONE,
            ui: { label: 'vertices', control: false, category: cat, ...enabled }
        }
        out[`zone${z}_alpha`] = {
            type: 'float',
            default: 1.0,
            uniform: `zone${z}_alpha`,
            min: 0,
            max: 1,
            ui: { label: 'alpha', control: 'slider', category: cat, ...enabled }
        }
        for (let pair = 0; pair < MAX_VERTS_PER_ZONE / 2; pair++) {
            out[`zone${z}_v${pair}`] = {
                type: 'vec4',
                default: [0, 0, 0, 0],
                uniform: `zone${z}_v${pair}`,
                ui: {
                    label: `verts ${pair * 2}–${pair * 2 + 1}`,
                    control: false,
                    category: cat
                }
            }
        }
    }
    return out
}

const passInputs = (() => {
    const inputs = {}
    for (let z = 0; z < MAX_ZONES; z++) inputs[`zone${z}_tex`] = `zone${z}_tex`
    return inputs
})()

export default new Effect({
  name: "Remap",
  namespace: "synth",
  func: "remap",
  tags: ["geometric", "blend"],

  description: "Polygon zones routed to engine surfaces (companion to the Remap projection-mapping app)",
  openCategories: ["general"],

  uniformLayout,

  globals: {
    zoneCount: {
      type: "int",
      default: 0,
      uniform: "zoneCount",
      min: 0,
      max: MAX_ZONES,
      step: 1,
      ui: { label: "zone count", control: "slider" }
    },

    bgColor: {
      type: "color",
      default: [0, 0, 0],
      uniform: "bgColor",
      ui: { label: "background", control: "color" }
    },

    bgAlpha: {
      type: "float",
      default: 1.0,
      uniform: "bgAlpha",
      min: 0,
      max: 1,
      ui: { label: "background alpha", control: "slider" }
    },

    smoothEdge: {
      type: "float",
      default: 0.04,
      uniform: "smoothEdge",
      min: 0,
      max: 1,
      step: 0.01,
      ui: { label: "edge smoothing", control: "slider" }
    },

    // === Geometry warp ===
    // The Remap app's eight handles produce a Coons-patch warp. When
    // enabled, the shader maps every output pixel back through the inverse
    // warp before zone-testing, so zones rendered into the rectangular
    // source space appear projected onto the eight-handle quad.
    warpEnabled: {
      type: "boolean",
      default: false,
      uniform: "warpEnabled",
      ui: { label: "warp enabled", control: "checkbox", category: "warp" }
    },
    warpCorner0: { type: "vec2", default: [0, 0], uniform: "warpCorner0", ui: { label: "TL", control: false, category: "warp" } },
    warpCorner1: { type: "vec2", default: [1, 0], uniform: "warpCorner1", ui: { label: "TR", control: false, category: "warp" } },
    warpCorner2: { type: "vec2", default: [1, 1], uniform: "warpCorner2", ui: { label: "BR", control: false, category: "warp" } },
    warpCorner3: { type: "vec2", default: [0, 1], uniform: "warpCorner3", ui: { label: "BL", control: false, category: "warp" } },
    warpMid0:    { type: "vec2", default: [0.5, 0], uniform: "warpMid0", ui: { label: "T",  control: false, category: "warp" } },
    warpMid1:    { type: "vec2", default: [1, 0.5], uniform: "warpMid1", ui: { label: "R",  control: false, category: "warp" } },
    warpMid2:    { type: "vec2", default: [0.5, 1], uniform: "warpMid2", ui: { label: "B",  control: false, category: "warp" } },
    warpMid3:    { type: "vec2", default: [0, 0.5], uniform: "warpMid3", ui: { label: "L",  control: false, category: "warp" } },

    ...makeZoneGlobals()
  },

  // The shader DSL lexer doesn't accept [a, b, c, d] array literals, so
  // we can't load polygon vertices through the demo program — those come
  // from the Remap app's effect-params export at runtime via
  // renderer.applyStepParameterValues. The demo just proves the effect
  // compiles and renders the background; users wire up real zones via
  // the Remap app.
  defaultProgram: "search synth\n\nremap(bgColor: #336699, bgAlpha: 1)\n  .write(o0)",

  passes: [
    {
      name: "render",
      program: "remap",
      inputs: passInputs,
      outputs: { fragColor: "outputTex" }
    }
  ]
})
