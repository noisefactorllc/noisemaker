// The host library uploads each media and text texture to the id that the
// compiled program binds (renderer.getMediaSteps()), at every compile: a step
// that gains an `_id:` binds its element key, and its upload follows.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { UIController } from '../../demo/shaders/lib/demo-ui.js'
import { ProgramState } from '../../demo/shaders/lib/program-state.js'
import { extractEffectsFromDsl } from '../../demo/shaders/lib/dsl-utils.js'
import { compileGraph, registerEffect, registerOp, registerStarterOps, mergeIntoEnums, stdEnums } from '../src/index.js'
import { elementStateKey } from '../src/runtime/expander.js'

mergeIntoEnums(stdEnums)
for (const [namespace, name, starter] of [['synth', 'media', true], ['synth', 'solid', true], ['filter', 'text', false]]) {
    const { default: definition } = await import(`../effects/${namespace}/${name}/definition.js`)
    const effect = typeof definition === 'function' ? new definition() : definition
    for (const key of [effect.func, `${namespace}.${effect.func}`, `${namespace}/${name}`]) registerEffect(key, effect)
    registerOp(`${namespace}.${effect.func}`, {
        name: effect.func,
        args: Object.entries(effect.globals || {}).map(([key, spec]) => ({
            name: key, type: spec.type === 'vec4' ? 'color' : spec.type, default: spec.default,
            min: spec.min, max: spec.max, uniform: spec.uniform, choices: spec.choices,
            enum: spec.enum || (spec.choices ? `${namespace}.${effect.func}.${key}` : undefined)
        }))
    })
    if (starter) registerStarterOps([`${namespace}.${effect.func}`])
}

// A UIController over a renderer whose program is `dsl`, recording uploads.
function controller(stored) {
    const uploads = []
    const renderer = {
        _pipeline: {},
        graph: null,
        getMediaSteps() { return this.graph?.mediaSteps ?? [] },
        updateTextureFromSource: (id) => { uploads.push(id); return { width: 0, height: 0 } }
    }
    const ui = Object.assign(Object.create(UIController.prototype), {
        _renderer: renderer,
        _programState: { setValue() {} },
        _mediaInputs: new Map([[0, { source: {}, textureId: stored }]]),
        _textInputs: new Map([[1, { canvas: {}, textureId: stored }]])
    })
    return { ui, uploads, compile: dsl => { renderer.graph = compileGraph(dsl) } }
}

test('a media upload goes to the id the current program binds, before and after the step gains an _id:', () => {
    const { ui, uploads, compile } = controller('imageTex_step_0')
    compile('search synth\nmedia().write(o0)\nrender(o0)')
    ui._updateMediaTexture(0)
    compile('search synth\nmedia(_id: "photo").write(o0)\nrender(o0)')
    ui._updateMediaTexture(0)
    assert.deepEqual(uploads, ['imageTex_step_0', `${elementStateKey('photo', 'synth.media')}_imageTex`])
})

test('a text upload goes to the id the current program binds, before and after the step gains an _id:', () => {
    const { ui, uploads, compile } = controller('textTex_step_1')
    compile('search synth, filter\nsolid().text().write(o0)\nrender(o0)')
    ui._updateTextTexture(1)
    compile('search synth, filter\nsolid().text(_id: "title").write(o0)\nrender(o0)')
    ui._updateTextTexture(1)
    assert.deepEqual(uploads, ['textTex_step_1', `${elementStateKey('title', 'filter.text')}_textTex`])
})

test('an upload falls back to the stored id when the program binds none at its step', () => {
    const { ui, uploads, compile } = controller('imageTex_step_0')
    compile('search synth\nsolid().write(o0)\nrender(o0)')
    ui._updateMediaTexture(0)
    assert.deepEqual(uploads, ['imageTex_step_0'])
})

test('a media step takes the id bound to its own texture name, not another effect\'s at its step', () => {
    const ui = Object.assign(Object.create(UIController.prototype), {
        _renderer: { getMediaSteps: () => [{ textureId: 'textTex_step_1', uniform: 'textTex', stepIndex: 1, effect: 'filter.text' }] }
    })
    assert.equal(ui._boundTextureId(1, 'imageTex'), null)
    assert.equal(ui._boundTextureId(1, 'textTex'), 'textTex_step_1')
})

// The compile flow for an edit that keeps the program's structure, such as a
// rename of an `_id:`. (Adding an `_id:` changes the step's arguments, so the
// controls are rebuilt, and the rebuilt step takes its id from getMediaSteps().)
function flow(before, after) {
    const uploads = []
    const moves = []
    const renderer = {
        _pipeline: {},
        graph: compileGraph(before),
        getMediaSteps() { return this.graph.mediaSteps },
        updateTextureFromSource: (id) => { uploads.push(id); return { width: 0, height: 0 } },
        moveState: (from, to) => { moves.push([from, to]); return from.endsWith('_imageTex') }
    }
    const state = new ProgramState({ renderer: {} })
    state.fromDsl(before)
    const ui = Object.assign(Object.create(UIController.prototype), {
        _renderer: renderer,
        _programState: state,
        _controlsContainer: {},
        _parsedDslStructure: extractEffectsFromDsl(before),
        _syncControlValuesFromState: () => {},
        _mediaInputs: new Map(),
        _textInputs: new Map()
    })
    return { ui, uploads, moves, recompile: () => { renderer.graph = compileGraph(after); return ui.checkStructureAndApplyState(after) } }
}

test('after a compile that renames an _id:, the media upload moves to the new key', () => {
    const { ui, uploads, moves, recompile } = flow('search synth\nmedia(_id: "photo").write(o0)\nrender(o0)',
        'search synth\nmedia(_id: "lake").write(o0)\nrender(o0)')
    const from = `${elementStateKey('photo', 'synth.media')}_imageTex`
    ui._mediaInputs.set(0, { source: {}, textureId: from, externalTexture: 'imageTex' })
    assert.equal(recompile(), true, 'the structure is unchanged')
    const key = `${elementStateKey('lake', 'synth.media')}_imageTex`
    assert.deepEqual(moves, [[from, key]])
    assert.deepEqual(uploads, [], 'a moved upload is not uploaded again')
    assert.equal(ui._mediaInputs.get(0).textureId, key)
})

test('after a compile that renames an _id:, a text texture that cannot move is drawn again under the new key', () => {
    const { ui, uploads, moves, recompile } = flow('search synth, filter\nsolid().text(_id: "title").write(o0)\nrender(o0)',
        'search synth, filter\nsolid().text(_id: "heading").write(o0)\nrender(o0)')
    const from = `${elementStateKey('title', 'filter.text')}_textTex`
    ui._textInputs.set(1, { canvas: {}, textureId: from })
    assert.equal(recompile(), true)
    const key = `${elementStateKey('heading', 'filter.text')}_textTex`
    assert.deepEqual(moves, [[from, key]])
    assert.deepEqual(uploads, [key])
    assert.equal(ui._textInputs.get(1).textureId, key)
})
