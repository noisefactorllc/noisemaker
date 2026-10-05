#!/usr/bin/env node
//
// The AI development contract's testPixelParity section documents the
// browser-session launch path behind the verb's fail-closed WebGPU leg: the
// tool launches its session on the WebGL2 path, and a WebGL2-launched browser
// gets none of the WebGPU launch args, so on a host without a usable
// Vulkan-backed WebGPU adapter the WebGPU leg's rebuild falls back to WebGL2
// and the selection check fails closed. This guard pins that statement to the
// delivered vendor harness in both directions: the statement must be present,
// and the vendored launch-options code must still gate the WebGPU args behind
// the webgpu backend. Removing either side turns the JS suite red instead of
// waiting for an audit.
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
    test('the contract documents the WebGL2-path session and fail-closed WebGPU leg', () => {
        assert.match(contract, /launches on the WebGL2 launch path/,
            'llms-full.txt no longer documents the parity verb\'s WebGL2-path browser session')
        assert.match(contract, /WebGPU leg: The viewer is rendering on WebGL2, not the requested webgpu/,
            'llms-full.txt no longer documents the fail-closed WebGPU-leg mismatch message')
        assert.match(contract, /instead of comparing a fallback frame/,
            'llms-full.txt no longer states that the leg fails closed instead of comparing a fallback frame')
    })

    test('the delivered vendor harness gates the WebGPU launch args behind the webgpu backend', () => {
        const { block, outside } = launchOptionsSource()
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
