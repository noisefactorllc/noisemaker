/**
 * The stability registry and the documentation generated from it stay in step.
 *
 * shaders/src/stability.js is the only place that states a feature's
 * stability. This test fails when the documentation says something else, when
 * a part of the engine names a feature the registry does not hold, or when a
 * part of the engine that belongs to a feature names none. Each failure names
 * its case, the file and the feature.
 *
 * Every case is also run against a broken copy of its inputs, so a check that
 * stopped finding anything fails here too. The broken copies start from every
 * feature experimental and the documentation generated for that, so they do
 * not depend on what the registry says today.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { FEATURES, SURFACE, featureStability, listFeatures } from '../src/stability.js'
import {
    CALLOUT, GRAMMAR_FILE, GRAMMAR_MARKER, GRAMMAR_REGION, GUIDE_FILES, PAGE_FILE, SECTION_REGION,
    findRegions, generateFrom, grammarProduction, readDocumentation, readProse, unmarked
} from '../scripts/generate-stability-docs.mjs'
import { SCENE_CALL_KINDS } from '../src/rendering/scene-compiler.js'
import { SceneTree } from '../src/scene/tree.js'
import { CameraNode } from '../src/scene/camera.js'
import { CanvasRenderer } from '../src/renderer/canvas.js'
import { compileGraph } from '../src/runtime/compiler.js'
import { validateEffectDefinition } from '../src/runtime/effect-validator.js'
import { lex } from '../src/lang/lexer.js'
import { parse } from '../src/lang/parser.js'
import { validate } from '../src/lang/validator.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const srcRoot = path.join(repoRoot, 'shaders', 'src')

/** The directories whose every file belongs to a feature or is declared shared. */
const FEATURE_DIRECTORIES = ['scene', 'rendering', 'geometry']

/** Status wording that only the generator may write. */
const STATUS_WORDING = [CALLOUT, GRAMMAR_MARKER, '(Preview)', '(preview)', 'Preview feature']

/**
 * The public members CanvasRenderer has on the stable line. A public member
 * that is neither here nor in SURFACE.hostMembers has no feature and is not
 * known to be stable.
 */
const STABLE_HOST_MEMBERS = new Set([
    'addSink', 'applyParameterValues', 'applyStepParameterValues', 'audioState', 'backend', 'buildUniformBindings',
    'bundlePath', 'canvas', 'capabilities', 'clearTileRegion', 'colorOutput', 'compile', 'convertParameterForUniform',
    'createFrameExportQueue', 'currentDsl', 'currentEffect', 'currentFPS', 'deferredFrameCount', 'dispose', 'enums',
    'frameCount', 'getEffectDescription', 'getEffectsFromManifest', 'getFrameTimeStats', 'getLoadedEffectIds',
    'getLoadedEffectIdsByNamespace', 'getLocale', 'getMediaSteps', 'getSeed', 'hasEffect', 'initEnums', 'isContextLost',
    'isRunning', 'lastPassCount', 'lastRenderTime', 'lastTime', 'loadEffect', 'loadEffectDefinition',
    'loadEffectFromBundle', 'loadEffectShaders', 'loadEffects', 'loadManifest', 'loadOBJFromString', 'loadOBJFromURL',
    'loadedEffects', 'localize', 'loopDuration', 'manifest', 'midiState', 'pipeline', 'preferredBackend',
    'registerEffectWithRuntime', 'registerEffectsFromBundle', 'registerEffectsFromBundles', 'registerPortableEffect',
    'registerStarterOpForEffect', 'render', 'renderCubemap', 'resetCanvas', 'resetFrameTimeStats', 'resize',
    'resolveEnumValue', 'setAudioState', 'setLocale', 'setLoopDuration', 'setMidiState', 'setSeed', 'setTileRegion', 'setUniform',
    'softwareRendering', 'start', 'stepFrame', 'stop', 'switchBackend', 'syncTime', 'updateTextureFromSource',
    'useBundles'
])

// ---------------------------------------------------------------------------
// The documentation against the registry: cases F1 to F5
// ---------------------------------------------------------------------------

/**
 * @param {object} input
 * @param {object} input.features - Feature ID to stability
 * @param {Map<string, string>} input.texts - The documentation files and the generated page, by path
 * @param {object} input.prose - The prose file, parsed
 * @returns {string[]} One line per problem: its case, file, feature and what is wrong
 */
function documentationProblems({ features, texts, prose }) {
    const problems = []
    const add = (kase, file, feature, message) => problems.push(`${kase} ${file}${feature ? ` [${feature}]` : ''}: ${message}`)

    const regionsOf = new Map()
    for (const [file, text] of texts) {
        if (file === PAGE_FILE) continue
        try {
            regionsOf.set(file, findRegions(text))
        } catch (error) {
            regionsOf.set(file, [])
            add('F4', file, null, error.message)
        }
    }
    const written = (region) => region.body.some((line) => line.trim() !== '')
    const page = texts.get(PAGE_FILE) ?? ''
    const pageLists = (id) => page.split('\n').includes(`\`\`${id}\`\``)
    const sectionLists = (file, id) => (regionsOf.get(file) ?? [])
        .some((region) => region.key === SECTION_REGION && region.body.some((line) => line.includes(`(\`${id}\`)`)))
    const grammar = (texts.get(GRAMMAR_FILE) ?? '').split('\n')
    const marks = (production) => grammar.some((line) => grammarProduction(line) === production && line !== unmarked(line))
    const pageOfLabel = (label) => [...texts].find(([, text]) => text.split('\n').includes(`.. _${label}:`))?.[0]

    // F5: a region names an ID the registry does not hold
    for (const [file, regions] of regionsOf) {
        for (const region of regions) {
            if (region.key === GRAMMAR_REGION || region.key === SECTION_REGION) continue
            if (!Object.hasOwn(features, region.key)) add('F5', file, region.key, 'a region names a feature the registry does not hold')
        }
    }

    for (const id of Object.keys(features)) {
        const productions = Object.keys(SURFACE.grammar).filter((production) => SURFACE.grammar[production] === id)
        if (features[id] === 'stable') {
            // F1: a documented feature the registry does not flag
            for (const [file, regions] of regionsOf) {
                if (regions.some((region) => region.key === id && written(region))) {
                    add('F1', file, id, 'a callout region is filled for a feature the registry says is stable')
                }
            }
            if (pageLists(id)) add('F1', PAGE_FILE, id, 'the Experimental features page lists a feature the registry says is stable')
            for (const guide of GUIDE_FILES) {
                if (sectionLists(guide, id)) add('F1', guide, id, 'the Experimental features section lists a feature the registry says is stable')
            }
            for (const production of productions) {
                if (marks(production)) add('F1', GRAMMAR_FILE, id, `the grammar marks ${production}, whose feature the registry says is stable`)
            }
        } else if (features[id] === 'experimental') {
            // F2: a flagged feature the documentation does not call out
            const label = prose[id]?.page?.label
            const home = label ? pageOfLabel(label) : undefined
            if (!home) {
                add('F2', label ? `label ${label}` : 'no page', id, 'no documentation page is named for the feature')
            } else if (!regionsOf.get(home).some((region) => region.key === id && region.body.some((line) => line.includes(CALLOUT)))) {
                add('F2', home, id, 'the feature has no callout region on its page')
            }
            if (!pageLists(id)) add('F2', PAGE_FILE, id, 'the Experimental features page does not list the feature')
            for (const guide of GUIDE_FILES) {
                if (!sectionLists(guide, id)) add('F2', guide, id, 'the Experimental features section does not list the feature')
            }
            for (const production of productions) {
                if (!marks(production)) add('F2', GRAMMAR_FILE, id, `the grammar does not mark ${production}`)
            }
        }
    }

    // F3: status wording outside generated text
    for (const [file, text] of texts) {
        if (file === PAGE_FILE) continue
        const generated = new Set()
        for (const region of regionsOf.get(file)) {
            for (let line = region.begin; line <= region.end; line++) generated.add(line)
        }
        text.split('\n').forEach((line, index) => {
            if (generated.has(index)) return
            const production = file === GRAMMAR_FILE ? grammarProduction(line) : null
            const hand = production && Object.hasOwn(SURFACE.grammar, production) ? unmarked(line) : line
            for (const wording of STATUS_WORDING) {
                if (hand.includes(wording)) add('F3', file, null, `line ${index + 1} states a status by hand: ${wording}`)
            }
        })
    }

    // F4: generated text differs from the generator's output
    try {
        for (const [file, text] of generateFrom(texts, prose, features)) {
            if (texts.get(file) !== text) add('F4', file, null, 'differs from what the generator writes')
        }
    } catch (error) {
        add('F4', 'generator', null, error.message)
    }

    return problems
}

// ---------------------------------------------------------------------------
// The registry against the engine: cases F5 to F10
// ---------------------------------------------------------------------------

function publicMembers(klass) {
    return Object.getOwnPropertyNames(klass.prototype).filter((name) => name !== 'constructor' && !name.startsWith('_'))
}

function sourceFilesUnder(directory) {
    return fs.readdirSync(path.join(srcRoot, directory), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(srcRoot, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
        .sort()
}

/** The `feature` field of each effect definition that has one, by definition path. */
function definitionFeatures() {
    const effects = path.join(repoRoot, 'shaders', 'effects')
    const found = {}
    for (const entry of fs.readdirSync(effects, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || entry.name !== 'definition.js') continue
        const file = path.join(entry.parentPath, entry.name)
        const feature = fs.readFileSync(file, 'utf8').match(/^\s{2,4}feature:\s*['"]([^'"]+)['"]/m)?.[1]
        if (feature) found[path.relative(repoRoot, file).split(path.sep).join('/')] = feature
    }
    return found
}

function topLevelDiagnostic(name) {
    const result = validate(parse(lex(`search synth\n${name}().write(o0)`)))
    return result.diagnostics.map((diagnostic) => diagnostic.message).join(' | ')
}

function sceneValueCompiles(name) {
    const call = { osc: 'osc(type: oscKind.sine)', midi: 'midi(channel: 1)', audio: 'audio(band: 1)' }[name]
    if (!call) return false
    try {
        compileGraph(`search synth\nscene(camera(fov: 60), mesh("sphere", pos: [0, ${call}, 0])).write(o0)\nrender(o0)`)
        return true
    } catch {
        return false
    }
}

function builds(type) {
    const tree = SceneTree.fromIR({
        camera: type === 'camera' ? { fov: 60 } : null,
        lights: type === 'light' ? [{ type: 'directional' }] : [],
        environment: type === 'environment' ? { surface: 'o1' } : null,
        nodes: ['group', 'mesh', 'volume'].includes(type)
            ? [{ id: 'node', type, meshType: 'sphere', surface: 'vol0' }]
            : []
    })
    if (type === 'camera') return tree.camera instanceof CameraNode
    if (type === 'light') return tree.lights.length === 1
    if (type === 'environment') return tree.environment !== null
    return tree.getById('node') !== null
}

/**
 * @param {object} input
 * @param {object} input.features - Feature ID to stability
 * @param {object} input.surface - The SURFACE tables
 * @param {object} input.prose - The prose file, parsed
 * @param {string[]} input.members - Public members of CanvasRenderer
 * @param {string[]} input.sources - Files under the feature directories, by path under shaders/src
 * @param {object} input.definitions - Definition path to its `feature` field
 * @param {string} input.grammarText - docs/shaders/language.rst
 * @returns {string[]} One line per problem
 */
function registryProblems({ features, surface, prose, members, sources, definitions, grammarText }) {
    const problems = []
    const add = (kase, where, feature, message) => problems.push(`${kase} ${where}${feature ? ` [${feature}]` : ''}: ${message}`)
    const tables = ['sceneCalls', 'sceneValues', 'grammar', 'nodeTypes', 'hostMembers', 'sceneModes', 'modules']

    // F9: a stability that is neither value
    for (const [id, stability] of Object.entries(features)) {
        if (stability !== 'experimental' && stability !== 'stable') add('F9', 'FEATURES', id, `the stability is ${JSON.stringify(stability)}`)
    }

    // F5: an entry names an ID the registry does not hold
    const named = new Set()
    for (const table of tables) {
        for (const [entry, id] of Object.entries(surface[table])) {
            named.add(id)
            if (!Object.hasOwn(features, id)) add('F5', `SURFACE.${table}.${entry}`, id, 'the entry names a feature the registry does not hold')
        }
    }
    for (const [file, id] of Object.entries(definitions)) {
        named.add(id)
        if (!Object.hasOwn(features, id)) add('F5', file, id, 'the definition names a feature the registry does not hold')
    }

    // F6: a feature nothing names, or the prose file and the registry disagree on the IDs
    for (const id of Object.keys(features)) {
        if (!named.has(id)) add('F6', 'SURFACE', id, 'no entry and no definition names the feature')
        if (!Object.hasOwn(prose, id)) add('F6', 'docs/shaders/experimental-features.json', id, 'the prose file has no entry for the feature')
    }
    for (const id of Object.keys(prose)) {
        if (!Object.hasOwn(features, id)) add('F6', 'docs/shaders/experimental-features.json', id, 'the prose file describes a feature the registry does not hold')
    }

    // F7: an entry for something that does not exist
    for (const table of ['hostMembers', 'sceneModes']) {
        for (const member of Object.keys(surface[table])) {
            if (!members.includes(member)) add('F7', `SURFACE.${table}.${member}`, surface[table][member], 'CanvasRenderer has no such member')
        }
    }
    for (const call of Object.keys(surface.sceneCalls)) {
        if (!Object.hasOwn(SCENE_CALL_KINDS, call)) {
            add('F7', `SURFACE.sceneCalls.${call}`, surface.sceneCalls[call], 'the scene compiler does not know the call')
        } else if (call !== 'scene' && !topLevelDiagnostic(call).includes('only valid inside scene()')) {
            add('F7', `SURFACE.sceneCalls.${call}`, surface.sceneCalls[call], 'the validator does not treat the call as scene vocabulary')
        }
    }
    for (const call of Object.keys(SCENE_CALL_KINDS)) {
        if (!Object.hasOwn(surface.sceneCalls, call)) add('F7', `scene compiler call ${call}()`, null, 'the call has no entry in SURFACE.sceneCalls')
    }
    for (const value of Object.keys(surface.sceneValues)) {
        if (!sceneValueCompiles(value)) add('F7', `SURFACE.sceneValues.${value}`, surface.sceneValues[value], 'a scene does not accept the value source')
    }
    for (const type of Object.keys(surface.nodeTypes)) {
        let built = false
        try { built = builds(type) } catch { built = false }
        if (!built) add('F7', `SURFACE.nodeTypes.${type}`, surface.nodeTypes[type], 'the scene tree does not build the node type')
    }
    for (const file of [...Object.keys(surface.modules), ...surface.sharedModules]) {
        if (!fs.existsSync(path.join(srcRoot, file))) add('F7', `shaders/src/${file}`, surface.modules[file] ?? null, 'the registry lists a file that does not exist')
    }
    const productions = new Set(grammarText.split('\n').map(grammarProduction).filter(Boolean))
    for (const production of Object.keys(surface.grammar)) {
        if (!productions.has(production)) add('F7', `SURFACE.grammar.${production}`, surface.grammar[production], 'the grammar has no production of that name')
    }

    // F8: a file in a feature directory that is neither a feature's nor shared
    for (const file of sources) {
        const owned = Object.hasOwn(surface.modules, file)
        const shared = surface.sharedModules.includes(file)
        if (!owned && !shared) add('F8', `shaders/src/${file}`, null, 'the file is in neither SURFACE.modules nor SURFACE.sharedModules')
        if (owned && shared) add('F8', `shaders/src/${file}`, surface.modules[file], 'the file is in both SURFACE.modules and SURFACE.sharedModules')
    }

    // F10: a public member of CanvasRenderer with no feature that is not a stable member
    for (const member of members) {
        if (!Object.hasOwn(surface.hostMembers, member) && !STABLE_HOST_MEMBERS.has(member)) {
            add('F10', `CanvasRenderer.${member}`, null, 'the member is in neither SURFACE.hostMembers nor the stable members')
        }
    }

    return problems
}

// ---------------------------------------------------------------------------
// The repository as it is
// ---------------------------------------------------------------------------

const prose = readProse()
const texts = readDocumentation()
const actual = {
    features: FEATURES,
    surface: SURFACE,
    prose,
    members: publicMembers(CanvasRenderer),
    sources: FEATURE_DIRECTORIES.flatMap(sourceFilesUnder),
    definitions: definitionFeatures(),
    grammarText: texts.get(GRAMMAR_FILE)
}

const found = [...documentationProblems({ features: FEATURES, texts, prose }), ...registryProblems(actual)]
assert.deepEqual(found, [], `the registry and the documentation disagree:\n  ${found.join('\n  ')}`)

// ---------------------------------------------------------------------------
// Each case fails on a broken copy
// ---------------------------------------------------------------------------

const cases = (problems, kase) => problems.filter((problem) => problem.startsWith(`${kase} `))
const everyExperimental = Object.fromEntries(Object.keys(FEATURES).map((id) => [id, 'experimental']))
const fixture = generateFrom(texts, prose, everyExperimental)
assert.deepEqual(documentationProblems({ features: everyExperimental, texts: fixture, prose }), [],
    'the documentation generated for every feature experimental has no problem')
const withText = (file, change) => new Map([...fixture, [file, change(fixture.get(file))]])
const withoutRegion = (text, key) => {
    const region = findRegions(text).find((candidate) => candidate.key === key)
    const lines = text.split('\n')
    lines.splice(region.begin, region.end - region.begin + 1)
    return lines.join('\n')
}

// F1: a feature set to stable while the documentation still calls it experimental
{
    const problems = cases(documentationProblems({ features: { ...everyExperimental, 'scene.volume': 'stable' }, texts: fixture, prose }), 'F1')
    for (const file of ['docs/shaders/scene.rst', PAGE_FILE, ...GUIDE_FILES, GRAMMAR_FILE]) {
        assert.ok(problems.some((problem) => problem.startsWith(`F1 ${file} [scene.volume]`)), `F1 must name ${file} and scene.volume, got:\n  ${problems.join('\n  ')}`)
    }
}

// F2: an experimental feature whose callout region is gone from its page
{
    const broken = withText('docs/shaders/language.rst', (text) => withoutRegion(text, 'gltf'))
    const problems = cases(documentationProblems({ features: everyExperimental, texts: broken, prose }), 'F2')
    assert.deepEqual(problems, ['F2 docs/shaders/language.rst [gltf]: the feature has no callout region on its page'])
}
// F2: the page, a guide section and a grammar marker each missing a feature
{
    const noEntry = withText(PAGE_FILE, (text) => text.replace('``gltf``', '``other``'))
    assert.ok(cases(documentationProblems({ features: everyExperimental, texts: noEntry, prose }), 'F2')
        .includes(`F2 ${PAGE_FILE} [gltf]: the Experimental features page does not list the feature`))
    const noGuide = withText('llms.txt', (text) => text.replace('(`gltf`)', '(`other`)'))
    assert.ok(cases(documentationProblems({ features: everyExperimental, texts: noGuide, prose }), 'F2')
        .includes('F2 llms.txt [gltf]: the Experimental features section does not list the feature'))
    const noMarker = withText(GRAMMAR_FILE, (text) => text.split('\n').map((line) => grammarProduction(line) === 'Object' ? unmarked(line) : line).join('\n'))
    assert.ok(cases(documentationProblems({ features: everyExperimental, texts: noMarker, prose }), 'F2')
        .includes(`F2 ${GRAMMAR_FILE} [lang.objectLiteral]: the grammar does not mark Object`))
}

// F3: status wording written by hand
for (const wording of STATUS_WORDING) {
    const broken = withText('docs/shaders/scene.rst', (text) => `${text}\nThe scene graph ${wording}\n`)
    const problems = cases(documentationProblems({ features: everyExperimental, texts: broken, prose }), 'F3')
    assert.ok(problems.some((problem) => problem.startsWith('F3 docs/shaders/scene.rst: line ') && problem.endsWith(wording)),
        `F3 must find ${JSON.stringify(wording)} written by hand`)
}

// F4: a hand edit inside a generated region, and inside the generated page
{
    const edited = withText('docs/shaders/scene.rst', (text) => text.replace(CALLOUT, `${CALLOUT} Really.`))
    assert.ok(cases(documentationProblems({ features: everyExperimental, texts: edited, prose }), 'F4')
        .includes('F4 docs/shaders/scene.rst: differs from what the generator writes'))
    const page = withText(PAGE_FILE, (text) => `${text}\nAn extra line.\n`)
    assert.ok(cases(documentationProblems({ features: everyExperimental, texts: page, prose }), 'F4')
        .includes(`F4 ${PAGE_FILE}: differs from what the generator writes`))
}

// F5: an ID the registry does not hold, in a region, a SURFACE entry and a definition
{
    const region = withText('docs/shaders/scene.rst', (text) => `${text}\n.. stability:begin scene.shadows\n\n.. stability:end scene.shadows\n`)
    assert.ok(cases(documentationProblems({ features: everyExperimental, texts: region, prose }), 'F5')
        .includes('F5 docs/shaders/scene.rst [scene.shadows]: a region names a feature the registry does not hold'))
    const entry = { ...SURFACE, hostMembers: { ...SURFACE.hostMembers, clock: 'scene.clock' } }
    assert.ok(cases(registryProblems({ ...actual, surface: entry }), 'F5')
        .includes('F5 SURFACE.hostMembers.clock [scene.clock]: the entry names a feature the registry does not hold'))
    const definition = { 'shaders/effects/synth/noise/definition.js': 'scene.shadows' }
    assert.ok(cases(registryProblems({ ...actual, definitions: definition }), 'F5')
        .includes('F5 shaders/effects/synth/noise/definition.js [scene.shadows]: the definition names a feature the registry does not hold'))
}

// F6: a feature nothing names, and a prose file that disagrees with the registry
{
    const orphan = { ...FEATURES, 'scene.shadows': 'experimental' }
    const problems = cases(registryProblems({ ...actual, features: orphan }), 'F6')
    assert.ok(problems.includes('F6 SURFACE [scene.shadows]: no entry and no definition names the feature'))
    assert.ok(problems.includes('F6 docs/shaders/experimental-features.json [scene.shadows]: the prose file has no entry for the feature'))
    const extra = { ...prose, 'scene.shadows': prose.scene }
    assert.ok(cases(registryProblems({ ...actual, prose: extra }), 'F6')
        .includes('F6 docs/shaders/experimental-features.json [scene.shadows]: the prose file describes a feature the registry does not hold'))
}

// F7: an entry for something that does not exist
{
    const missing = {
        ...SURFACE,
        hostMembers: { ...SURFACE.hostMembers, sceneShadows: 'scene' },
        sceneCalls: { ...SURFACE.sceneCalls, shadow: 'scene' },
        sceneValues: { ...SURFACE.sceneValues, lfo: 'scene' },
        nodeTypes: { ...SURFACE.nodeTypes, portal: 'scene' },
        modules: { ...SURFACE.modules, 'scene/shadow.js': 'scene' },
        grammar: { ...SURFACE.grammar, ObjectLiteral: 'lang.objectLiteral' }
    }
    const problems = cases(registryProblems({ ...actual, surface: missing }), 'F7')
    for (const where of ['SURFACE.hostMembers.sceneShadows', 'SURFACE.sceneCalls.shadow', 'SURFACE.sceneValues.lfo',
        'SURFACE.nodeTypes.portal', 'shaders/src/scene/shadow.js', 'SURFACE.grammar.ObjectLiteral']) {
        assert.ok(problems.some((problem) => problem.startsWith(`F7 ${where} `)), `F7 must name ${where}, got:\n  ${problems.join('\n  ')}`)
    }
    const fewer = { ...SURFACE, sceneCalls: Object.fromEntries(Object.entries(SURFACE.sceneCalls).filter(([call]) => call !== 'reflector')) }
    assert.ok(cases(registryProblems({ ...actual, surface: fewer }), 'F7')
        .includes('F7 scene compiler call reflector(): the call has no entry in SURFACE.sceneCalls'))
}

// F8: a file in a feature directory that the registry does not account for
{
    const problems = cases(registryProblems({ ...actual, sources: [...actual.sources, 'scene/shadow.js'] }), 'F8')
    assert.deepEqual(problems, ['F8 shaders/src/scene/shadow.js: the file is in neither SURFACE.modules nor SURFACE.sharedModules'])
    const both = { ...SURFACE, sharedModules: [...SURFACE.sharedModules, 'scene/tree.js'] }
    assert.ok(cases(registryProblems({ ...actual, surface: both }), 'F8')
        .includes('F8 shaders/src/scene/tree.js [scene]: the file is in both SURFACE.modules and SURFACE.sharedModules'))
}

// F9: a stability that is neither experimental nor stable
{
    const problems = cases(registryProblems({ ...actual, features: { ...FEATURES, gltf: 'preview' } }), 'F9')
    assert.deepEqual(problems, ['F9 FEATURES [gltf]: the stability is "preview"'])
}

// F10: a public member of CanvasRenderer the registry does not account for
{
    const problems = cases(registryProblems({ ...actual, members: [...actual.members, 'sceneShadows'] }), 'F10')
    assert.deepEqual(problems, ['F10 CanvasRenderer.sceneShadows: the member is in neither SURFACE.hostMembers nor the stable members'])
}

// ---------------------------------------------------------------------------
// What the runtime exposes, and what the engine refuses
// ---------------------------------------------------------------------------

for (const id of Object.keys(FEATURES)) assert.equal(featureStability(id), FEATURES[id])
assert.equal(featureStability('scene.shadows'), undefined, 'an ID the registry does not hold has no stability')
assert.equal(featureStability('toString'), undefined, 'an inherited property is not a feature')
assert.deepEqual(listFeatures().map((feature) => feature.id), Object.keys(FEATURES).sort(), 'every feature is listed, ordered by ID')
assert.ok(listFeatures().every((feature) => feature.stability === FEATURES[feature.id]))

const engine = await import('../src/index.js')
assert.equal(engine.featureStability, featureStability, 'the engine exports featureStability')
assert.equal(engine.listFeatures, listFeatures, 'the engine exports listFeatures')

assert.throws(() => SceneTree.fromIR({ nodes: [{ id: 'node', type: 'portal' }] }), /Unknown scene node type 'portal'/,
    'the scene tree refuses a node type the registry does not list')

const definition = { name: 'Example', namespace: 'synth', func: 'example' }
const featureErrors = (feature) => validateEffectDefinition({ ...definition, feature }).filter((error) => error.includes('"feature"'))
assert.deepEqual(featureErrors('scene.volume'), [], 'a definition may name a feature the registry holds')
assert.equal(featureErrors('scene.shadows').length, 1, 'a definition may not name a feature the registry does not hold')
assert.equal(featureErrors(7).length, 1, 'a feature is named by its ID')

console.log(`test_stability_registry: ${Object.keys(FEATURES).length} features, ${texts.size} documentation files; ` +
    'the registry, the engine and the generated documentation agree, and every failure case fails')
