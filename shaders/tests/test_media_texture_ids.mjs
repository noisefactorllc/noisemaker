#!/usr/bin/env node
//
// Media texture ids: the documented id 'imageTex' binds nothing.
//
// Issue #308: docs/shaders/integration.rst ("Media Inputs") showed
// renderer.updateTextureFromSource('imageTex', img). No pass ever binds a
// bare 'imageTex' — the expander names each media step's texture
// '<externalTexture>_step_N', where N is the step's node index in the
// compiled program and every step counts (a trailing .write() is its own
// node). Hosts that bind the documented id upload into a texture nothing
// samples, so the media effect renders black.
//
// Fix, 1.x-safe (no step renumbering, no id renames): the docs now show the
// per-step id and imageSize, and an additive renderer.getMediaSteps() lists
// each media step's texture id so hosts do not reproduce the numbering.
//
// Run: node shaders/tests/test_media_texture_ids.mjs

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CanvasRenderer } from '../src/renderer/canvas.js'
import { compileGraph, registerEffect, registerOp, registerStarterOps, mergeIntoEnums, stdEnums } from '../src/index.js'
import { elementStateKey } from '../src/runtime/expander.js'
import { Pipeline } from '../src/runtime/pipeline.js'
import { WebGL2Backend } from '../src/runtime/backends/webgl2.js'
import { WebGPUBackend } from '../src/runtime/backends/webgpu.js'

mergeIntoEnums(stdEnums)

async function load(namespace, name, { starter = false } = {}) {
    const exported = (await import(`../effects/${namespace}/${name}/definition.js`)).default
    // Class-based definitions are instantiated, as CanvasRenderer.loadEffectDefinition does.
    const instance = typeof exported === 'function' ? new exported() : exported
    registerEffect(instance.func, instance)
    registerEffect(`${namespace}.${instance.func}`, instance)
    registerEffect(`${namespace}/${name}`, instance)
    const choices = {}
    const args = Object.entries(instance.globals || {}).map(([key, spec]) => {
        let enumPath = spec.enum || spec.enumPath
        if (spec.choices && !enumPath) {
            enumPath = `${namespace}.${instance.func}.${key}`
            choices[key] = Object.fromEntries(Object.entries(spec.choices)
                .filter(([n]) => !n.endsWith(':'))
                .map(([n, v]) => [n, { type: 'Number', value: v }]))
        }
        return { name: key, type: spec.type === 'vec4' ? 'color' : spec.type, default: spec.default,
            enum: enumPath, enumPath, min: spec.min, max: spec.max, uniform: spec.uniform, choices: spec.choices }
    })
    registerOp(`${namespace}.${instance.func}`, { name: instance.func, args })
    if (starter) registerStarterOps([`${namespace}.${instance.func}`])
    mergeIntoEnums({ [namespace]: { [instance.func]: choices } })
    return { instance, args }
}

const mediaEffect = await load('synth', 'media', { starter: true })
await load('synth', 'solid', { starter: true })
await load('filter', 'text')
await load('filter', 'invert')
// A fixture effect that declares imageTex under another op name, for the
// replacement check: media() and photo() under one _id: are two effects.
registerEffect('synth.photo', mediaEffect.instance)
registerOp('synth.photo', { name: 'photo', args: mediaEffect.args })
registerStarterOps(['synth.photo'])

function compile(dsl) {
    const graph = compileGraph(dsl)
    // A renderer without a backend still exposes graph-derived queries.
    const renderer = Object.create(CanvasRenderer.prototype)
    renderer._pipeline = { graph }
    return { graph, renderer }
}

describe('media texture ids (issue #308)', () => {
    test('the documented example program never binds bare imageTex', () => {
        const { graph } = compile('search synth\nmedia()\n  .write(o0)\n\nrender(o0)')
        for (const pass of graph.passes) {
            for (const tex of Object.values(pass.inputs || {})) {
                assert.notEqual(tex, 'imageTex',
                    `pass ${pass.id} binds the documented-but-dead id 'imageTex'`)
            }
        }
    })

    test('the media pass binds imageTex_step_0 and getMediaSteps reports it', () => {
        const { graph, renderer } = compile('search synth\nmedia()\n  .write(o0)\n\nrender(o0)')
        const mediaPass = graph.passes.find(p => p.effectKey === 'synth.media')
        assert.ok(mediaPass, 'media pass present')
        assert.equal(mediaPass.inputs.imageTex, 'imageTex_step_0')
        assert.deepEqual(graph.mediaSteps, [
            { textureId: 'imageTex_step_0', uniform: 'imageTex', stepIndex: 0, effect: 'synth.media' }
        ])
        assert.deepEqual(renderer.getMediaSteps(), graph.mediaSteps)
    })

    test('a second chain numbers its media step by node index, write() counts', () => {
        const { graph, renderer } = compile(
            'search synth\nmedia()\n  .write(o0)\n\nmedia()\n  .write(o1)\n\nrender(o0)')
        assert.deepEqual(graph.mediaSteps, [
            { textureId: 'imageTex_step_0', uniform: 'imageTex', stepIndex: 0, effect: 'synth.media' },
            { textureId: 'imageTex_step_2', uniform: 'imageTex', stepIndex: 2, effect: 'synth.media' }
        ])
        // stepIndex keys the host's applyStepParameterValues imageSize write.
        assert.equal(renderer.getMediaSteps()[1].stepIndex, 2)
    })

    test('programs without media steps report none', () => {
        const { renderer } = compile('search synth\nsolid()\n  .write(o0)\n\nrender(o0)')
        assert.deepEqual(renderer.getMediaSteps(), [])
    })

    test('getMediaSteps is safe without a pipeline', () => {
        const renderer = Object.create(CanvasRenderer.prototype)
        renderer._pipeline = null
        assert.deepEqual(renderer.getMediaSteps(), [])
    })
})

describe('a media element keyed by its _id:', () => {
    const PHOTO = `${elementStateKey('photo', 'synth.media')}_imageTex`
    const mediaInput = graph => graph.passes.find(p => p.effectKey === 'synth.media' || p.effectKey === 'synth.photo').inputs.imageTex

    test('binds one texture id across edits, and the id is the key keyOf() returns', () => {
        const before = compile('search synth, filter\nmedia(_id: "photo").write(o0)\nrender(o0)')
        const after = compile('search synth, filter\nsolid().write(o1)\nmedia(_id: "photo").invert().write(o0)\nrender(o0)')
        assert.equal(mediaInput(before.graph), PHOTO)
        assert.equal(mediaInput(after.graph), PHOTO)
        assert.equal(before.renderer.keyOf('photo', 'imageTex'), PHOTO)
        assert.equal(after.renderer.keyOf('photo', 'imageTex'), PHOTO)
    })

    test('getMediaSteps() keeps its entry shape and gives the key as the textureId', () => {
        const { graph, renderer } = compile('search synth\nmedia(_id: "photo").write(o0)\nrender(o0)')
        assert.deepEqual(renderer.getMediaSteps(), [{ textureId: PHOTO, uniform: 'imageTex', stepIndex: 0, effect: 'synth.media' }])
        assert.deepEqual(renderer.getMediaSteps(), graph.mediaSteps)
    })

    test('text(_id:) keys its textTex the same way', () => {
        const { graph, renderer } = compile('search synth, filter\nsolid().text(_id: "title").write(o0)\nrender(o0)')
        const key = `${elementStateKey('title', 'filter.text')}_textTex`
        assert.equal(graph.passes.find(p => p.effectKey === 'filter.text').inputs.textTex, key)
        assert.equal(renderer.keyOf('title', 'textTex'), key)
    })

    test('two media elements with two ids bind two keys', () => {
        const { graph } = compile('search synth\nmedia(_id: "a").write(o0)\nmedia(_id: "b").write(o1)\nrender(o0)')
        assert.deepEqual(graph.mediaSteps.map(s => s.textureId),
            [`${elementStateKey('a', 'synth.media')}_imageTex`, `${elementStateKey('b', 'synth.media')}_imageTex`])
    })

    test('with a duplicate _id:, the later element binds its step-numbered id', () => {
        const { graph } = compile('search synth\nmedia(_id: "photo").write(o0)\nmedia(_id: "photo").write(o1)\nrender(o0)')
        assert.deepEqual(graph.mediaSteps.map(s => s.textureId), [PHOTO, 'imageTex_step_2'])
    })

    test('a replacement effect under the same _id: does not bind the old texture', () => {
        const media = compile('search synth\nmedia(_id: "p").write(o0)\nrender(o0)')
        const photo = compile('search synth\nphoto(_id: "p").write(o0)\nrender(o0)')
        assert.notEqual(mediaInput(media.graph), mediaInput(photo.graph))
        assert.equal(mediaInput(photo.graph), `${elementStateKey('p', 'synth.photo')}_imageTex`)
    })
})

describe('moveState() carries an uploaded texture', () => {
    class UploadBackend {
        textures = new Map()
        createTexture(id, spec) { this.textures.set(id, { ...spec }) }
        createTexture3D(id, spec) { this.textures.set(id, { ...spec }) }
        destroyTexture(id) { this.textures.delete(id) }
        copyTexture() {}
    }
    const pipelineFor = dsl => {
        const pipeline = new Pipeline(compileGraph(dsl), new UploadBackend())
        pipeline.width = 64
        pipeline.height = 64
        pipeline.createSurfaces()
        pipeline.recreateTextures(pipeline.collectDefaultUniforms())
        return pipeline
    }
    const rendererFor = pipeline => Object.assign(Object.create(CanvasRenderer.prototype), { _pipeline: pipeline })

    test('from a step-numbered id to the key of an element that gains an _id:', () => {
        const pipeline = pipelineFor('search synth\nmedia(_id: "photo").write(o0)\nrender(o0)')
        const upload = { width: 32, height: 16, format: 'rgba8', uploaded: true }
        pipeline.backend.textures.set('imageTex_step_0', upload)
        const renderer = rendererFor(pipeline)
        const key = renderer.keyOf('photo', 'imageTex')
        assert.equal(renderer.moveState('imageTex_step_0', key), true)
        assert.equal(pipeline.backend.textures.get(key), upload)
        assert.ok(!pipeline.backend.textures.has('imageTex_step_0'))
    })

    test('from one id key to another, for a rename', () => {
        const pipeline = pipelineFor('search synth\nmedia(_id: "lake").write(o0)\nrender(o0)')
        const upload = { width: 32, height: 16, format: 'rgba8', uploaded: true }
        const from = `${elementStateKey('photo', 'synth.media')}_imageTex`
        pipeline.backend.textures.set(from, upload)
        const renderer = rendererFor(pipeline)
        assert.equal(renderer.moveState(from, renderer.keyOf('lake', 'imageTex')), true)
        assert.equal(pipeline.backend.textures.get(renderer.keyOf('lake', 'imageTex')), upload)
    })

    test('and refuses an upload a step still binds, or a change of op', () => {
        const both = pipelineFor('search synth\nmedia().write(o0)\nmedia(_id: "photo").write(o1)\nrender(o0)')
        both.backend.textures.set('imageTex_step_0', { width: 8, height: 8, format: 'rgba8' })
        const renderer = rendererFor(both)
        assert.equal(renderer.moveState('imageTex_step_0', renderer.keyOf('photo', 'imageTex')), false, 'step 0 still binds its upload')
        const photo = pipelineFor('search synth\nphoto(_id: "p").write(o0)\nrender(o0)')
        const mediaKey = `${elementStateKey('p', 'synth.media')}_imageTex`
        photo.backend.textures.set(mediaKey, { width: 8, height: 8, format: 'rgba8' })
        assert.equal(rendererFor(photo).moveState(mediaKey, rendererFor(photo).keyOf('p', 'imageTex')), false, 'media and photo are two effects')
    })

    test('a backend with moveTexture moves the record itself', () => {
        const pipeline = pipelineFor('search synth\nmedia(_id: "photo").write(o0)\nrender(o0)')
        const calls = []
        pipeline.backend.moveTexture = (from, to) => { calls.push([from, to]); return true }
        pipeline.backend.textures.set('imageTex_step_0', { width: 8, height: 8, format: 'rgba8' })
        const key = rendererFor(pipeline).keyOf('photo', 'imageTex')
        assert.equal(rendererFor(pipeline).moveState('imageTex_step_0', key), true)
        assert.deepEqual(calls, [['imageTex_step_0', key]])
    })

    test('each backend moves an uploaded record, and refuses an id it does not hold', () => {
        for (const Backend of [WebGL2Backend, WebGPUBackend]) {
            const destroyed = []
            const backend = Object.assign(Object.create(Backend.prototype), {
                textures: new Map([['a', { width: 4 }], ['b', { width: 2 }]]),
                fbos: new Map([['a', 'fbo-a']]),
                destroyTexture(id) { destroyed.push(id); this.textures.delete(id) }
            })
            const record = backend.textures.get('a')
            assert.equal(backend.moveTexture('missing', 'b'), false, Backend.name)
            assert.equal(backend.moveTexture('a', 'b'), true, Backend.name)
            assert.equal(backend.textures.get('b'), record)
            assert.ok(!backend.textures.has('a'))
            assert.deepEqual(destroyed, ['b'], `${Backend.name}: the texture under the new id is destroyed first`)
            if (Backend === WebGL2Backend) assert.deepEqual([...backend.fbos], [['b', 'fbo-a']], 'the framebuffer moves with its texture')
        }
    })

    test('a moved upload keeps its source, and a later gamut change decodes it again under its key', () => {
        const pipeline = pipelineFor('search synth\nmedia(_id: "photo").write(o0)\nrender(o0)')
        const reuploads = []
        pipeline.backend.updateTextureFromSource = (id) => { reuploads.push(id); return { width: 8, height: 8 } }
        const upload = { width: 8, height: 8, format: 'rgba8' }
        pipeline.backend.textures.set('imageTex_step_0', upload)
        const renderer = rendererFor(pipeline)
        const source = {}
        renderer._mediaUploads = new Map([['imageTex_step_0', { source, options: {}, backend: pipeline.backend, gamut: null }]])
        // The compile that gave the step its _id: ends here: the upload's id is no longer bound.
        renderer._uploadMediaAgainForGamut(pipeline)
        assert.ok(renderer._mediaUploads.has('imageTex_step_0'), 'the record is kept while its texture lives')
        const key = renderer.keyOf('photo', 'imageTex')
        assert.equal(renderer.moveState('imageTex_step_0', key), true)
        assert.equal(renderer._mediaUploads.get(key)?.source, source)
        pipeline.graph.gamut = 'p3'
        renderer._uploadMediaAgainForGamut(pipeline)
        assert.deepEqual(reuploads, [key])
    })

    test('a move with no source record drops the record the moved texture replaces', () => {
        const pipeline = pipelineFor('search synth\nmedia(_id: "lake").write(o0)\nrender(o0)')
        const renderer = rendererFor(pipeline)
        const from = `${elementStateKey('photo', 'synth.media')}_imageTex`
        const to = renderer.keyOf('lake', 'imageTex')
        pipeline.backend.textures.set(from, { width: 8, height: 8, format: 'rgba8' })
        pipeline.backend.textures.set(to, { width: 8, height: 8, format: 'rgba8' })
        renderer._mediaUploads = new Map([[to, { source: {}, options: {}, backend: pipeline.backend, gamut: null }]])
        assert.equal(renderer.moveState(from, to), true)
        assert.ok(!renderer._mediaUploads.has(to), 'the old source no longer describes the texture under the key')
    })

    test('an element in a part body binds one key for each use', () => {
        const { graph } = compile('search synth, filter\npart t {\n  .text(_id: "title")\n}\nsolid().use(t, _id: "a").write(o0)\nsolid().use(t, _id: "b").write(o1)\nrender(o0)')
        const ids = graph.mediaSteps.map(s => s.textureId)
        assert.equal(new Set(ids).size, 2, ids.join(', '))
        assert.ok(ids.every(id => id.endsWith('@filter.text_textTex')), ids.join(', '))
    })

    test('and refuses an id with no upload, or another state', () => {
        const pipeline = pipelineFor('search synth\nmedia(_id: "photo").write(o0)\nrender(o0)')
        const renderer = rendererFor(pipeline)
        const key = renderer.keyOf('photo', 'imageTex')
        assert.equal(renderer.moveState('imageTex_step_0', key), false, 'nothing was uploaded')
        pipeline.backend.textures.set('textTex_step_0', { width: 8, height: 8, format: 'rgba8' })
        assert.equal(renderer.moveState('textTex_step_0', key), false, 'a text texture is not this media texture')
    })
})
