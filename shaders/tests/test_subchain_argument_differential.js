import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { compile, lex, parse } from '../src/lang/index.js'
import { registerOp } from '../src/lang/ops.js'
import { registerStarterOps } from '../src/lang/validator.js'

// Differential gate against the recorded baseline: the fixture holds the
// exact public compile() results (and thrown errors) of the recorded source
// revision for a generated subchain-argument corpus. Current code must match
// the baseline on acceptance, thrown errors, plans, render, vars, and
// searchNamespaces; the only permitted difference is added P008/P009/P010
// subchain-argument reports.
const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/subchain-argument-baseline.json'), 'utf8'))

registerOp('synth.diagProbe', { name: 'diagProbe', args: [] })
registerStarterOps(['synth.diagProbe'])
registerOp('synth.diagFilter', { name: 'diagFilter', args: [] })

for (const entry of fixture.corpus) {
    test(`differential vs recorded baseline ${fixture.corpus.indexOf(entry)}: ${entry.name}`, () => {
        let result = null
        let threw = null
        try {
            result = compile(entry.source)
        } catch (error) {
            threw = `${error.constructor.name}:${error.message}`
        }
        assert.equal(threw, entry.threw, 'acceptance or legacy error must match the recorded baseline')
        if (entry.threw) { return }
        const key = r => JSON.stringify({
            plans: r.plans, render: r.render, vars: r.vars, searchNamespaces: r.searchNamespaces
        })
        assert.equal(key(result), JSON.stringify({
            plans: entry.result.plans, render: entry.result.render,
            vars: entry.result.vars, searchNamespaces: entry.result.searchNamespaces
        }))
        // Only subchain-argument reports may be added beyond the baseline.
        const extra = result.diagnostics.filter(d =>
            !entry.result.diagnostics.some(x =>
                x.code === d.code && x.severity === d.severity
                && JSON.stringify(x.location) === JSON.stringify(d.location)))
        for (const d of extra) {
            assert.ok(['P008', 'P009', 'P010'].includes(d.code), `unexpected non-P008/P009/P010 diagnostic: ${d.code}`)
        }
    })
}

test('the recorded baseline is the revision GAP-027 was selected at', () => {
    assert.equal(fixture.baselineRevision, '3886ecfa41fdebdf2428f07fec05ab46602c07f2')
    assert.equal(fixture.corpus.length, 18)
})

// The parser is also exercised through the strict opt-in path so the
// differential corpus pins both the default and strict contracts.
test('strict opt-in throws only legacy codes or the contract codes on the corpus', () => {
    const strictThrows = {}
    for (const entry of fixture.corpus) {
        try {
            parse(lex(entry.source), { subchainArguments: 'strict' })
        } catch (error) {
            strictThrows[entry.name] = error.diagnostic?.code
        }
    }
    assert.deepEqual(strictThrows, {
        'permissive-legacy': 'P008',
        'missing-separator': 'P010',
        'unknown-key': 'P008',
        'double-comma': 'P002',
        'repeated-keys': 'P010',
        'comment-in-args': 'P010',
        'missing-value': 'P002',
        'numeric-key': 'P002',
        'non-string-value': 'P006',
        'positional-then-keyword': 'P002',
        'string-not-key': 'P002'
    })
})