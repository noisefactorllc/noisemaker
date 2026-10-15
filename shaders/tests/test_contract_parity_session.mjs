#!/usr/bin/env node
//
// The AI development contract's testPixelParity section documents the
// browser-session launch path behind the verb's fail-closed WebGPU leg. The
// tool starts on WebGL2 but requests WebGPU browser capability for its later
// WebGPU leg. If the browser has no adapter, the tool returns an error before
// comparison. This guard checks the contract and delivered harness together.
//
// Run: node shaders/tests/test_contract_parity_session.mjs

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const contract = readFileSync(fileURLToPath(new URL('../../llms-full.txt', import.meta.url)), 'utf8')
const harness = readFileSync(fileURLToPath(new URL('../../vendor/shade-mcp/harness/index.js', import.meta.url)), 'utf8')

function launchOptionsSource() {
    const start = harness.indexOf('function getBrowserLaunchOptions(')
    assert.notEqual(start, -1, 'vendored harness no longer contains getBrowserLaunchOptions')
    const end = harness.indexOf('\n}\n', start)
    assert.notEqual(end, -1, 'vendored getBrowserLaunchOptions block is unterminated')
    return { block: harness.slice(start, end), outside: harness.slice(0, start) + harness.slice(end) }
}

describe('AI development contract tracks the parity session launch path', () => {
    test('the contract documents the WebGPU-capable session and fail-closed WebGPU leg', () => {
        assert.match(contract, /starts a WebGL2 viewer in a WebGPU-capable browser session/,
            'llms-full.txt no longer documents the parity verb\'s WebGPU-capable browser session')
        assert.match(contract, /failed backend switch reports `WebGPU leg: Backend switch\s+failed:/,
            'llms-full.txt no longer documents the earlier backend-switch failure')
        assert.match(contract, /WebGPU leg: The viewer is rendering on WebGL2, not the requested webgpu/,
            'llms-full.txt no longer documents the fail-closed WebGPU-leg mismatch message')
        assert.match(contract, /does not compare a fallback frame/,
            'llms-full.txt no longer states that the leg rejects fallback frames')
    })

    test('the delivered vendor harness launches a WebGPU-capable browser when requested', () => {
        const { block, outside } = launchOptionsSource()
        assert.match(harness, /this\.options\.webgpuCapable && this\.options\.backend !== "webgpu"/,
            'vendored harness no longer selects WebGPU launch options for capable WebGL2 sessions')
        assert.match(harness, /getBrowserLaunchOptions\(this\.options\.headless, launchBackend\)/,
            'vendored harness no longer passes the capable backend to browser launch options')
        assert.match(block, /backend === "webgpu"/,
            'vendored getBrowserLaunchOptions no longer branches on the webgpu backend')
        assert.match(block, /--enable-unsafe-webgpu/,
            'vendored getBrowserLaunchOptions no longer adds the WebGPU launch args')
        assert.doesNotMatch(outside, /--enable-unsafe-webgpu/,
            'vendored harness adds WebGPU launch args outside the webgpu backend branch')
        assert.match(block, /--enable-features=Vulkan/,
            'vendored getBrowserLaunchOptions no longer enables the Vulkan feature for WebGPU')
    })

    test('the delivered vendor harness fails a leg closed on a page-confirmed backend mismatch', () => {
        assert.match(harness, /The viewer is rendering on \$\{selection\.backend\}, not the requested \$\{requestedBackend\}/,
            'vendored harness no longer reports the page-confirmed backend mismatch')
        assert.match(harness, /backendNameMatches/,
            'vendored harness no longer exports the backend-name matcher')
    })
})
