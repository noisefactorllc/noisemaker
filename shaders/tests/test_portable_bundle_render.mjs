#!/usr/bin/env node
// Each effect of the catalog baseline, rendered from built bundles on one
// backend, against its pin.
//
//   node shaders/tests/test_portable_bundle_render.mjs --bundles <dir|url> --backend webgl2|webgpu
//
// --bundles is the dist/ that `npm run bundle:shaders` builds (an unpacked
// noisemaker-shaders artifact) or the base URL of a published version. Each
// effect's render case (shaders/tests/fixtures/portable/render-cases.json) is
// rendered by shaders/scripts/pin-effect-pixels.mjs, which loads the core and
// the effect bundles instead of the source, and checked against the effect's
// pin, which the source recorded on this GPU. An ID of the baseline that is
// not rendered and found identical fails the run: an ID with no render case,
// no pin or no pin for this GPU fails as an ID that renders differently does.
//
// --effects <id,...> limits the run to the IDs named, for diagnosis.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { BASELINE_RELATIVE, PINS_RELATIVE, REPO_ROOT, RENDER_CASES_RELATIVE, pinPath } from '../../scripts/audit-portable-migration.mjs'

const PIN_TOOL = path.join(REPO_ROOT, 'shaders/scripts/pin-effect-pixels.mjs')

function parseArgs(argv) {
    const args = { bundles: null, backend: null, effects: null }
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index]
        const value = () => {
            if (argv[index + 1] === undefined) throw new Error(`${arg} needs a value`)
            return argv[++index]
        }
        if (arg === '--bundles') args.bundles = value()
        else if (arg === '--backend') args.backend = value()
        else if (arg === '--effects') {
            args.effects = value().split(',').filter(Boolean)
            // An empty list would render nothing and pass.
            if (!args.effects.length) throw new Error('--effects needs one or more IDs')
        } else throw new Error(`unknown argument ${arg}`)
    }
    if (!args.bundles) throw new Error('--bundles <dir|url> is required')
    if (!['webgl2', 'webgpu'].includes(args.backend)) throw new Error('--backend webgl2|webgpu is required')
    if (!/^https?:/.test(args.bundles)) {
        args.bundles = path.resolve(args.bundles)
        if (!fs.existsSync(path.join(args.bundles, 'effects'))) throw new Error(`${args.bundles} holds no effects/ directory`)
    }
    return args
}

function main() {
    const args = parseArgs(process.argv.slice(2))
    const baseline = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, BASELINE_RELATIVE), 'utf8'))
    const casesFile = path.join(REPO_ROOT, RENDER_CASES_RELATIVE)
    const cases = JSON.parse(fs.readFileSync(casesFile, 'utf8')).cases
    const unknown = (args.effects ?? []).filter(id => !baseline.effectIds.includes(id))
    if (unknown.length) throw new Error(`not in the catalog baseline: ${unknown.join(', ')}`)
    const targets = args.effects ?? baseline.effectIds
    const problems = []
    const rendered = []
    const renderable = []
    for (const id of targets) {
        if (!cases[id]) problems.push(`${id}: it has no render case`)
        else if (!fs.existsSync(pinPath(REPO_ROOT, id))) problems.push(`${id}: it has no pin`)
        else renderable.push(id)
    }
    // One browser renders every case in turn.
    const pins = path.join(REPO_ROOT, PINS_RELATIVE)
    const result = spawnSync(process.execPath, [PIN_TOOL, '--case', casesFile, '--entries', renderable.join(','), '--pins', pins, '--bundles', args.bundles, '--backend', args.backend],
        { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    for (const line of (result.stdout || '').split('\n')) {
        const ok = /^ok (\S+)$/.exec(line)?.[1]
        const failed = /^FAILED (\S+): (.*)$/.exec(line)
        if (ok && renderable.includes(ok)) {
            rendered.push(ok)
            console.log(line)
        } else if (failed) {
            problems.push(`${failed[1]}: ${failed[2]}`)
            console.log(`FAILED ${failed[1]}`)
        }
    }
    if (result.status !== 0 && !problems.length) {
        problems.push(`the pin tool failed: ${`${result.stdout || ''}${result.stderr || ''}`.trim().split('\n').slice(-4).join(' | ')}`)
    }
    const unrendered = targets.filter(id => !rendered.includes(id))
    console.log(`\n${rendered.length} of ${targets.length} effects render from ${args.bundles} on ${args.backend} as their pins hold`)
    if (problems.length || unrendered.length) {
        for (const problem of problems) console.error(`  FAIL: ${problem}`)
        return 1
    }
    return 0
}

try {
    process.exitCode = main()
} catch (error) {
    console.error(`Error: ${error.message}`)
    process.exitCode = 2
}
