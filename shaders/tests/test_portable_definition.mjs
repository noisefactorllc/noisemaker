// Relocated from Portable (https://github.com/noisefactorllc/portable,
// test-definition.mjs at 6f211e44a0f2eb4baff1b9ae68893fa3b3554085), MIT License,
// Copyright (c) 2026 Noise Factor. Portable's file was both its validator and
// its test. The validator is now scripts/validate-portable.mjs, which applies
// the engine's own checks. This test runs it as Portable's suite ran
// test-definition.mjs: on the starter effect by default and by path, and on
// every package it shipped, each of which must pass and say so.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const VALIDATOR = path.join(ROOT, 'scripts/validate-portable.mjs')
const EXAMPLES = path.join(ROOT, 'shaders/portable/examples')

function validate(args) {
    const run = spawnSync(process.execPath, [VALIDATOR, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 30000 })
    return { status: run.status, output: `${run.stdout}${run.stderr}`, stderr: run.stderr }
}

test('the starter effect passes every check, by default and by path', () => {
    for (const args of [[], [path.join(EXAMPLES, 'gradient-sweep')]]) {
        const run = validate(args)
        assert.equal(run.status, 0, run.output)
        assert.match(run.output, /^All definition checks passed$/m, run.output)
    }
})

test('each package that Portable shipped passes every check', () => {
    for (const example of ['gradient-sweep', 'portable-block-3d', 'volume-color-3d']) {
        const run = validate([path.join(EXAMPLES, example)])
        assert.equal(run.status, 0, `${example}: ${run.output}`)
        assert.match(run.output, /^All definition checks passed$/m, `${example}: ${run.output}`)
    }
})

test('a package without a readable definition.json fails', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'portable-definition-'))
    try {
        mkdirSync(path.join(dir, 'glsl'))
        writeFileSync(path.join(dir, 'glsl', 'main.glsl'), 'void main() {}')
        const missing = validate([dir])
        assert.equal(missing.status, 1, missing.output)
        assert.match(missing.stderr, /FAIL: .*definition\.json/, missing.output)
        writeFileSync(path.join(dir, 'definition.json'), '{')
        const unreadable = validate([dir])
        assert.equal(unreadable.status, 1, unreadable.output)
        assert.match(unreadable.stderr, /FAIL: definition\.json is not JSON/, unreadable.output)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})
