#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const effects = path.resolve(__dirname, '../effects/filter')
const load = async (name) => (await import(path.join(effects, name, 'definition.js'))).default

const relief = await load('relief')
assert.deepEqual(relief.globals.balance.ui.enabledBy, { param: 'mode', eq: 2 })
assert.deepEqual(relief.globals.graininess.ui.enabledBy, { param: 'mode', eq: 2 })

const strokes = await load('strokes')
assert.deepEqual(strokes.globals.balance.ui.enabledBy, { param: 'mode', in: [0, 2] })
assert.deepEqual(strokes.globals.intensity.ui.enabledBy, { param: 'mode', in: [1, 2, 3] })
assert.equal(strokes.globals.mode.define, 'MODE')
assert.equal(strokes.globals.mode.uniform, undefined,
    'mode is a compile-time define only; a runtime uniform would be dead once the pass-condition is gone')
assert.equal(strokes.passes[0].conditions, undefined,
    'Strokes must gate Sumi-e erosion via the compile-time MODE define, not a pipeline pass-condition')

const halftone = await load('halftone')
assert.deepEqual(halftone.globals.pattern.ui.enabledBy, { param: 'mode', eq: 1 })
for (const control of ['cyanAngle', 'magentaAngle', 'yellowAngle', 'blackAngle']) {
    assert.deepEqual(halftone.globals[control].ui.enabledBy, { param: 'mode', eq: 0 })
}
assert.deepEqual(halftone.globals.monoAngle.ui.enabledBy, {
    and: [{ param: 'mode', eq: 1 }, { param: 'pattern', in: [0, 1] }],
})
for (const control of ['inkColor', 'paperColor']) {
    assert.deepEqual(halftone.globals[control].ui.enabledBy, { param: 'mode', eq: 1 })
}

const hatch = await load('hatch')
assert.deepEqual(hatch.globals.inkColor.ui.enabledBy, { param: 'mode', notIn: [4, 5] })
assert.deepEqual(hatch.globals.paperColor.ui.enabledBy, { param: 'mode', notIn: [4] })

const mosaicTiles = await load('mosaicTiles')
for (const control of ['groutWidth', 'relief']) {
    assert.deepEqual(mosaicTiles.globals[control].ui.enabledBy, { param: 'mode', eq: 0 })
}
for (const control of ['maxOffset', 'gapFill']) {
    assert.deepEqual(mosaicTiles.globals[control].ui.enabledBy, { param: 'mode', eq: 1 })
}
assert.deepEqual(mosaicTiles.globals.backgroundColor.ui.enabledBy, {
    and: [{ param: 'mode', eq: 1 }, { param: 'gapFill', eq: 0 }],
})

const stipple = await load('stipple')
for (const control of ['cellSize', 'paperColor']) {
    assert.deepEqual(stipple.globals[control].ui.enabledBy, { param: 'mode', eq: 0 })
}
for (const control of ['grainSize', 'density']) {
    assert.deepEqual(stipple.globals[control].ui.enabledBy, { param: 'mode', neq: 0 })
}

const oilPaint = await load('oilPaint')
assert.deepEqual(oilPaint.globals.detail.ui.enabledBy, { param: 'mode', neq: 0 })
assert.deepEqual(oilPaint.globals.seed.ui.enabledBy, { param: 'mode', eq: 5 })

const lowPoly = await load('lowPoly')
assert.deepEqual(lowPoly.globals.edgeStrength.ui.enabledBy, { param: 'mode', neq: 0 })
assert.deepEqual(lowPoly.globals.edgeColor.ui.enabledBy, {
    or: [{ param: 'borderWidth', gt: 0 }, { param: 'mode', eq: 1 }],
})

const edge = await load('edge')
for (const control of ['level', 'contourSide']) {
    assert.deepEqual(edge.globals[control].ui.enabledBy, { param: 'kernel', eq: 2 })
}
assert.deepEqual(edge.globals.size.ui.enabledBy, { param: 'kernel', notIn: [2] })

const emboss = await load('emboss')
assert.deepEqual(emboss.globals.amount.ui.enabledBy, { param: 'style', eq: 0 })
assert.deepEqual(emboss.globals.colorAmount.ui.enabledBy, { param: 'style', eq: 1 })

const texture = await load('texture')
for (const control of ['intensity', 'contrast', 'mono']) {
    assert.deepEqual(texture.globals[control].ui.enabledBy, { param: 'mode', gt: 4 })
}

console.log('mode-dependent UI controls: ok')
