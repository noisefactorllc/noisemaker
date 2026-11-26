import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { createAgreementPage, withPageDeadline } from '../../scripts/lib/agreement-browser.mjs'
import { compareFrames, effectCases } from './agreement-cases.mjs'
import remap from '../effects/synth/remap/definition.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
let browser
try {
    const baseUrl = await acquireServer(0, root, process.env.SHADE_EFFECTS_DIR)
    browser = await chromium.launch(shaderTestBrowserOptions())
    const gl = await createAgreementPage(browser, baseUrl, 'webgl2')
    const gpu = await createAgreementPage(browser, baseUrl, 'webgpu')
    const dsl = 'search synth\ntestPattern(pattern: uvMap).write(o0)\nrender(o0)'
    const a = await gl.render(dsl, 'synth/testPattern')
    const b = await gpu.render(dsl, 'synth/testPattern')
    assert.equal(compareFrames(a.frame, b.frame).pass, true, 'presented UV fixture agrees')
    const pixel = (x, y) => [...a.frame.data.subarray((y * 96 + x) * 4, (y * 96 + x) * 4 + 3)]
    assert.ok(pixel(90, 4)[0] > 230 && pixel(90, 4)[1] > 230, 'top right must have high authored red and green')
    assert.ok(pixel(4, 90)[0] < 20 && pixel(4, 90)[1] < 20, 'bottom left must have low authored red and green')
    await gpu.page.locator('canvas').evaluate(canvas => { canvas.style.transform = 'scaleY(-1)' })
    const flipped = PNG.sync.read(await gpu.page.locator('canvas').screenshot())
    assert.ok(compareFrames(a.frame, flipped).fractionAbove2 > 0.9, 'the measurement must reject a presented flip')
    await gpu.page.locator('canvas').evaluate(canvas => { canvas.style.transform = '' })
    await gpu.render('search synth\nnoise(seed: 7).write(o0)\nrender(o0)', 'synth/noise')
    const repeated = await gpu.render(dsl, 'synth/testPattern')
    assert.deepEqual(repeated.frame.data, b.frame.data, 'a previous program cannot contaminate the next capture')
    await assert.rejects(gpu.render(dsl, 'synth/noise'), /Target did not execute/, 'missing targets must fail')
    for (const parameter of ['size: 0.4', 'posX: 0.1', 'rotation: 90']) {
        const plain = await gpu.render('search synth, filter\nnoise().text().write(o0)\nrender(o0)', 'filter/text')
        const changed = await gpu.render(`search synth, filter\nnoise().text(${parameter}).write(o0)\nrender(o0)`, 'filter/text')
        assert.ok(compareFrames(plain.frame, changed.frame).fractionAbove2 > 0.01, `text fixture must respond to ${parameter}`)
    }
    const media = await gpu.render('search synth\nmedia().write(o0)\nrender(o0)', 'synth/media')
    await gpu.page.evaluate(() => {
        const r = window.agreementRenderer
        r.applyStepParameterValues({ step_0: { imageSize: [1024, 1024] } })
        r.render(0)
    })
    const wrongSize = PNG.sync.read(await gpu.page.locator('canvas').screenshot())
    assert.ok(compareFrames(media.frame, wrongSize).fractionAbove2 > 0.01, 'media fixture dimensions must affect the presented image')
    for (const name of ['scope', 'spectrum']) {
        const program = `search synth\n${name}().write(o0)\nrender(o0)`
        const active = await gpu.render(program, `synth/${name}`)
        const litRows = new Set()
        for (let i = 0; i < active.frame.data.length; i += 4) if (active.frame.data[i + 1] > 128) litRows.add(Math.floor(i / 4 / 96))
        assert.ok(litRows.size > 48, `${name} fixture must vary across samples`)
        await gpu.page.evaluate(() => {
            const r = window.agreementRenderer
            r.setAudioState()
            r.render(0)
        })
        const silent = PNG.sync.read(await gpu.page.locator('canvas').screenshot())
        assert.ok(compareFrames(active.frame, silent).fractionAbove2 > 0.01, `${name} must consume a non-silent fixture`)
    }
    const rollDsl = 'search synth\nroll().write(o0)\nrender(o0)'
    const notes = await gl.render(rollDsl, 'synth/roll')
    const gpuNotes = await gpu.render(rollDsl, 'synth/roll')
    assert.equal(compareFrames(notes.frame, gpuNotes.frame).pass, true, 'roll must render the same MidiState notes on both backends')
    await gl.page.evaluate(async dsl => {
        const r = window.agreementRenderer
        await r.dispose()
        r.setMidiState()
        await r.compile(dsl)
        r.stop()
        for (let i = 0; i < 3; i++) r.render(0)
    }, rollDsl)
    const noNotes = PNG.sync.read(await gl.page.locator('canvas').screenshot())
    assert.ok(compareFrames(notes.frame, noNotes).differingPixels > 0, 'MIDI fixture must reach the presented roll')
    const remapCases = effectCases({ namespace: 'synth', instance: remap })
    const routed = await gl.render(remapCases.find(c => c.name === 'active-input').dsl, 'synth/remap')
    const colors = new Set()
    for (let i = 0; i < routed.frame.data.length; i += 4) colors.add(routed.frame.data.readUInt32BE(i))
    assert.ok(colors.size > 100, 'populated Remap polygons must route patterned input to the canvas')
    const stalled = await browser.newPage()
    const rescue = setTimeout(() => stalled.close(), 1000)
    try {
        await assert.rejects(withPageDeadline(stalled, () => stalled.evaluate(() => new Promise(() => {})), 50), /deadline/)
        assert.equal(stalled.isClosed(), true, 'a stalled browser page must close')
    } finally {
        clearTimeout(rescue)
    }
    console.log('PASS presented-canvas agreement, authored orientation, flip rejection, state isolation, input fixtures, and deadline cleanup')
} finally {
    await browser?.close()
    await releaseServer()
}
