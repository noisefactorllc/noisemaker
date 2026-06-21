#!/usr/bin/env node
/**
 * Regression tests for synth/remap's cross-repo contract with the Remap app.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../..')

let passed = 0
let failed = 0

async function test(name, fn) {
    try {
        await fn()
        console.log(`PASS: ${name}`)
        passed++
    } catch (err) {
        console.error(`FAIL: ${name}`)
        console.error(err)
        failed++
    }
}

await test('synth/remap definition imports and exposes a valid default program', async () => {
    const { default: effect } = await import('../effects/synth/remap/definition.js')

    assert.equal(effect.namespace, 'synth')
    assert.equal(effect.func, 'remap')
    assert.equal(effect.defaultProgram, 'search synth\n\nremap(bgColor: #336699, bgAlpha: 1)\n  .write(o0)')
})

await test('synth/remap GLSL packs zone data in a uniform block', () => {
    const source = fs.readFileSync(
        path.join(root, 'shaders/effects/synth/remap/glsl/remap.glsl'),
        'utf8'
    )

    assert.match(source, /uniform\s+RemapUniforms\s*\{\s*vec4\s+data\s*\[267\]\s*;/s)
    assert.doesNotMatch(source, /\buniform\s+vec4\s+zone\d+_v\d+\b/)
})

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`)
    process.exit(1)
}

console.log(`\n${passed} test(s) passed`)
