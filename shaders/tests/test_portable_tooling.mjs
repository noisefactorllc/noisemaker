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
// Shade projection used to drop, and a legacy definition.js. The fixture's
// generated definition.js is compared as text and never imported, because its
// relative import resolves only at shaders/effects/<namespace>/<name>/.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import {
    EFFECTS_ROOT, baselineExportShapes, definedMethods, generateWrapper, instantiateCatalogDefinition,
    readCatalogMetadata, readDefinitionJson, readPortableCatalog,
} from '../../scripts/lib/portable-catalog.mjs'
import { buildManifest } from '../scripts/generate-shader-manifest.mjs'
import { convertEffects, wrapperDrift } from '../../scripts/migrate-portable-effects.mjs'
import { toPortablePackage } from '../src/portable/definition.js'
import { capabilityUseOf } from '../src/portable/capabilities.js'
import { auditSchemaLoss, definitionSchema, loadCompleteDefinition, loadUpstreamProjection } from './definition-schema.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'shaders/tests/fixtures/portable/relocation-map.json'), 'utf8'))
const FIXTURE_CATALOG = path.join(ROOT, 'shaders/tests/fixtures/portable/catalog')
const BASELINE = JSON.parse(fs.readFileSync(path.join(ROOT, 'shaders/tests/fixtures/portable/catalog-baseline.json'), 'utf8'))
const FIXTURE_VOLUME = path.join(FIXTURE_CATALOG, 'filter3d/fixtureVolume')
const FIXTURE_SHAPES = new Map([['filter3d/fixtureVolume', { exportKind: 'instance' }]])

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
    // Provider behavior in class methods remains outside the JSON declaration.
    assert.deepEqual(refused, {
        'filter/fibers': 'methods',
        'filter/scratches': 'methods',
        'filter/strayHair': 'methods',
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
            assert.deepEqual(Object.keys(generated), Object.keys(legacy), `${id}: the same own properties, in the same order`)
            assert.deepEqual(Object.keys(instantiateCatalogDefinition(shape)), Object.keys(legacy), `${id}: the reader's own properties, in the same order`)
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

// A copy of the engine's source and data beside an effects tree, as the
// effects' modules import them.
function engineTree(prefix) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    try {
        fs.cpSync(path.join(ROOT, 'shaders/src'), path.join(root, 'shaders/src'), { recursive: true })
        fs.cpSync(path.join(ROOT, 'share'), path.join(root, 'share'), { recursive: true })
    } catch (error) {
        fs.rmSync(root, { recursive: true, force: true })
        throw error
    }
    return { root, effectsRoot: path.join(root, 'shaders/effects') }
}

test('channelCombine keeps starter: false from either form, without a new key, and --convert writes it', async () => {
    const { root, effectsRoot } = engineTree('portable-starter-')
    try {
        const id = 'mixer/channelCombine'
        const dir = copyEffect(effectsRoot, id, path.join(EFFECTS_ROOT, ...id.split('/')))
        const { shapes } = baselineExportShapes()
        const recorded = BASELINE.metadata[id].definition
        const load = async () => {
            const exported = (await import(`${pathToFileURL(path.join(dir, 'definition.js')).href}?${process.hrtime.bigint()}`)).default
            return typeof exported === 'function' ? new exported() : exported
        }
        for (const form of ['legacy', 'generated']) {
            if (form === 'generated') {
                assert.deepEqual(await convertEffects([id], { effectsRoot, shapes }), [id])
                const json = JSON.parse(fs.readFileSync(path.join(dir, 'definition.json'), 'utf8'))
                assert.equal(json.starter, false, '--convert writes the declared starter')
            }
            const instance = await load()
            assert.equal(instance.starter, false, `${form}: the effect declares it is not a starter`)
            assert.ok(!Object.keys(instance).includes('starter'), `${form}: starter is not one of its own keys`)
            assert.deepEqual(definitionSchema(instance), recorded, `${form}: its schema is the baseline's`)
            assert.deepEqual(structuredClone(instance).starter, undefined, `${form}: a clone of it carries no starter`)
            assert.equal((await readCatalogMetadata(dir, { exportShapes: shapes })).starter, false, `${form}: its metadata holds starter`)
            assert.equal((await buildManifest(effectsRoot, { exportShapes: shapes }))[id].starter, false, `${form}: the manifest lists it as no starter`)
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('--convert refuses an effect whose Effect config holds a key that the effect does not keep, and names it', async () => {
    const { root, effectsRoot } = engineTree('portable-dropped-')
    try {
        const dir = copyEffect(effectsRoot, 'synth/fixtureLegacy', path.join(FIXTURE_CATALOG, 'synth/fixtureLegacy'))
        const file = path.join(dir, 'definition.js')
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
            .replace("'../../../../../../src/runtime/effect.js'", "'../../../src/runtime/effect.js'")
            .replace("    func: 'fixtureLegacy',", "    func: 'fixtureLegacy',\n    unkept: 'a key the Effect constructor does not copy',"))
        const shapes = new Map([['synth/fixtureLegacy', { exportKind: 'instance' }]])
        const before = fs.readFileSync(file, 'utf8')
        await assert.rejects(convertEffects(['synth/fixtureLegacy'], { effectsRoot, shapes }),
            /synth\/fixtureLegacy: its Effect config holds unkept, which the effect does not keep, so it is not converted/)
        assert.equal(fs.existsSync(path.join(dir, 'definition.json')), false, 'no definition.json is written')
        assert.equal(fs.readFileSync(file, 'utf8'), before, 'its definition.js is unchanged')
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('--convert refuses a module with what a definition.json does not hold, and leaves nothing behind when a read-back fails', async () => {
    const { root, effectsRoot } = engineTree('portable-shape-')
    try {
        const passes = "passes: [{ name: 'main', program: 'main', inputs: {}, outputs: { fragColor: 'outputTex' } }]"
        const legacy = path.join(FIXTURE_CATALOG, 'synth/fixtureLegacy')
        const cases = {
            // A named export beside the default one.
            'synth/namedExport': ["import { Effect } from '../../../src/runtime/effect.js'",
                `export default new Effect({ name: 'Named', namespace: 'synth', func: 'namedExport', ${passes} })`,
                'export const RECIPE = 1'],
            // A static member of an exported class.
            'synth/staticMember': ["import { Effect } from '../../../src/runtime/effect.js'",
                `export default class StaticMember extends Effect { static VERSION = 1; name = 'Static'; namespace = 'synth'; func = 'staticMember'; ${passes.replace(':', ' =')} }`],
            // An accessor, which is no method and no field.
            'synth/accessor': ["import { Effect } from '../../../src/runtime/effect.js'",
                `export default class Accessor extends Effect { name = 'Accessor'; namespace = 'synth'; func = 'accessor'; ${passes.replace(':', ' =')}; get description() { return 'computed' } }`],
            // An own property that is not enumerable.
            'synth/hiddenField': ["import { Effect } from '../../../src/runtime/effect.js'",
                `const effect = new Effect({ name: 'Hidden', namespace: 'synth', func: 'hiddenField', ${passes} })`,
                "Object.defineProperty(effect, 'secret', { value: 1, enumerable: false })",
                'export default effect'],
        }
        const expected = { 'synth/namedExport': 'RECIPE', 'synth/staticMember': 'VERSION', 'synth/accessor': 'description', 'synth/hiddenField': 'secret' }
        const shapes = new Map([
            ['synth/namedExport', { exportKind: 'instance' }],
            ['synth/staticMember', { exportKind: 'class', className: 'StaticMember' }],
            ['synth/accessor', { exportKind: 'class', className: 'Accessor' }],
            ['synth/hiddenField', { exportKind: 'instance' }],
            // An instance export recorded as a class with no name: the
            // definition.json reads back, and the module cannot be built.
            ['synth/fixtureLegacy', { exportKind: 'class' }],
        ])
        for (const [id, lines] of Object.entries(cases)) {
            const dir = path.join(effectsRoot, ...id.split('/'))
            fs.cpSync(path.join(legacy, 'glsl'), path.join(dir, 'glsl'), { recursive: true })
            fs.cpSync(path.join(legacy, 'wgsl'), path.join(dir, 'wgsl'), { recursive: true })
            fs.writeFileSync(path.join(dir, 'definition.js'), `${lines.join('\n')}\n`)
        }
        const fixture = copyEffect(effectsRoot, 'synth/fixtureLegacy', legacy)
        fs.writeFileSync(path.join(fixture, 'definition.js'), fs.readFileSync(path.join(fixture, 'definition.js'), 'utf8')
            .replace("'../../../../../../src/runtime/effect.js'", "'../../../src/runtime/effect.js'"))
        for (const id of [...Object.keys(cases), 'synth/fixtureLegacy']) {
            const dir = path.join(effectsRoot, ...id.split('/'))
            const before = fs.readFileSync(path.join(dir, 'definition.js'), 'utf8')
            const reason = expected[id] ? new RegExp(`${id}: its module has [^,]*\\b${expected[id]}\\b.*which a definition\\.json does not hold`) : /class name/
            await assert.rejects(convertEffects([id], { effectsRoot, shapes }), reason, id)
            assert.equal(fs.existsSync(path.join(dir, 'definition.json')), false, `${id}: no definition.json is left`)
            assert.equal(fs.readFileSync(path.join(dir, 'definition.js'), 'utf8'), before, `${id}: its definition.js is unchanged`)
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('the conversion and bundle-render tools refuse arguments with no value, and an empty list', () => {
    const cases = path.join(ROOT, 'shaders/tests/fixtures/portable/render-cases.json')
    const bundles = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-args-'))
    try {
        fs.mkdirSync(path.join(bundles, 'effects'))
        for (const [script, args, message] of [
            ['scripts/migrate-portable-effects.mjs', ['--convert'], /--convert needs one or more <namespace\/effect> IDs/],
            ['scripts/migrate-portable-effects.mjs', ['--convert', 'synth/noise', '--check'], /--convert and --check are separate runs/],
            ['scripts/migrate-portable-effects.mjs', ['--effects-root'], /--effects-root needs a directory/],
            ['shaders/scripts/pin-effect-pixels.mjs', ['--case', cases, '--entries', 'synth/noise', '--pins'], /--pins: no value given/],
            ['shaders/scripts/pin-effect-pixels.mjs', ['--case', cases, '--entries', ',', '--pins', bundles], /Usage:/],
            ['shaders/tests/test_portable_bundle_render.mjs', ['--bundles', bundles, '--backend', 'webgl2', '--effects', ','], /--effects needs one or more IDs/],
        ]) {
            const run = spawnSync(process.execPath, [path.join(ROOT, script), ...args], { cwd: ROOT, encoding: 'utf8' })
            assert.notEqual(run.status, 0, `${script} ${args.join(' ')} fails`)
            assert.match(`${run.stdout}${run.stderr}`, message, `${script} ${args.join(' ')}`)
            assert.doesNotMatch(`${run.stdout}${run.stderr}`, /TypeError|Regenerated|Converted/, `${script} ${args.join(' ')} does nothing`)
        }
    } finally {
        fs.rmSync(bundles, { recursive: true, force: true })
    }
})

test('the retired definition writers and readers fail on start, name the replacement, and change no file', () => {
    // Each writer would change this effect: its seed is a float, which
    // standardize-params.js makes an int, and no global maps a uniform, which
    // fix_uniform_mappings.py adds. generate_shader_manifest.py would write
    // shaders/effects/manifest.json.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-writers-'))
    try {
        for (const file of ['shaders/scripts/standardize-params.js', 'shaders/scripts/param-rename-map.js', 'scripts/fix_uniform_mappings.py', 'shaders/scripts/generate_shader_manifest.py']) {
            fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
            fs.copyFileSync(path.join(ROOT, file), path.join(root, file))
        }
        const effect = path.join(root, 'shaders/effects/synth/writerProbe')
        fs.mkdirSync(effect, { recursive: true })
        fs.writeFileSync(path.join(effect, 'definition.js'), [
            "import { Effect } from '../../../src/runtime/effect.js'",
            '',
            'export default new Effect({',
            '  name: "WriterProbe",',
            '  namespace: "synth",',
            '  func: "writerProbe",',
            '  globals: {',
            '    seed: {',
            '      type: "float",',
            '      default: 1',
            '    }',
            '  },',
            '  passes: []',
            '})',
            '',
        ].join('\n'))
        const snapshot = () => {
            const files = {}
            const walk = dir => {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    const full = path.join(dir, entry.name)
                    if (entry.isDirectory()) walk(full)
                    else files[path.relative(root, full)] = fs.readFileSync(full, 'utf8')
                }
            }
            walk(root)
            return files
        }
        const before = snapshot()
        const python = process.platform === 'win32' ? 'python' : 'python3'
        const writerReplacement = [
            /edit the effect's definition\.json/,
            /node scripts\/migrate-portable-effects\.mjs --convert <namespace\/effect>/,
            /node scripts\/migrate-portable-effects\.mjs --check/,
        ]
        for (const [command, args, replacement] of [
            [process.execPath, [path.join(root, 'shaders/scripts/standardize-params.js')], writerReplacement],
            [process.execPath, [path.join(root, 'shaders/scripts/standardize-params.js'), '--dry-run'], writerReplacement],
            [python, [path.join(root, 'scripts/fix_uniform_mappings.py')], writerReplacement],
            [python, [path.join(root, 'shaders/scripts/generate_shader_manifest.py')], [/npm run manifest/]],
        ]) {
            const run = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
            const name = path.basename(args[0])
            assert.notEqual(run.status, 0, `${name} fails`)
            for (const pattern of replacement) assert.match(run.stderr, pattern, `${name} names the replacement`)
            assert.equal(run.stdout, '', `${name} reads no definition`)
            assert.deepEqual(snapshot(), before, `${name} changes no file`)
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('an effect that declares capabilities keeps its declared starter, in the reader and in its generated module', async () => {
    const { root, effectsRoot } = engineTree('portable-capability-starter-')
    try {
        const { shapes } = baselineExportShapes()
        const id = 'synth/media'
        const dir = copyEffect(effectsRoot, id, path.join(ROOT, 'shaders/tests/fixtures/portable/providers/synth-media'))
        const file = path.join(dir, 'definition.json')
        const json = JSON.parse(fs.readFileSync(file, 'utf8'))
        fs.writeFileSync(file, `${JSON.stringify({ ...json, namespace: 'synth', starter: true }, null, 4)}\n`)
        const read = readDefinitionJson(dir, { catalog: true })
        assert.deepEqual(read.diagnostics, [])
        const shape = { definition: read.definition, ...shapes.get(id) }
        assert.equal(instantiateCatalogDefinition(shape).starter, true, 'the reader builds it with its starter')
        fs.writeFileSync(path.join(dir, 'definition.js'), generateWrapper(shape))
        const exported = (await import(pathToFileURL(path.join(dir, 'definition.js')).href)).default
        const generated = typeof exported === 'function' ? new exported() : exported
        assert.equal(generated.starter, true, 'the generated module keeps it')
        assert.ok(!Object.keys(generated).includes('starter'), 'and not as one of its own keys')
        assert.equal((await readCatalogMetadata(dir, { exportShapes: shapes })).starter, true, 'its metadata holds it')
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('a conversion writes a version 2 definition.json and its module, and refuses an effect whose class defines methods', async () => {
    const { root, effectsRoot } = engineTree('portable-convert-')
    try {
        const dir = copyEffect(effectsRoot, 'synth/fixtureLegacy', path.join(FIXTURE_CATALOG, 'synth/fixtureLegacy'))
        const legacyFile = path.join(dir, 'definition.js')
        fs.writeFileSync(legacyFile, fs.readFileSync(legacyFile, 'utf8').replace("'../../../../../../src/runtime/effect.js'", "'../../../src/runtime/effect.js'"))
        const shapes = new Map([['synth/fixtureLegacy', { exportKind: 'instance' }]])
        const before = definitionSchema((await import(pathToFileURL(legacyFile).href)).default)
        assert.deepEqual(await convertEffects(['synth/fixtureLegacy'], { effectsRoot, shapes }), ['synth/fixtureLegacy'])
        const json = JSON.parse(fs.readFileSync(path.join(dir, 'definition.json'), 'utf8'))
        assert.equal(json.format, 'noisemaker-portable-effect')
        assert.equal(json.version, 2)
        const generated = fs.readFileSync(legacyFile, 'utf8')
        assert.match(generated, /^\/\/ Generated from definition\.json/)
        assert.deepEqual(definitionSchema(await importGenerated(generated, dir)), before, 'the converted effect is the same effect')
        assert.deepEqual(wrapperDrift({ effectsRoot, shapes }), [])
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
    // In a copy, so that a regression of the refusal cannot write to the checkout.
    const media = engineTree('portable-media-')
    try {
        const dir = copyEffect(media.effectsRoot, 'synth/media', path.join(EFFECTS_ROOT, 'synth/media'))
        const before = fs.readFileSync(path.join(dir, 'definition.js'), 'utf8')
        await assert.rejects(() => convertEffects(['synth/media'], { effectsRoot: media.effectsRoot }), /synth\/media: its class defines onInit, onUpdate, setMediaDimensions/)
        assert.equal(fs.existsSync(path.join(dir, 'definition.json')), false, 'nothing is written for a refused effect')
        assert.equal(fs.readFileSync(path.join(dir, 'definition.js'), 'utf8'), before)
    } finally {
        fs.rmSync(media.root, { recursive: true, force: true })
    }
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

// The role of each file that names an effect's definition files, in the
// relocation map:
// - catalog-reader: reads definitions through scripts/lib/portable-catalog.mjs,
//   the same from either form;
// - generated-module: imports an effect's definition.js, which a converted
//   effect keeps as its generated module;
// - discovery: finds effects by their definition.js;
// - source-hash: hashes an effect's definition files;
// - text-reader: reads a definition.js as text, for a field no catalog
//   definition declares;
// - writer and retired: the definition writer, and the tools it replaces;
// - portable-package: reads or writes a package's definition.json;
// - engine-module: names the Portable module shaders/src/portable/definition.js;
// - comment and fixture: a mention, and test data.
const CONSUMER_ROLES = new Set([
    'catalog-reader', 'generated-module', 'discovery', 'source-hash', 'text-reader', 'writer', 'retired',
    'portable-package', 'engine-module', 'comment', 'fixture',
])

test('the relocation map gives a role to every file that names definition.js or definition.json', () => {
    const named = spawnSync('git', ['-C', ROOT, 'grep', '-lE', 'definition\\.js|definition\\.json', '--', 'scripts', 'shaders', 'demo', ':!shaders/effects/**'], { encoding: 'utf8' })
    assert.equal(named.status, 0, named.stderr)
    const files = named.stdout.split('\n').filter(Boolean).sort()
    const consumers = MAP.definitionConsumers ?? {}
    assert.deepEqual(Object.keys(consumers).sort(), files, 'the map lists exactly the files that name them')
    for (const [file, entry] of Object.entries(consumers)) {
        assert.ok(CONSUMER_ROLES.has(entry.role), `${file}: ${JSON.stringify(entry.role)} is a known role`)
    }
    // A file that reads a definition's text through a pattern is a defect
    // once its effect is converted, unless the map says why it is not.
    for (const [file, entry] of Object.entries(consumers)) {
        if (entry.role === 'text-reader' || entry.role === 'writer' || entry.role === 'retired' || entry.role === 'source-hash') {
            assert.ok(typeof entry.note === 'string' && entry.note.length > 0, `${file}: a ${entry.role} says what it does`)
        }
    }
})

// What a Phase 4 conversion must leave unchanged: the derived outputs and the
// readers of every definition, run in a copy of the tree before and after
// each convertible catalog effect is converted with --convert.
const CONVERSION_REFUSED = {
    'filter/fibers': /its class defines asyncInit/,
    'filter/scratches': /its class defines asyncInit/,
    'filter/strayHair': /its class defines asyncInit/,
    'synth/media': /its class defines onInit, onUpdate, setMediaDimensions/,
}
const DERIVED_OUTPUTS = [
    ['npm run manifest', ['shaders/scripts/generate-shader-manifest.mjs'], 'shaders/effects/manifest.json'],
    ['npm run strings', ['shaders/scripts/generate-effect-strings.mjs'], 'shaders/effects/strings.en.json'],
    ['the unused shader list', ['scripts/find-unused-shaders.js'], null],
]
// The harness's structure-only result for each effect, without its timings.
function harnessResults(stdout) {
    const results = new Map()
    let current = null
    for (const line of stdout.replace(/\s*\[\d+(\.\d+)?m?s\]/g, '').split('\n')) {
        const effect = /^(✓|❌) ([A-Za-z0-9]+\/[A-Za-z0-9]+)/.exec(line)
        if (effect) {
            current = effect[2]
            results.set(current, { passed: effect[1] === '✓', lines: [line] })
        } else if (current && /^\s+\S/.test(line)) {
            results.get(current).lines.push(line)
        } else {
            current = null
        }
    }
    return results
}
const DEFINITION_READERS = [
    'shaders/tests/test_effect_help_params.mjs',
    'shaders/tests/test_effect_tags.js',
    'shaders/tests/test_array_literal_additive.mjs',
    'shaders/tests/test_definition_schema.js',
]

test('converting the catalog leaves the manifest, the strings, the effect lists and the definition readers as they were', async () => {
    // The copy is under the checkout's node_modules, so that its modules
    // resolve the checkout's packages.
    fs.mkdirSync(path.join(ROOT, 'node_modules/.cache'), { recursive: true })
    const root = fs.mkdtempSync(path.join(ROOT, 'node_modules/.cache/portable-catalog-'))
    try {
        for (const part of ['shaders/effects', 'shaders/src', 'shaders/scripts', 'shaders/tests', 'scripts', 'share', 'vendor']) {
            fs.cpSync(path.join(ROOT, part), path.join(root, part), { recursive: true })
        }
        const effectsRoot = path.join(root, 'shaders/effects')
        const run = args => {
            const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
            assert.equal(result.status, 0, `node ${args.join(' ')} fails in the copy:\n${result.stdout.slice(-2000)}\n${result.stderr.slice(-2000)}`)
            return result.stdout
        }
        const outputs = () => DERIVED_OUTPUTS.map(([name, args, file]) => {
            const stdout = run(args)
            return [name, file ? fs.readFileSync(path.join(root, file), 'utf8') : stdout]
        })
        const harness = () => harnessResults(spawnSync(process.execPath, ['shaders/tests/test-harness.js', '--structure-only', '--webgl2'],
            { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).stdout)
        const before = outputs()
        const harnessBefore = harness()
        assert.ok(harnessBefore.size > 0, 'the harness lists the effects')
        assert.deepEqual([...harnessBefore].filter(([, result]) => !result.passed).map(([id]) => id), [], 'every effect passes the structure check before the conversion')

        const { shapes, effectIds } = baselineExportShapes()
        const isNative = id => fs.existsSync(path.join(effectsRoot, id, 'definition.json'))
        const native = effectIds.filter(isNative)
        const legacy = effectIds.filter(id => !isNative(id))
        assert.deepEqual(wrapperDrift({ effectsRoot, shapes }), [], 'already-converted effects have current generated modules')
        const convertible = legacy.filter(id => !(id in CONVERSION_REFUSED))
        assert.deepEqual(await convertEffects(convertible, { effectsRoot, shapes }), convertible, 'every eligible legacy effect converts')
        for (const [id, reason] of Object.entries(CONVERSION_REFUSED)) await assert.rejects(convertEffects([id], { effectsRoot, shapes }), reason, id)
        assert.deepEqual(effectIds.filter(isNative), [...native, ...convertible].sort(), 'the existing and new native effects are all present')
        assert.deepEqual(wrapperDrift({ effectsRoot, shapes }), [], 'every generated module is current')

        const after = outputs()
        for (const [index, [name, text]] of after.entries()) assert.equal(text, before[index][1], `${name} is the same after the conversion`)
        const harnessAfter = harness()
        assert.deepEqual([...harnessAfter.keys()], [...harnessBefore.keys()], 'the harness lists the same effects')
        for (const [id, result] of harnessAfter) {
            assert.deepEqual(result, harnessBefore.get(id), `${id}: the same structure result`)
        }
        for (const reader of DEFINITION_READERS) run([reader])
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})
