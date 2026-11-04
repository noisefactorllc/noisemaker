#!/usr/bin/env node
/*
 * Regression test: a built-in mesh request resolves against the right base in
 * every mode.
 *
 * 62e6c21 replaced the shaders/share symlink with a UIController.meshBasePath
 * option: the source-tree demo points it at the repository root, bundle mode
 * points it at the shader base, and a host that passes neither keeps the
 * renderer's basePath (or the historical '../../shaders' fallback). A wrong
 * resolution loads no mesh and renders blank.
 *
 * Usage: node shaders/tests/test_demo_mesh_base_path.mjs
 */

import assert from 'node:assert/strict'
import { UIController } from '../../demo/shaders/lib/demo-ui.js'

async function capture(meshBasePath, rendererBasePath, relativePath) {
    const requested = []
    const ui = Object.assign(Object.create(UIController.prototype), {
        _meshBasePath: meshBasePath,
        _renderer: {
            _basePath: rendererBasePath,
            loadOBJFromURL: async (url) => {
                requested.push(url)
                return { success: true, vertexCount: 8 }
            },
        },
        _meshInputs: new Map([[0, { meshId: 'mesh0', loaded: false, vertexCount: 0, statusEl: { textContent: '' } }]]),
    })
    await ui._loadBuiltinMesh(0, 'sphere', relativePath)
    assert.equal(requested.length, 1, 'the load requests exactly one URL')
    return requested[0]
}

// Source-tree demo: meshBasePath points at the repository root.
assert.equal(
    await capture('https://example.test/noisemaker', 'https://example.test/noisemaker/shaders', 'share/meshes/sphere.obj'),
    'https://example.test/noisemaker/share/meshes/sphere.obj',
    'source mode resolves built-in meshes against meshBasePath')
console.log('PASS source mode resolves built-in meshes against meshBasePath')

// Bundle mode: the demo passes the shader base as meshBasePath.
assert.equal(
    await capture('https://example.test/lib/shaders', 'https://example.test/lib/shaders', 'share/meshes/sphere.obj'),
    'https://example.test/lib/shaders/share/meshes/sphere.obj',
    'bundle mode resolves built-in meshes against the shader base')
console.log('PASS bundle mode resolves built-in meshes against the shader base')

// A host that passes no meshBasePath keeps the renderer's basePath.
assert.equal(
    await capture(undefined, 'https://example.test/dist/shaders', 'share/meshes/sphere.obj'),
    'https://example.test/dist/shaders/share/meshes/sphere.obj',
    'without meshBasePath the renderer basePath resolves built-in meshes')
console.log('PASS without meshBasePath the renderer basePath resolves built-in meshes')

// The historical default keeps working when no base exists at all.
assert.equal(
    await capture(undefined, undefined, 'share/meshes/sphere.obj'),
    '../../shaders/share/meshes/sphere.obj',
    'with no base at all the historical default resolves built-in meshes')
console.log('PASS with no base at all the historical default resolves built-in meshes')

console.log('All built-in mesh base path resolution tests passed')
