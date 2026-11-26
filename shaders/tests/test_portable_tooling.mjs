// Portable's developer tools in Noisemaker. The relocation map
// (shaders/tests/fixtures/portable/relocation-map.json) lists every path of
// Portable's tree at its recorded SHA, `git ls-tree -r --name-only <sha>`, each
// with its Noisemaker destination or the reason it has none. The vendored
// shade-mcp tree is one entry, vendor/shade-mcp/, because Noisemaker vendors
// shade-mcp itself and each shade-mcp release changes those paths.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'shaders/tests/fixtures/portable/relocation-map.json'), 'utf8'))

test('the relocation map gives every Portable path a destination that exists, or the reason it has none', () => {
    assert.equal(MAP.source?.repository, 'https://github.com/noisefactorllc/portable')
    assert.match(MAP.source?.sha ?? '', /^[0-9a-f]{40}$/, 'the map records the Portable commit its paths are from')
    const entries = Object.entries(MAP.paths ?? {})
    assert.ok(entries.length > 0, 'the map lists paths')
    const problems = []
    for (const [source, entry] of entries) {
        const keys = Object.keys(entry ?? {}).sort()
        if (keys.length !== 1 || !['destination', 'reason'].includes(keys[0])) {
            problems.push(`${source}: has ${JSON.stringify(keys)}, not one destination or one reason`)
            continue
        }
        const value = entry[keys[0]]
        if (typeof value !== 'string' || value.trim() === '') {
            problems.push(`${source}: its ${keys[0]} is empty`)
            continue
        }
        if (keys[0] === 'destination') {
            const target = path.join(ROOT, value)
            const stat = fs.existsSync(target) ? fs.statSync(target) : null
            if (!stat) problems.push(`${source}: its destination ${value} does not exist`)
            else if (value.endsWith('/') ? !stat.isDirectory() : !stat.isFile()) {
                problems.push(`${source}: its destination ${value} is not a ${value.endsWith('/') ? 'directory' : 'file'}`)
            }
        }
    }
    assert.deepEqual(problems, [])
})

test('the relocation map holds the paths that other repositories consume, and Portable\'s workflows', () => {
    const paths = Object.keys(MAP.paths)
    // shade-mcp's CI reads the starter effect and the two-effect workspace.
    for (const file of ['definition.json', 'help.md', 'glsl/gradientSweep.glsl', 'wgsl/gradientSweep.wgsl']) {
        assert.ok(paths.includes(`effect/${file}`), `effect/${file}`)
    }
    assert.ok(paths.includes('fixtures/two-effect-workspace.json'))
    for (const workflow of ['pull-shade-mcp.yml', 'release-notify.yml', 'docs.yml', 'test.yml', 'dependabot-auto-merge.yml']) {
        assert.ok(paths.includes(`.github/workflows/${workflow}`), workflow)
    }
    assert.ok(paths.includes('.github/dependabot.yml'))
    const vendored = paths.filter(file => file.startsWith('vendor/'))
    assert.deepEqual(vendored, ['vendor/shade-mcp/'], 'the vendored tree is one entry')
})
