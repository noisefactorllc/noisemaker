#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from './lib/shader-test-browser.mjs'
import { createAgreementPage, agreementSize } from './lib/agreement-browser.mjs'
import { effectCases, compareFrames } from '../shaders/tests/agreement-cases.mjs'
import { agreementFingerprint } from './lib/agreement-source.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { values } = parseArgs({ options: { effects: { type: 'string' }, cases: { type: 'string' }, list: { type: 'boolean' } } })
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer, matchEffects } = await import('../vendor/shade-mcp/harness/index.js')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'shaders/effects/manifest.json'), 'utf8'))
const ids = Object.keys(manifest).sort()
const selected = values.effects ? [...new Set(values.effects.split(',').flatMap(pattern => {
    const matches = matchEffects(ids, pattern)
    if (!matches.length) throw new Error(`No effects match ${pattern}`)
    return matches
}))] : ids
const cases = []
const unbounded = []
for (const id of selected) {
    let definition = (await import(pathToFileURL(path.join(root, `shaders/effects/${id}/definition.js`)))).default
    if (typeof definition === 'function') definition = new definition()
    const planned = effectCases({ namespace: id.split('/')[0], instance: definition })
    const sampled = new Set(planned.flatMap(c => Object.keys(c.params)))
    for (const [name, spec] of Object.entries(definition.globals || {})) {
        if ((['int', 'float'].includes(spec.type) || /^vec[234]$/.test(spec.type)) && !sampled.has(name)) unbounded.push(`${id}/${name}`)
    }
    for (const c of planned) {
        if (values.cases && !values.cases.split(',').includes(c.name)) continue
        cases.push({ effect: id, ...c })
    }
}
for (const requested of values.cases?.split(',') || []) {
    if (!cases.some(c => c.name === requested)) throw new Error(`No cases match ${requested}`)
}
if (!cases.length) throw new Error('No cases selected')
const emit = value => process.stdout.write(JSON.stringify(value) + '\n')
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== ''
const candidateHash = await agreementFingerprint(root)
const started = Date.now()
emit({ type: 'run', source, dirty, candidateHash, size: agreementSize, time: 0, frames: 3, channelTolerance: 2, effects: selected.length, cases: cases.length, unbounded })
if (values.list) {
    for (const c of cases) emit({ type: 'case-plan', ...c })
} else {
    let browser
    let reference
    let candidate
    let failed = 0
    let errors = 0
    let completed = 0
    let stopped = false
    const stop = () => { stopped = true; void browser?.close() }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    try {
        const baseUrl = await acquireServer(0, root, process.env.SHADE_EFFECTS_DIR)
        browser = await chromium.launch(shaderTestBrowserOptions())
        reference = await createAgreementPage(browser, baseUrl, 'webgl2')
        candidate = await createAgreementPage(browser, baseUrl, 'webgpu')
        const browserBuild = browser.version()
        for (const c of cases) {
            if (stopped) break
            try {
                const a = await reference.render(c.dsl, c.effect)
                const b = await candidate.render(c.dsl, c.effect)
                const metrics = compareFrames(a.frame, b.frame)
                if (!metrics.pass) failed++
                emit({ type: 'case', ...c, browser: browserBuild, gpu: { webgl2: a.gpu, webgpu: b.gpu }, ...metrics })
            } catch (error) {
                errors++
                emit({ type: 'case', ...c, browser: browserBuild, pass: false, error: error.message })
            }
            completed++
            if (reference.page.isClosed() || candidate.page.isClosed()) break
        }
        const sourceUnchanged = candidateHash === await agreementFingerprint(root)
        const complete = completed === cases.length && !stopped && sourceUnchanged
        const pass = complete && failed + errors === 0
        emit({ type: 'summary', cases: cases.length, completed, complete, sourceUnchanged, divergent: failed, errors, elapsedSeconds: (Date.now() - started) / 1000, pass })
        if (!pass) process.exitCode = 1
    } finally {
        process.removeListener('SIGINT', stop)
        process.removeListener('SIGTERM', stop)
        try { await browser?.close() } finally { await releaseServer() }
    }
}
