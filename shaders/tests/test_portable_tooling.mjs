// Portable's developer tools in Noisemaker. The relocation map
// (shaders/tests/fixtures/portable/relocation-map.json) lists every path of
// Portable's tree at its recorded SHA, `git ls-tree -r --name-only <sha>`, each
// with its Noisemaker destination or the reason it has none. The vendored
// shade-mcp tree is one entry, vendor/shade-mcp/, because Noisemaker vendors
// shade-mcp itself and each shade-mcp release changes those paths.
//
// The catalog reader and the generated definition.js modules
// (scripts/lib/portable-catalog.mjs, scripts/migrate-portable-effects.mjs)
// are checked on the catalog itself and on a mixed fixture catalog
// (shaders/tests/fixtures/portable/catalog/): a version 2 definition.json with
// its generated module, which holds every field and pass control the reduced
// Shade projection used to drop, and a legacy definition.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import {
    EFFECTS_ROOT, baselineExportShapes, definedMethods, generateWrapper, instantiateCatalogDefinition,
    readDefinitionJson, readPortableCatalog,
} from '../../scripts/lib/portable-catalog.mjs'
import { convertEffects, wrapperDrift } from '../../scripts/migrate-portable-effects.mjs'
import { toPortablePackage } from '../src/portable/definition.js'
import { capabilityUseOf } from '../src/portable/capabilities.js'
import { auditSchemaLoss, definitionSchema, loadCompleteDefinition, loadUpstreamProjection } from './definition-schema.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'shaders/tests/fixtures/portable/relocation-map.json'), 'utf8'))
const FIXTURE_CATALOG = path.join(ROOT, 'shaders/tests/fixtures/portable/catalog')
const FIXTURE_VOLUME = path.join(FIXTURE_CATALOG, 'filter3d/fixtureVolume')
const FIXTURE_SHAPES = new Map([['filter3d/fixtureVolume', { exportKind: 'instance' }]])
const EFFECT_JS = pathToFileURL(path.join(ROOT, 'shaders/src/runtime/effect.js')).href

// A copy of a fixture effect under a temporary catalog root, as <root>/<id>/.
function copyEffect(root, id, from) {
    const to = path.join(root, ...id.split('/'))
    fs.cpSync(from, to, { recursive: true })
    return to
}

// Import a generated module as the runtime would, with its imports of the
// engine pointed at this checkout from wherever the module is written.
async function importGenerated(text, dir) {
    const file = path.join(dir, `generated-${process.hrtime.bigint()}.mjs`)
    fs.writeFileSync(file, text.replace(/'\.\.\/\.\.\/\.\.\/src\/([^']+)'/g,
        (_, relative) => JSON.stringify(pathToFileURL(path.join(ROOT, 'shaders/src', relative)).href)))
    const exported = (await import(pathToFileURL(file).href)).default
    return typeof exported === 'function' ? new exported() : exported
}

test('the relocation map gives every Portable path a destination that exists, or the reason it has none', () => {
    assert.equal(MAP.source?.repository, 'https://github.com/noisefactorllc/portable')
    assert.match(MAP.source?.sha ?? '', /^[0-9a-f]{40}$/, 'the map records the Portable commit its paths are from')
    const entries = Object.entries(MAP.paths ?? {})
    assert.ok(entries.length > 0, 'the map lists paths')
    const problems = []
    for (const [source, entry] of entries) {
        const keys = Object.keys(entry ?? {}).sort()
        if (keys.length !== 1 || !['destination', 'reason'].includes(keys[0])) {
            problems.push(`${source}: has ${JSON.stringify(keys)}, not one destination or one reason`)
            continue
        }
        const value = entry[keys[0]]
        if (typeof value !== 'string' || value.trim() === '') {
            problems.push(`${source}: its ${keys[0]} is empty`)
            continue
        }
        if (keys[0] === 'destination') {
            const target = path.join(ROOT, value)
            const stat = fs.existsSync(target) ? fs.statSync(target) : null
            if (!stat) problems.push(`${source}: its destination ${value} does not exist`)
            else if (value.endsWith('/') ? !stat.isDirectory() : !stat.isFile()) {
                problems.push(`${source}: its destination ${value} is not a ${value.endsWith('/') ? 'directory' : 'file'}`)
            }
        }
    }
    assert.deepEqual(problems, [])
})

test('the relocation map holds the paths that other repositories consume, and Portable\'s workflows', () => {
    const paths = Object.keys(MAP.paths)
    // shade-mcp's CI reads the starter effect and the two-effect workspace.
    for (const file of ['definition.json', 'help.md', 'glsl/gradientSweep.glsl', 'wgsl/gradientSweep.wgsl']) {
        assert.ok(paths.includes(`effect/${file}`), `effect/${file}`)
    }
    assert.ok(paths.includes('fixtures/two-effect-workspace.json'))
    for (const workflow of ['pull-shade-mcp.yml', 'release-notify.yml', 'docs.yml', 'test.yml', 'dependabot-auto-merge.yml']) {
        assert.ok(paths.includes(`.github/workflows/${workflow}`), workflow)
    }
    assert.ok(paths.includes('.github/dependabot.yml'))
    const vendored = paths.filter(file => file.startsWith('vendor/'))
    assert.deepEqual(vendored, ['vendor/shade-mcp/'], 'the vendored tree is one entry')
})

test('the catalog reader reads a definition.json first, and a legacy definition.js only when allowed and listed', async () => {
    const entries = await readPortableCatalog({ effectsRoot: FIXTURE_CATALOG, allowLegacyCatalog: true, legacyIds: ['synth/fixtureLegacy'], exportShapes: FIXTURE_SHAPES })
    assert.deepEqual(entries.map(entry => [entry.effectId, entry.source, entry.exportKind]),
        [['filter3d/fixtureVolume', 'json', 'instance'], ['synth/fixtureLegacy', 'legacy', 'instance']], 'sorted by ID')
    const volume = entries[0]
    for (const field of ['textures', 'outputTex3d', 'outputGeo', 'uniformLayout', 'uniformLayouts', 'defaultProgram']) {
        assert.ok(volume.definition[field] !== undefined, `the JSON effect's metadata keeps ${field}`)
    }
    assert.deepEqual(Object.keys(volume.shaders).sort(), ['fill', 'splat'])
    await assert.rejects(() => readPortableCatalog({ effectsRoot: FIXTURE_CATALOG, exportShapes: FIXTURE_SHAPES }),
        /synth\/fixtureLegacy: has no definition\.json, and the legacy catalog is not allowed/)
    await assert.rejects(() => readPortableCatalog({ effectsRoot: FIXTURE_CATALOG, allowLegacyCatalog: true, legacyIds: [], exportShapes: FIXTURE_SHAPES }),
        /synth\/fixtureLegacy: its definition\.js is not one of the catalog's own, so it is not run/)
    const catalog = await readPortableCatalog({ allowLegacyCatalog: true })
    assert.deepEqual(catalog.map(entry => entry.effectId), baselineExportShapes().effectIds.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        'the repository catalog reads as the baseline lists it')
})

test('a definition.js beside a definition.json must be the module generated from it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-catalog-'))
    try {
        const dir = copyEffect(root, 'filter3d/fixtureVolume', FIXTURE_VOLUME)
        assert.deepEqual(wrapperDrift({ effectsRoot: root, shapes: FIXTURE_SHAPES }), [], 'the fixture module is current')
        await readPortableCatalog({ effectsRoot: root, exportShapes: FIXTURE_SHAPES })
        fs.appendFileSync(path.join(dir, 'definition.js'), '// an edit by hand\n')
        assert.deepEqual(wrapperDrift({ effectsRoot: root, shapes: FIXTURE_SHAPES }).map(entry => entry.effectId), ['filter3d/fixtureVolume'])
        await assert.rejects(() => readPortableCatalog({ effectsRoot: root, exportShapes: FIXTURE_SHAPES }),
            /filter3d\/fixtureVolume: definition\.js is not the module generated from definition\.json/)
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('the generated module of a definition embeds it as a literal, imports no JSON, and exports the effect the reader reads', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-generated-'))
    try {
        const read = readDefinitionJson(FIXTURE_VOLUME)
        assert.deepEqual(read.diagnostics, [])
        for (const exportKind of ['instance', 'class']) {
            const shape = { exportKind, className: exportKind === 'class' ? 'FixtureVolume' : undefined }
            const text = generateWrapper({ definition: read.definition, ...shape })
            assert.doesNotMatch(text, /\.json['"]|with\s*\{\s*type/, 'no JSON module is imported')
            const instance = await importGenerated(text, root)
            assert.equal(exportKind === 'class' ? Object.getPrototypeOf(instance).constructor.name : 'Effect', exportKind === 'class' ? 'FixtureVolume' : instance.constructor.name)
            assert.deepEqual(definitionSchema(instance), definitionSchema(instantiateCatalogDefinition({ definition: read.definition, ...shape })), `${exportKind}: the module and the reader agree`)
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('each catalog effect that converts reads the same from its version 2 JSON as from its definition.js', async () => {
    const { shapes, effectIds } = baselineExportShapes()
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-convert-'))
    const refused = {}
    try {
        for (const id of effectIds) {
            const dir = path.join(EFFECTS_ROOT, ...id.split('/'))
            const exported = (await import(pathToFileURL(path.join(dir, 'definition.js')).href)).default
            const instance = typeof exported === 'function' ? new exported() : exported
            if (definedMethods(instance).length) { refused[id] = 'methods'; continue }
            const before = definitionSchema(instance)
            const out = path.join(root, ...id.split('/'))
            fs.mkdirSync(out, { recursive: true })
            for (const language of ['glsl', 'wgsl']) {
                if (fs.existsSync(path.join(dir, language))) fs.cpSync(path.join(dir, language), path.join(out, language), { recursive: true })
            }
            const json = toPortablePackage(structuredClone(before))
            if (before.paramAliases !== undefined) json.paramAliases = before.paramAliases
            fs.writeFileSync(path.join(out, 'definition.json'), JSON.stringify(json, null, 4))
            const read = readDefinitionJson(out, { catalog: true })
            if (read.diagnostics.length) { refused[id] = 'does not load'; continue }
            const after = definitionSchema(instantiateCatalogDefinition({ definition: read.definition, ...shapes.get(id) }))
            if (!isDeepStrictEqual(after, before)) {
                refused[id] = Object.keys({ ...before, ...after }).filter(key => !isDeepStrictEqual(before[key], after[key])).sort().join(',')
                continue
            }
            const generated = await importGenerated(generateWrapper({ definition: read.definition, ...shapes.get(id) }), out)
            assert.deepEqual(definitionSchema(generated), before, `${id}: its generated module exports the same effect`)
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
    // What a definition.json cannot hold yet: provider behavior in class
    // methods, and filter/text's id field (GAP-085,
    // https://github.com/noisefactorllc/noisemaker/issues/441).
    assert.deepEqual(refused, {
        'filter/fibers': 'methods',
        'filter/scratches': 'methods',
        'filter/strayHair': 'methods',
        'filter/text': 'id',
        'synth/media': 'methods',
    })
})

test('the particle effects convert with their deprecated parameter names, which only the catalog context accepts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-aliases-'))
    try {
        // A copy of the engine's source beside the effects, as their modules import it.
        fs.cpSync(path.join(ROOT, 'shaders/src'), path.join(root, 'shaders/src'), { recursive: true })
        const effectsRoot = path.join(root, 'shaders/effects')
        const ids = ['points/dla', 'points/flow', 'points/physarum']
        const before = {}
        for (const id of ids) {
            copyEffect(effectsRoot, id, path.join(EFFECTS_ROOT, ...id.split('/')))
            const exported = (await import(pathToFileURL(path.join(EFFECTS_ROOT, ...id.split('/'), 'definition.js')).href)).default
            before[id] = definitionSchema(typeof exported === 'function' ? new exported() : exported)
            assert.deepEqual(before[id].paramAliases, { fieldTex: 'heightTex' }, `${id} keeps saved programs that name fieldTex working`)
        }
        const { shapes } = baselineExportShapes()
        assert.deepEqual(await convertEffects(ids, { effectsRoot, shapes }), ids)
        for (const id of ids) {
            const dir = path.join(effectsRoot, ...id.split('/'))
            const json = JSON.parse(fs.readFileSync(path.join(dir, 'definition.json'), 'utf8'))
            assert.equal(json.version, 2)
            assert.deepEqual(json.paramAliases, { fieldTex: 'heightTex' }, `${id}: the JSON carries the alias`)
            const exported = (await import(pathToFileURL(path.join(dir, 'definition.js')).href)).default
            assert.deepEqual(definitionSchema(typeof exported === 'function' ? new exported() : exported), before[id], `${id}: the generated module is the same effect, aliases included`)
            assert.deepEqual(readDefinitionJson(dir).diagnostics.map(entry => `${entry.code}@${entry.path}`), ['unsupported-field@paramAliases'],
                `${id}: as a package from anyone else, it is refused for the alias`)
        }
        assert.deepEqual(wrapperDrift({ effectsRoot, shapes }), [])
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('the generated module of an effect that declares capabilities has the legacy class, methods, fields and capability use', async () => {
    // The version 2 packages of the four built-ins whose behavior is a
    // provider's, from the provider pin check, read as catalog definitions in
    // their own namespaces. The catalog itself is not converted.
    const { shapes } = baselineExportShapes()
    const chain = value => {
        const names = []
        for (let proto = Object.getPrototypeOf(value); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) names.push(proto.constructor.name)
        return names
    }
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-providers-'))
    try {
        for (const [fixture, id] of [['filter-fibers', 'filter/fibers'], ['filter-scratches', 'filter/scratches'], ['filter-strayHair', 'filter/strayHair'], ['synth-media', 'synth/media']]) {
            const read = readDefinitionJson(path.join(ROOT, 'shaders/tests/fixtures/portable/providers', fixture), { catalog: true })
            assert.deepEqual(read.diagnostics, [], fixture)
            const definition = { ...read.definition, namespace: id.split('/')[0] }
            const shape = { definition, ...shapes.get(id) }
            const text = generateWrapper(shape)
            assert.doesNotMatch(text, /\.json['"]/, `${id}: no JSON module is imported`)
            const exported = (await import(pathToFileURL(path.join(EFFECTS_ROOT, ...id.split('/'), 'definition.js')).href)).default
            const generatedExport = await (async () => {
                const file = path.join(root, `${fixture}.mjs`)
                fs.writeFileSync(file, text.replace(/'\.\.\/\.\.\/\.\.\/src\/([^']+)'/g,
                    (_, relative) => JSON.stringify(pathToFileURL(path.join(ROOT, 'shaders/src', relative)).href)))
                return (await import(pathToFileURL(file).href)).default
            })()
            assert.equal(typeof generatedExport, typeof exported, `${id}: the same export kind`)
            const legacy = typeof exported === 'function' ? new exported() : exported
            const generated = typeof generatedExport === 'function' ? new generatedExport() : generatedExport
            assert.deepEqual(chain(generated), chain(legacy), `${id}: the same class chain`)
            assert.deepEqual(definedMethods(generated), definedMethods(legacy), `${id}: the same methods`)
            assert.deepEqual(definitionSchema(generated), definitionSchema(legacy), `${id}: the same fields`)
            assert.deepEqual(capabilityUseOf(generated), capabilityUseOf(legacy), `${id}: the same capability use`)
            assert.deepEqual(definitionSchema(instantiateCatalogDefinition(shape)), definitionSchema(generated), `${id}: the reader builds what the module exports`)
            assert.deepEqual(definedMethods(instantiateCatalogDefinition(shape)), definedMethods(generated))
            if (id === 'synth/media') {
                // The provider's method and hooks act on the effect as the legacy class's do.
                for (const effect of [generated, legacy]) {
                    effect.onInit()
                    effect.setMediaDimensions(320, 180)
                }
                assert.deepEqual(generated.onUpdate({}), legacy.onUpdate({}), 'media: the same uniforms after setMediaDimensions')
                assert.deepEqual(generated.state, legacy.state, 'media: the same state')
            }
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('a conversion writes a version 2 definition.json and its module, and refuses an effect whose class defines methods', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-convert-'))
    try {
        const dir = copyEffect(root, 'synth/fixtureLegacy', path.join(FIXTURE_CATALOG, 'synth/fixtureLegacy'))
        const legacyFile = path.join(dir, 'definition.js')
        fs.writeFileSync(legacyFile, fs.readFileSync(legacyFile, 'utf8').replace("'../../../../../../src/runtime/effect.js'", JSON.stringify(EFFECT_JS)))
        const shapes = new Map([['synth/fixtureLegacy', { exportKind: 'instance' }]])
        const before = definitionSchema((await import(pathToFileURL(legacyFile).href)).default)
        assert.deepEqual(await convertEffects(['synth/fixtureLegacy'], { effectsRoot: root, shapes }), ['synth/fixtureLegacy'])
        const json = JSON.parse(fs.readFileSync(path.join(dir, 'definition.json'), 'utf8'))
        assert.equal(json.format, 'noisemaker-portable-effect')
        assert.equal(json.version, 2)
        const generated = fs.readFileSync(legacyFile, 'utf8')
        assert.match(generated, /^\/\/ Generated from definition\.json/)
        assert.deepEqual(definitionSchema(await importGenerated(generated, dir)), before, 'the converted effect is the same effect')
        assert.deepEqual(wrapperDrift({ effectsRoot: root, shapes }), [])
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
    const mediaJson = path.join(EFFECTS_ROOT, 'synth/media/definition.json')
    await assert.rejects(() => convertEffects(['synth/media']), /synth\/media: its class defines onInit, onUpdate, setMediaDimensions/)
    assert.equal(fs.existsSync(mediaJson), false, 'nothing is written for a refused effect')
})

test('the complete reader keeps what the Shade projection loses, and the loss audit reports it', async () => {
    const complete = await loadCompleteDefinition(FIXTURE_VOLUME)
    const projection = await loadUpstreamProjection(FIXTURE_VOLUME)
    assert.equal(auditSchemaLoss(complete, projection).lossy, false, 'the version 2 fixture reads in full on both sides')
    const reduced = structuredClone(projection)
    delete reduced.textures
    delete reduced.passes[0].viewport
    const audit = auditSchemaLoss(complete, reduced)
    assert.ok(complete.textures && complete.passes[0].viewport, 'the complete side keeps the fields')
    assert.equal(audit.lossy, true)
    assert.deepEqual(audit.droppedTopLevelFields, ['textures'])
    assert.deepEqual(audit.truncatedPasses, [{ index: 0, droppedFields: ['viewport'] }])
})

test('Shade\'s vendored reader keeps every field of a version 2 catalog definition, and reads a 1.x definition.js as before', async () => {
    const { loadEffectDefinition } = await import('../../vendor/shade-mcp/formats/index.js')
    const declared = JSON.parse(fs.readFileSync(path.join(FIXTURE_VOLUME, 'definition.json'), 'utf8'))
    const read = await loadEffectDefinition(FIXTURE_VOLUME)
    for (const field of ['textures', 'outputTex3d', 'outputGeo', 'uniformLayout', 'uniformLayouts', 'defaultProgram']) {
        assert.deepEqual(read[field], declared[field], `${field} survives`)
    }
    for (const [name, pass] of Object.entries(declared.passes)) {
        const readPass = read.passes.find(entry => entry.name === name)
        for (const [control, value] of Object.entries(pass)) {
            assert.deepEqual(readPass?.[control], value, `pass ${name}: ${control} survives`)
        }
    }
    const projections = JSON.parse(fs.readFileSync(path.join(ROOT, 'shaders/tests/fixtures/portable/consumers/shade-projection.json'), 'utf8'))
    for (const id of ['synth/noise', 'classicNoisedeck/cellNoise', 'filter3d/flow3d']) {
        const legacy = await loadEffectDefinition(path.join(EFFECTS_ROOT, ...id.split('/')))
        const { effectDir, ...projection } = legacy
        assert.ok(effectDir, `${id} reads from its directory`)
        assert.deepEqual(JSON.parse(JSON.stringify(projection)), projections[id], `${id}: the 1.x definition.js reads as Task 1's fixture recorded it`)
    }
})
