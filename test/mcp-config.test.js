import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const config = JSON.parse(fs.readFileSync(path.join(repoRoot, '.mcp.json'), 'utf8'))

test('Shade MCP resolves from an immutable Git commit', () => {
  const shade = config.mcpServers?.shade

  assert.ok(shade, 'missing shade MCP server configuration')
  assert.equal(shade.command, 'npx')
  assert.equal(shade.args?.length, 2)
  assert.equal(shade.args?.[0], '-y')
  assert.match(
    shade.args?.[1] ?? '',
    /^github:noisedeck\/shade-mcp#[0-9a-f]{40}$/,
    'pin Shade MCP to a full lowercase Git commit SHA'
  )
})
