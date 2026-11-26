#!/usr/bin/env node
// Portable packages as files (shaders/src/portable/package.js), with no GPU:
// the file map and its paths, ZIP archives, split GLSL stages, backend
// coverage, assets kept byte-exact, and a refused package leaving every
// registry as it was. The render fixtures are in test_portable_package_render.mjs.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { CanvasRenderer, getEffect } from '../src/index.js'
import { INERT_PASS_KEYS, PASS_KEYS, RESOURCE_FORMS } from '../src/portable/grammar.js'
import { fileMapFromZip, loadPortablePackage, normalizePackagePath, packageFiles } from '../src/portable/package.js'

const FORMS = JSON.parse(fs.readFileSync(new URL('./fixtures/portable/package-forms.json', import.meta.url), 'utf8'))

const FRAGMENT = '#version 300 es\nprecision highp float;\nout vec4 fragColor;\nvoid main() { fragColor = vec4(1.0); }\n'
const VERTEX = '#version 300 es\nvoid main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }\n'
const WGSL = '@fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }\n'

function v2(func, passes = { main: { program: 'main', inputs: {}, outputs: { fragColor: 'outputTex' } } }, extra = {}) {
    return { format: 'noisemaker-portable-effect', version: 2, name: func, func, passes, ...extra }
}
function files(entries) {
    return new Map(Object.entries(entries).map(([path, content]) =>
        [path, typeof content === 'object' && !(content instanceof Uint8Array) ? JSON.stringify(content) : content]))
}
const codes = result => result.diagnostics.map(entry => entry.code)
const refused = (result, code, path) => {
    assert.equal(result.definition, null)
    assert.ok(result.diagnostics.some(entry => entry.code === code && (path === undefined || entry.path === path)),
        `${code} ${path ?? ''}: ${JSON.stringify(result.diagnostics)}`)
}

// A ZIP writer for the tests: stored or deflated entries, with each record as
// APPNOTE.TXT gives it. Options let a test damage or mark one entry.
const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
})
function crc32(bytes) {
    let crc = 0xffffffff
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
}
async function deflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
}
async function zip(entries) {
    const encoder = new TextEncoder()
    const parts = []
    const central = []
    let offset = 0
    for (const entry of entries) {
        const name = encoder.encode(entry.name)
        const content = typeof entry.content === 'string' ? encoder.encode(entry.content) : (entry.content ?? new Uint8Array())
        const method = entry.method ?? 8
        const body = method === 8 ? await deflate(content) : content
        const crc = entry.crc ?? crc32(content)
        const flags = (entry.flags ?? 0) | 0x800
        const local = new DataView(new ArrayBuffer(30))
        local.setUint32(0, 0x04034b50, true)
        local.setUint16(4, 20, true)
        local.setUint16(6, flags, true)
        local.setUint16(8, method, true)
        local.setUint32(14, crc, true)
        local.setUint32(18, body.length, true)
        local.setUint32(22, content.length, true)
        local.setUint16(26, name.length, true)
        parts.push(new Uint8Array(local.buffer), name, body)
        const record = new DataView(new ArrayBuffer(46))
        record.setUint32(0, 0x02014b50, true)
        record.setUint16(4, (entry.madeBy ?? 3) << 8 | 20, true)
        record.setUint16(6, 20, true)
        record.setUint16(8, flags, true)
        record.setUint16(10, method, true)
        record.setUint32(16, crc, true)
        record.setUint32(20, body.length, true)
        record.setUint32(24, entry.size ?? content.length, true)
        record.setUint16(28, name.length, true)
        record.setUint32(38, (entry.mode ?? 0o100644) << 16 >>> 0, true)
        record.setUint32(42, offset, true)
        central.push(new Uint8Array(record.buffer), name)
        offset += 30 + name.length + body.length
    }
    const centralSize = central.reduce((sum, part) => sum + part.length, 0)
    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, 0x06054b50, true)
    end.setUint16(8, entries.length, true)
    end.setUint16(10, entries.length, true)
    end.setUint32(12, centralSize, true)
    end.setUint32(16, offset, true)
    const all = [...parts, ...central, new Uint8Array(end.buffer)]
    const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0))
    let at = 0
    for (const part of all) { out.set(part, at); at += part.length }
    return out
}

test('package paths are relative and normal: traversal, absolute paths and control characters are refused', () => {
    assert.equal(normalizePackagePath('glsl/main.glsl'), 'glsl/main.glsl')
    assert.equal(normalizePackagePath('./glsl/./main.glsl'), 'glsl/main.glsl')
    assert.equal(normalizePackagePath('glsl\\main.glsl'), 'glsl/main.glsl')
    assert.equal(normalizePackagePath('assets/cafe\u0301.bin'), 'assets/caf\u00e9.bin', 'names compare in Unicode NFC')
    for (const path of ['../definition.json', 'glsl/../../x', '/etc/passwd', 'C:/x', 'c:x', 'glsl//main.glsl', '', '.', 'a\u0000b', 'a\nb']) {
        assert.equal(normalizePackagePath(path), null, JSON.stringify(path))
    }
})

test('a file map with a traversing path, or two paths for one file, is refused', () => {
    const base = { 'definition.json': v2('pathCheck'), 'glsl/main.glsl': FRAGMENT }
    refused(loadPortablePackage(files({ ...base, '../escape.bin': 'x' })), 'invalid-path', '../escape.bin')
    refused(loadPortablePackage(files({ ...base, './glsl/main.glsl': FRAGMENT })), 'duplicate-path')
    refused(loadPortablePackage(files({ ...base, 'GLSL/main.glsl': FRAGMENT })), 'duplicate-path',
        undefined, 'paths that differ only in case would overwrite each other on a disk')
    refused(loadPortablePackage(files({ ...base, 'assets/a.bin': 42 })), 'invalid-file', 'assets/a.bin')
    refused(loadPortablePackage(null), 'not-a-file-map')
})

test('a package holds definition.json as UTF-8 JSON at its root', () => {
    refused(loadPortablePackage(files({ 'effect/definition.json': v2('nested'), 'glsl/main.glsl': FRAGMENT })), 'missing-file', 'definition.json')
    refused(loadPortablePackage(files({ 'definition.json': '{ "name": ', 'glsl/main.glsl': FRAGMENT })), 'invalid-json', 'definition.json')
    refused(loadPortablePackage(files({ 'definition.json': new Uint8Array([0xff, 0xfe, 0x7b]), 'glsl/main.glsl': FRAGMENT })), 'invalid-encoding', 'definition.json')
    refused(loadPortablePackage(files({ 'definition.json': v2('badStage'), 'glsl/main.glsl': new Uint8Array([0xc3, 0x28]) })), 'invalid-encoding', 'glsl/main.glsl')
    refused(loadPortablePackage(files({ 'definition.json': v2('noPasses', {}) })), 'invalid-passes', 'passes')
    const legacyNoPasses = loadPortablePackage(files({ 'definition.json': { name: 'legacyBare', func: 'legacyBare' }, 'glsl/legacyBare.glsl': FRAGMENT }))
    refused(legacyNoPasses, 'missing-field', 'passes')
    refused(loadPortablePackage(files({ 'definition.json': v2('declared', undefined, { shaders: { main: {} } }), 'glsl/main.glsl': FRAGMENT })), 'unknown-field', 'shaders')
})

test('split GLSL stages load as vertex and fragment, the keys of the built-in loader', () => {
    const loaded = loadPortablePackage(files({
        'definition.json': v2('splitStages', { deposit: { program: 'deposit', drawMode: 'points', count: 64, inputs: {}, outputs: { fragColor: 'outputTex' } } }),
        'glsl/deposit.vert': VERTEX,
        'glsl/deposit.frag': FRAGMENT,
        'wgsl/deposit.wgsl': WGSL,
    }))
    assert.deepEqual(loaded.diagnostics, [])
    assert.equal(loaded.profile, 'v2')
    assert.equal(loaded.shaders.deposit.vertex, VERTEX)
    assert.equal(loaded.shaders.deposit.fragment, FRAGMENT)
    assert.equal(loaded.shaders.deposit.wgsl, WGSL)
    assert.equal(loaded.shaders.deposit.glsl, undefined)
})

test('a vertex stage without its fragment stage, or a combined program beside split stages, is refused', () => {
    const definition = v2('stageRules', { deposit: { program: 'deposit', inputs: {}, outputs: { fragColor: 'outputTex' } } })
    const missingFragment = loadPortablePackage(files({ 'definition.json': definition, 'glsl/deposit.vert': VERTEX, 'wgsl/deposit.wgsl': WGSL }))
    refused(missingFragment, 'missing-stage', 'shaders/deposit')
    assert.match(missingFragment.diagnostics[0].path, /deposit/)
    refused(loadPortablePackage(files({ 'definition.json': definition, 'glsl/deposit.glsl': FRAGMENT, 'glsl/deposit.frag': FRAGMENT })), 'duplicate-stage', 'shaders/deposit')
    refused(loadPortablePackage(files({ 'definition.json': definition, 'glsl/other.glsl': FRAGMENT })), 'missing-shader', 'shaders/deposit')
})

test('one complete language covers every program; with a backend, that backend\'s language must', () => {
    const definition = v2('coverage', {
        first: { program: 'first', inputs: {}, outputs: { fragColor: 'tmp' } },
        second: { program: 'second', inputs: { inputTex: 'tmp' }, outputs: { fragColor: 'outputTex' } },
    }, { textures: { tmp: { width: 'screen', height: 'screen', format: 'rgba16f' } } })
    const glslOnly = files({ 'definition.json': definition, 'glsl/first.glsl': FRAGMENT, 'glsl/second.frag': FRAGMENT })
    assert.deepEqual(codes(loadPortablePackage(glslOnly)), [], 'a GLSL-only package is valid: third-party packages need one language')
    assert.deepEqual(codes(loadPortablePackage(glslOnly, { backend: 'webgl2' })), [])
    refused(loadPortablePackage(glslOnly, { backend: 'webgpu' }), 'missing-backend', 'shaders/first')

    const partialSecond = files({ 'definition.json': definition, 'glsl/first.glsl': FRAGMENT, 'glsl/second.glsl': FRAGMENT, 'wgsl/first.wgsl': WGSL })
    refused(loadPortablePackage(partialSecond), 'incomplete-language', 'shaders/second')
    refused(loadPortablePackage(partialSecond, { backend: 'webgl2' }), 'incomplete-language', 'shaders/second',
        'a language given for only some programs is refused, as registration refuses it')
    refused(loadPortablePackage(partialSecond, { backend: 'webgpu' }), 'missing-backend', 'shaders/second')
    refused(loadPortablePackage(glslOnly, { backend: 'metal' }), 'unsupported-backend')

    const legacy = files({ 'definition.json': { name: 'legacyWgsl', func: 'legacyWgsl', passes: [{ program: 'main', inputs: {}, outputs: { fragColor: 'outputTex' } }] }, 'wgsl/main.wgsl': WGSL })
    const loaded = loadPortablePackage(legacy, { backend: 'webgpu' })
    assert.deepEqual(codes(loaded), [], 'a legacy WGSL-only package loads for WebGPU')
    assert.equal(loaded.profile, 'legacy')
    refused(loadPortablePackage(legacy, { backend: 'webgl2' }), 'missing-backend', 'shaders/main')
})

test('assets and every other file survive loading and packaging byte for byte', () => {
    const binary = Uint8Array.from({ length: 512 }, (_, index) => (index * 167 + 13) & 0xff)
    const mesh = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'
    const source = files({
        'definition.json': v2('assetKeeper'),
        'glsl/main.glsl': FRAGMENT,
        'wgsl/main.wgsl': WGSL,
        'help.md': '# Asset keeper\n',
        'assets/lut.bin': binary,
        'assets/mesh.obj': mesh,
        'glsl/unused.glsl': FRAGMENT,
    })
    const loaded = loadPortablePackage(source)
    assert.deepEqual(loaded.diagnostics, [])
    assert.deepEqual([...loaded.assets.get('assets/lut.bin')], [...binary])
    assert.equal(new TextDecoder().decode(loaded.assets.get('assets/mesh.obj')), mesh)
    assert.equal(loaded.help, '# Asset keeper\n')
    assert.equal(loaded.shaders.unused.glsl, FRAGMENT, 'a program no pass runs is kept with the package')
    const exported = packageFiles(loaded)
    assert.deepEqual([...exported.keys()], [...source.keys()])
    for (const [path, content] of source) {
        const expected = typeof content === 'string' ? new TextEncoder().encode(content) : content
        assert.deepEqual([...exported.get(path)], [...expected], path)
    }
    exported.get('assets/lut.bin')[0] ^= 0xff
    assert.equal(loaded.files.get('assets/lut.bin')[0], binary[0], 'the export is a copy')
    assert.deepEqual(codes(loadPortablePackage(exported)), [], 'an export loads again')
})

test('a ZIP archive reads into the same file map, stored or deflated', async () => {
    const binary = Uint8Array.from({ length: 300 }, (_, index) => (index * 31) & 0xff)
    const entries = [
        { name: 'definition.json', content: JSON.stringify(v2('zipped')) },
        { name: 'glsl/', method: 0, mode: 0o40755 },
        { name: 'glsl/main.glsl', content: FRAGMENT },
        { name: 'wgsl/main.wgsl', content: WGSL, method: 0 },
        { name: 'assets/data.bin', content: binary },
        { name: '__MACOSX/._definition.json', content: 'resource fork' },
        { name: 'assets/.DS_Store', content: 'finder' },
    ]
    const read = await fileMapFromZip(await zip(entries))
    assert.deepEqual(read.diagnostics, [])
    assert.deepEqual([...read.files.keys()], ['definition.json', 'glsl/main.glsl', 'wgsl/main.wgsl', 'assets/data.bin'])
    assert.deepEqual([...read.files.get('assets/data.bin')], [...binary])
    const loaded = loadPortablePackage(read.files, { backend: 'webgpu' })
    assert.deepEqual(loaded.diagnostics, [])
    assert.equal(loaded.shaders.main.glsl, FRAGMENT)
})

test('a ZIP archive is refused for encryption, ZIP64, traversal, duplicate paths, links and damage', async () => {
    const definition = { name: 'definition.json', content: JSON.stringify(v2('zipRefusal')) }
    const shader = { name: 'glsl/main.glsl', content: FRAGMENT }
    const refusedZip = async (entries, code, mutate) => {
        let bytes = await zip(entries)
        if (mutate) bytes = mutate(bytes)
        const read = await fileMapFromZip(bytes)
        assert.equal(read.files, null, code)
        assert.ok(read.diagnostics.some(entry => entry.code === code), `${code}: ${JSON.stringify(read.diagnostics)}`)
    }
    await refusedZip([definition, { ...shader, flags: 0x1 }], 'encrypted-entry')
    await refusedZip([definition, shader], 'unsupported-archive', bytes => {
        const out = new Uint8Array(bytes.length + 20)
        out.set(bytes.subarray(0, bytes.length - 22))
        new DataView(out.buffer).setUint32(bytes.length - 22, 0x07064b50, true)
        out.set(bytes.subarray(bytes.length - 22), bytes.length - 2)
        return out
    })
    await refusedZip([definition, { ...shader, size: 0xffffffff }], 'unsupported-archive')
    await refusedZip([definition, { name: '../evil.glsl', content: FRAGMENT }], 'invalid-path')
    await refusedZip([definition, { name: '/abs/main.glsl', content: FRAGMENT }], 'invalid-path')
    await refusedZip([definition, shader, { ...shader, method: 0 }], 'duplicate-path')
    await refusedZip([definition, shader, { name: 'glsl\\main.glsl', content: FRAGMENT }], 'duplicate-path')
    await refusedZip([definition, { name: 'glsl/main.glsl', content: 'definition.json', mode: 0o120777, method: 0 }], 'link-entry')
    await refusedZip([definition, { ...shader, method: 12 }], 'unsupported-compression')
    await refusedZip([definition, { ...shader, crc: 1 }], 'damaged-archive')
    await refusedZip([definition, shader], 'damaged-archive', bytes => bytes.subarray(0, bytes.length - 5))
    const read = await fileMapFromZip('not bytes')
    assert.equal(read.diagnostics[0].code, 'not-an-archive')
})

test('registration refuses a package before any registry changes when the backend lacks its language', async () => {
    const renderer = new CanvasRenderer()
    assert.equal(renderer.backend, 'glsl')
    const wgslOnly = { ...v2('wgslOnlyHere'), shaders: { main: { wgsl: WGSL } } }
    await assert.rejects(renderer.registerPortableEffect(wgslOnly), error => {
        assert.deepEqual(error.diagnostics?.map(entry => [entry.code, entry.path]), [['missing-backend', 'shaders/main']])
        return true
    })
    assert.equal(getEffect('user.wgslOnlyHere'), undefined)
    assert.equal(getEffect('user/wgslOnlyHere'), undefined)

    const split = { ...v2('splitRegistered'), shaders: { main: { vertex: VERTEX, fragment: FRAGMENT } } }
    const effect = await renderer.registerPortableEffect(split)
    assert.equal(effect.instance.shaders.main.vertex, VERTEX)
    assert.equal(getEffect('user.splitRegistered'), effect.instance)

    await assert.rejects(renderer.registerPortableEffect({ ...v2('combinedAndSplit'), shaders: { main: { glsl: FRAGMENT, fragment: FRAGMENT } } }),
        error => error.diagnostics?.[0]?.code === 'duplicate-stage')
    await assert.rejects(renderer.registerPortableEffect({ ...v2('vertexAlone'), shaders: { main: { vertex: VERTEX, wgsl: WGSL } } }),
        error => error.diagnostics?.[0]?.code === 'missing-stage')
    assert.equal(getEffect('user.combinedAndSplit'), undefined)
    assert.equal(getEffect('user.vertexAlone'), undefined)
})

test('a loaded package registers through registerPortableEffect', async () => {
    const loaded = loadPortablePackage(files({
        'definition.json': v2('loadedThenRegistered'),
        'glsl/main.vert': VERTEX,
        'glsl/main.frag': FRAGMENT,
    }), { backend: 'webgl2' })
    assert.deepEqual(loaded.diagnostics, [])
    const effect = await new CanvasRenderer().registerPortableEffect({ ...loaded.definition, shaders: loaded.shaders })
    assert.equal(getEffect('user.loadedThenRegistered'), effect.instance)
    assert.equal(effect.instance.shaders.main.fragment, FRAGMENT)
})

// The fixtures of package-forms.json as file maps, with minimal sources for
// the stage files each one names.
function fixtureFiles(fixture) {
    const map = new Map([['definition.json', JSON.stringify({
        format: 'noisemaker-portable-effect', version: 2,
        name: fixture.id.replace(/-(.)/g, (_, c) => c.toUpperCase()),
        func: fixture.id.replace(/-(.)/g, (_, c) => c.toUpperCase()),
        ...fixture.definition,
    })]])
    const sources = { glsl: ['glsl', '.glsl', FRAGMENT], vertex: ['glsl', '.vert', VERTEX], fragment: ['glsl', '.frag', FRAGMENT], wgsl: ['wgsl', '.wgsl', WGSL] }
    for (const [program, stages] of Object.entries(fixture.shaders)) {
        for (const stage of stages) {
            const [directory, extension, source] = sources[stage]
            map.set(`${directory}/${program}${extension}`, source)
        }
    }
    return map
}

test('every pass property and every resource form of the grammar has a positive and a negative fixture', () => {
    const covered = { positive: new Set(), negative: new Set() }
    const known = new Set([...PASS_KEYS.map(key => `pass:${key}`), ...RESOURCE_FORMS.map(form => `resource:${form}`)])
    const ids = new Set()
    for (const fixture of FORMS.fixtures) {
        assert.ok(!ids.has(fixture.id), `fixture ${fixture.id} is listed twice`)
        ids.add(fixture.id)
        assert.ok(['positive', 'negative'].includes(fixture.kind), fixture.id)
        for (const entry of fixture.covers) {
            assert.ok(known.has(entry), `${fixture.id} covers ${entry}, which the grammar does not list`)
            covered[fixture.kind].add(entry)
        }
    }
    // A field that has no effect is refused in version 2, so its fixture is a refusal.
    const inert = new Set(INERT_PASS_KEYS.map(key => `pass:${key}`))
    for (const entry of known) {
        if (!inert.has(entry)) assert.ok(covered.positive.has(entry), `${entry} has no positive fixture`)
        assert.ok(covered.negative.has(entry), `${entry} has no negative fixture`)
    }
    for (const entry of inert) {
        assert.ok(!covered.positive.has(entry), `${entry} has no effect, so no version 2 package may declare it`)
        assert.ok(FORMS.fixtures.some(fixture => fixture.covers.includes(entry) && fixture.expect?.code === 'unsupported-field'), entry)
    }
})

for (const fixture of FORMS.fixtures) {
    test(`fixture ${fixture.id} (${fixture.kind}: ${fixture.covers.join(', ')})`, async () => {
        const loaded = loadPortablePackage(fixtureFiles(fixture))
        if (fixture.kind === 'negative') {
            refused(loaded, fixture.expect.code, fixture.expect.path)
            return
        }
        assert.deepEqual(loaded.diagnostics, [])
        const effect = await new CanvasRenderer().registerPortableEffect({ ...loaded.definition, shaders: loaded.shaders })
        assert.equal(getEffect(`user.${loaded.definition.func}`), effect.instance)
        assert.deepEqual(Object.keys(effect.instance.shaders), Object.keys(fixture.shaders))
    })
}
