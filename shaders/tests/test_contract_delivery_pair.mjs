#!/usr/bin/env node
//
// The AI development contract's "Source snapshots used for this contract"
// block pins the audited pair, the negotiated protocol triple, and the
// repository's immutable Shade MCP pin, and the freshness rules require the
// block and the configured pin to advance together. Nothing else kept them
// synchronized: a pin or release bump that skips the contract edit left the
// documented delivery identity stale until the next audit caught it. This
// guard pins the documented delivery identity to the configured delivery in
// both directions, from checked-in files only (no network):
//
//   1. `.mcp.json` must reference exactly one immutable
//      `github:noisedeck/shade-mcp#<sha>` package, never a floating branch.
//   2. `llms-full.txt` must document the same immutable pin in its
//      repository-config statement.
//   3. The documented server version and the release the config claims is
//      delivered to `vendor/shade-mcp/` must be the same version.
//   4. The vendored delivery must still be present (the four pulled subtrees
//      the release delivery consists of).
//
// Run: node shaders/tests/test_contract_delivery_pair.mjs

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const read = (relative) => readFileSync(`${repoRoot}/${relative}`, 'utf8')

function configuredPin() {
    const config = JSON.parse(read('.mcp.json'))
    const servers = Object.values(config.mcpServers ?? {})
    assert.equal(servers.length, 1, '.mcp.json must configure exactly one MCP server')
    const server = servers[0]
    assert.equal(server.command, 'npx', '.mcp.json must launch the shade MCP server through npx')
    const args = server.args ?? []
    assert.ok(args.includes('-y'), '.mcp.json npx args must keep -y')
    const refs = args.filter((arg) => /^github:noisedeck\/shade-mcp#[0-9a-f]{40}$/.test(arg))
    assert.equal(refs.length, 1,
        '.mcp.json must pin exactly one immutable github:noisedeck/shade-mcp#<sha> commit')
    return refs[0].split('#')[1]
}

function documentedDelivery() {
    const contract = read('llms-full.txt')
    const pins = [...contract.matchAll(/github:noisedeck\/shade-mcp#([0-9a-f]{40})/g)].map((m) => m[1])
    assert.equal(pins.length, 1,
        'llms-full.txt must document the repository config\'s immutable pin exactly once')
    const versions = [...contract.matchAll(/server version `(\d+\.\d+\.\d+)`/g)].map((m) => m[1])
    assert.equal(versions.length, 1, 'llms-full.txt must document the negotiated server version exactly once')
    const releases = [...contract.matchAll(/matching release v(\d+\.\d+\.\d+) delivered to `vendor\/shade-mcp\/`/g)].map((m) => m[1])
    assert.equal(releases.length, 1,
        'llms-full.txt must state which release is delivered to vendor/shade-mcp/ exactly once')
    const snapshots = [...contract.matchAll(/^- (Noisemaker|Shade MCP): `([0-9a-f]{40})`\.$/gm)]
    const names = snapshots.map((m) => m[1])
    assert.ok(names.includes('Noisemaker') && names.includes('Shade MCP'),
        'llms-full.txt must pin both source snapshot commits in its snapshot block')
    return { pin: pins[0], version: versions[0], release: releases[0] }
}

function vendoredDelivery() {
    for (const subdir of ['harness', 'ai', 'formats', 'analysis']) {
        const dir = `${repoRoot}/vendor/shade-mcp/${subdir}`
        assert.ok(existsSync(dir) && statSync(dir).isDirectory(),
            `vendor/shade-mcp/${subdir} is missing from the vendored delivery`)
    }
    assert.ok(existsSync(`${repoRoot}/vendor/shade-mcp/harness/index.js`),
        'vendor/shade-mcp/harness/index.js is missing from the vendored delivery')
}

describe('AI development contract tracks the configured Shade MCP delivery', () => {
    test('the configured pin is immutable and matches the documented pin', () => {
        const pin = configuredPin()
        const docs = documentedDelivery()
        assert.equal(docs.pin, pin,
            'llms-full.txt documents a different immutable pin than .mcp.json configures')
    })

    test('the documented server version matches the documented vendor release', () => {
        const docs = documentedDelivery()
        assert.equal(docs.version, docs.release,
            'llms-full.txt documents a server version and a vendor release that disagree')
    })

    test('the vendored delivery is present', () => {
        vendoredDelivery()
    })
})