#!/usr/bin/env node
/**
 * Generate the documentation that depends on the stability registry.
 *
 * The registry (shaders/src/stability.js) says which features are experimental.
 * docs/shaders/experimental-features.json holds the prose for each feature.
 * From the two this script writes:
 *
 * - the callout regions on each feature's page and in the agent guides;
 * - the markers on experimental productions in the grammar of
 *   docs/shaders/language.rst, and the paragraph that explains them;
 * - docs/shaders/experimental.rst, whole;
 * - the "Experimental features" section of llms.txt and llms-full.txt.
 *
 * A region is the text between a begin marker and its end marker. The markers
 * stay in the file whatever the feature's stability; only the text between
 * them is generated. A feature that becomes stable empties its regions.
 *
 *   node shaders/scripts/generate-stability-docs.mjs          writes the files
 *   node shaders/scripts/generate-stability-docs.mjs --check  writes nothing, and
 *                                                             fails when a file differs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FEATURES, SURFACE } from '../src/stability.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** The callout, held once. */
export const CALLOUT = 'Experimental. Complete and supported in Noisemaker 1.x, outside the 1.x stability guarantee. It seeds the Noisemaker 2.x feature set.'

/** What the Experimental features page and the guide sections open with. It is the only statement about 2.x. */
export const INTRODUCTION = 'These are new features that exist to seed the Noisemaker 2.x feature set. Node names, keywords, defaults, argument shapes, and rendered output may all change without a deprecation period. There is no flag to turn them on.'

export const GRAMMAR_MARKER = '(experimental)'
export const PROSE_FILE = 'docs/shaders/experimental-features.json'
export const PAGE_FILE = 'docs/shaders/experimental.rst'
export const PAGE_LABEL = 'shader-experimental'
export const PAGE_URL = 'https://docs.noisemaker.app/shaders/experimental/'
export const GRAMMAR_FILE = 'docs/shaders/language.rst'
export const GUIDE_FILES = Object.freeze(['llms.txt', 'llms-full.txt'])

/** Region keys that are not feature IDs. */
export const GRAMMAR_REGION = 'grammar'
export const SECTION_REGION = 'experimental-features'

/** The files that hold regions, relative to the repository. The generated page is not one of them. */
export function documentationFiles(root = repoRoot) {
    const pages = fs.readdirSync(path.join(root, 'docs', 'shaders'))
        .filter((name) => name.endsWith('.rst') && `docs/shaders/${name}` !== PAGE_FILE)
        .sort()
        .map((name) => `docs/shaders/${name}`)
    return [...pages, 'README.md', ...GUIDE_FILES]
}

const isRst = (file) => file.endsWith('.rst')
const experimentalIds = (features) => Object.keys(features).filter((id) => features[id] === 'experimental')

/** Prose is written with single backticks; reStructuredText wants two. */
const rstInline = (text) => text.replace(/`([^`]+)`/g, '``$1``')

const MARKER = /^(?:\.\. stability:(begin|end) (\S+)|<!-- stability:(begin|end) (\S+) -->)$/

/**
 * The regions of a file, in order.
 * @param {string} text
 * @returns {Array<{key: string, begin: number, end: number, body: string[]}>} each region's marker lines and the lines between them
 */
export function findRegions(text) {
    const lines = text.split('\n')
    const regions = []
    let open = null
    lines.forEach((line, index) => {
        const match = line.match(MARKER)
        if (!match) return
        const edge = match[1] ?? match[3]
        const key = match[2] ?? match[4]
        if (edge === 'begin') {
            if (open) throw new Error(`stability region '${open.key}' is not closed before '${key}' begins`)
            open = { key, begin: index }
        } else {
            if (!open || open.key !== key) throw new Error(`stability region '${key}' ends without beginning`)
            regions.push({ ...open, end: index, body: lines.slice(open.begin + 1, index) })
            open = null
        }
    })
    if (open) throw new Error(`stability region '${open.key}' is not closed`)
    return regions
}

/** One feature's entry on the Experimental features page, or in a guide's section. */
export function featureEntry(file, id, prose) {
    const entry = prose[id]
    if (isRst(file)) {
        const lines = [entry.title, '-'.repeat(entry.title.length), '', `\`\`${id}\`\``, '', rstInline(entry.does)]
        if (entry.limits) lines.push('', `Current limits: ${rstInline(entry.limits)}`)
        lines.push('', `See :ref:\`${entry.title} <${entry.page.label}>\`.`)
        return lines
    }
    const parts = [`- **${entry.title}** (\`${id}\`): ${entry.does}`]
    if (entry.limits) parts.push(`Current limits: ${entry.limits}`)
    parts.push(`[Documentation](${entry.page.url})`)
    return [parts.join(' ')]
}

/** The text between the markers of one region. */
export function regionBody(file, key, prose, features = FEATURES) {
    if (key === SECTION_REGION) {
        const ids = experimentalIds(features)
        if (!ids.length) return []
        return ['## Experimental features', '', INTRODUCTION, '', ...ids.flatMap((id) => featureEntry(file, id, prose))]
    }
    if (key === GRAMMAR_REGION) {
        const marked = Object.values(SURFACE.grammar).some((id) => features[id] === 'experimental')
        return marked ? [`Productions marked \`\`${GRAMMAR_MARKER}\`\` are experimental. See :ref:\`${PAGE_LABEL}\`.`] : []
    }
    if (!Object.hasOwn(features, key)) throw new Error(`${file}: stability region names '${key}', which the registry does not hold`)
    if (features[key] !== 'experimental') return []
    return isRst(file)
        ? ['.. note::', '', `   ${CALLOUT} See :ref:\`${PAGE_LABEL}\`.`]
        : [`> ${CALLOUT} See [Experimental features](${PAGE_URL}).`]
}

/** A file's text with every region filled from the registry. */
export function fillRegions(file, text, prose, features = FEATURES) {
    const lines = text.split('\n')
    const out = []
    let cursor = 0
    for (const region of findRegions(text)) {
        out.push(...lines.slice(cursor, region.begin + 1))
        const body = regionBody(file, region.key, prose, features)
        out.push(...(body.length ? ['', ...body, ''] : ['']))
        cursor = region.end
    }
    out.push(...lines.slice(cursor))
    return out.join('\n')
}

/** The production a grammar line defines, or null. */
export function grammarProduction(line) {
    return line.match(/^ {3}([A-Za-z]+)\s+::=/)?.[1] ?? null
}

const MARKER_SUFFIX = new RegExp(`\\s*${GRAMMAR_MARKER.replace(/[()]/g, '\\$&')}$`)

/** A grammar line without its marker. */
export function unmarked(line) {
    return line.replace(MARKER_SUFFIX, '')
}

/** The grammar with each registered production marked, or not, by its feature's stability. */
export function markGrammar(text, features = FEATURES) {
    const seen = new Set()
    const lines = text.split('\n').map((line) => {
        const production = grammarProduction(line)
        if (!production || !Object.hasOwn(SURFACE.grammar, production)) return line
        seen.add(production)
        return features[SURFACE.grammar[production]] === 'experimental' ? `${unmarked(line)}  ${GRAMMAR_MARKER}` : unmarked(line)
    })
    const missing = Object.keys(SURFACE.grammar).filter((production) => !seen.has(production))
    if (missing.length) throw new Error(`${GRAMMAR_FILE}: the grammar has no production named ${missing.join(', ')}`)
    return lines.join('\n')
}

/** docs/shaders/experimental.rst, whole. */
export function experimentalPage(prose, features = FEATURES) {
    const ids = experimentalIds(features)
    const title = 'Experimental Features'
    const lines = [
        `.. _${PAGE_LABEL}:`,
        '',
        title,
        '='.repeat(title.length),
        '',
        '.. This page is generated by shaders/scripts/generate-stability-docs.mjs from',
        '   the stability registry and docs/shaders/experimental-features.json.',
    ]
    if (ids.length) lines.push('', INTRODUCTION)
    for (const id of ids) lines.push('', ...featureEntry(PAGE_FILE, id, prose))
    return `${lines.join('\n')}\n`
}

/**
 * Every generated file and its text, from the files as they are.
 * @param {Map<string, string>} texts - The documentation files, by path
 * @param {object} prose - docs/shaders/experimental-features.json, parsed
 * @param {object} [features] - Feature ID to stability
 * @returns {Map<string, string>}
 */
export function generateFrom(texts, prose, features = FEATURES) {
    const files = new Map()
    for (const [file, text] of texts) {
        if (file === PAGE_FILE) continue
        const filled = fillRegions(file, text, prose, features)
        files.set(file, file === GRAMMAR_FILE ? markGrammar(filled, features) : filled)
    }
    files.set(PAGE_FILE, experimentalPage(prose, features))
    return files
}

/** The documentation files and the generated page, as they are on disk. */
export function readDocumentation(root = repoRoot) {
    const texts = new Map(documentationFiles(root).map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]))
    const page = path.join(root, PAGE_FILE)
    texts.set(PAGE_FILE, fs.existsSync(page) ? fs.readFileSync(page, 'utf8') : '')
    return texts
}

export function readProse(root = repoRoot) {
    return JSON.parse(fs.readFileSync(path.join(root, PROSE_FILE), 'utf8'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const check = process.argv.includes('--check')
    const current = readDocumentation()
    const stale = []
    for (const [file, text] of generateFrom(current, readProse())) {
        if (current.get(file) === text) continue
        stale.push(file)
        if (!check) fs.writeFileSync(path.join(repoRoot, file), text)
    }
    if (check && stale.length) {
        console.error(`Generated stability documentation is out of date:\n  ${stale.join('\n  ')}\nRun node shaders/scripts/generate-stability-docs.mjs`)
        process.exit(1)
    }
    console.log(check
        ? 'Generated stability documentation is current'
        : `Wrote ${stale.length ? stale.join(', ') : 'nothing: every file is current'}`)
}
