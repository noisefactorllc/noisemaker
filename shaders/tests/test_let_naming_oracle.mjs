// A generative check of the names that planned steps record. Each generated
// program uses every effect at most once, so a step's op names the call it
// was written as. A call written in a `let`, or in a `use` argument that
// replaces a part's `let`, at any depth, comes from a let: its steps record no
// `occurrence`, `keyName` or `usePath`. That includes the let's call applied
// where the let's name is called, and an alias `let` that renames the effect
// such a call names. Every other effect step records an `occurrence` and a
// `keyName`, including a call of an alias `let` written outside any let.
//
// The programs come from a fixed-seed generator, so each run checks the same
// programs. Generated programs that do not compile are skipped; the test
// requires enough programs that do, and steps of every form.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compile } from '../src/lang/index.js'
import { registerEffect, registerOp, registerStarterOps, mergeIntoEnums, stdEnums } from '../src/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'effects/manifest.json'), 'utf8'))
mergeIntoEnums(stdEnums)

const pools = { S: [], F: [], M: [] }
for (const id of Object.keys(manifest).sort()) {
    const namespace = id.slice(0, id.lastIndexOf('/'))
    if (!['synth', 'filter', 'mixer'].includes(namespace)) continue
    const file = path.join(root, 'effects', id, 'definition.js')
    if (!fs.existsSync(file)) continue
    const { default: definition } = await import(pathToFileURL(file))
    const effect = typeof definition === 'function' ? new definition() : definition
    const name = `${namespace}.${effect.func}`
    registerEffect(name, effect)
    const choices = {}
    const args = Object.entries(effect.globals || {}).map(([key, spec]) => {
        const enumPath = spec.enum || spec.enumPath || (spec.choices ? `${namespace}.${effect.func}.${key}` : undefined)
        if (spec.choices) {
            choices[key] = Object.fromEntries(Object.entries(spec.choices)
                .filter(([label]) => !label.endsWith(':'))
                .map(([label, value]) => [label, { type: 'Number', value }]))
        }
        return {
            name: key, type: spec.type === 'vec4' ? 'color' : spec.type,
            default: spec.default, enum: enumPath, enumPath,
            min: spec.min, max: spec.max, uniform: spec.uniform, choices: spec.choices
        }
    })
    registerOp(name, { name: effect.func, args })
    if (Object.keys(choices).length) mergeIntoEnums({ [namespace]: { [effect.func]: choices } })
    if (effect.enums) mergeIntoEnums(effect.enums)
    if (manifest[id]?.starter) registerStarterOps([name])
    // Starters begin chains, filters follow them, and mixers take a `tex:` value.
    if (namespace === 'synth' && manifest[id]?.starter) pools.S.push(effect.func)
    else if (namespace === 'filter' && !manifest[id]?.starter) pools.F.push(effect.func)
    else if (namespace === 'mixer' && effect.globals?.tex) pools.M.push(effect.func)
}

const HEAD = 'search synth, filter, mixer\n'
// Every planned step, in plan order, inside branches and part statements too.
const allSteps = node => !node || typeof node !== 'object' ? []
    : Array.isArray(node) ? node.flatMap(allSteps)
        : [...(Array.isArray(node.chain) ? node.chain : []), ...['then', 'elif', 'else', 'body', 'plans'].flatMap(key => allSteps(node[key]))]

// A small seeded generator (mulberry32).
function generator(seed) {
    let state = seed
    const rng = () => {
        state |= 0
        state = state + 0x6D2B79F5 | 0
        let t = Math.imul(state ^ state >>> 15, 1 | state)
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
        return ((t ^ t >>> 14) >>> 0) / 4294967296
    }
    const pickOne = items => items[Math.floor(rng() * items.length)]
    const shuffle = items => {
        const copy = items.slice()
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]]
        }
        return copy
    }
    class OutOfEffects extends Error {}

    // One program, and for each effect whether its call comes from a let.
    function program() {
        const left = { S: shuffle(pools.S), F: shuffle(pools.F), M: shuffle(pools.M) }
        // Each effect's form: 'written' outside any let, or the effect of an
        // alias called outside any let ('aliasCall'); or from a 'let', an
        // 'override' use argument, or an 'alias' let that renames a let's call.
        const origin = new Map()
        let ids = 0
        let lets = 0
        const take = (pool, form) => {
            const name = left[pool].pop()
            if (!name) throw new OutOfEffects()
            origin.set(name, form)
            return name
        }
        const call = (name, args) => `${name}(${[args, rng() < 0.12 ? `_id: "e${++ids}"` : ''].filter(Boolean).join(', ')})`
        // ctx: { form, inLet, scope: [{ name, kind, starter, effect }], parts }
        function value(ctx, depth) {
            const values = ctx.scope.filter(l => l.kind === 'value')
            const r = rng()
            if (r < 0.25 && values.length) return pickOne(values).name
            if (r < 0.32 && depth < 2 && !ctx.inLet) return `pick(${value(ctx, depth + 1)}, ${value(ctx, depth + 1)})`
            return chainValue(ctx, depth)
        }
        function chainValue(ctx, depth) {
            const heads = ctx.scope.filter(l => l.kind === 'value' && l.starter)
            let source = heads.length && rng() < 0.2 ? `${pickOne(heads).name}()` : call(take('S', ctx.form), '')
            const count = Math.floor(rng() * 3)
            for (let i = 0; i < count; i++) source += item(ctx, depth + 1, false)
            return source
        }
        function item(ctx, depth, top) {
            const filterLets = ctx.scope.filter(l => l.kind === 'fcall')
            const mixerLets = ctx.scope.filter(l => l.kind === 'mcall')
            // An alias is called only outside any let, so its effect is written.
            const aliases = ctx.form === 'written' ? ctx.scope.filter(l => l.kind === 'callable alias') : []
            const r = rng()
            if (top && ctx.parts?.length && r < 0.25) return useOf(pickOne(ctx.parts), ctx)
            if (r < 0.35 && aliases.length) return `.${pickOne(aliases).name}()`
            if (r < 0.45 && filterLets.length) return `.${pickOne(filterLets).name}()`
            if (r < 0.55 && mixerLets.length && depth < 3) return `.${pickOne(mixerLets).name}(tex: ${value(ctx, depth)})`
            if (r < 0.75 && depth < 3) return `.${call(take('M', ctx.form), `tex: ${value(ctx, depth)}`)}`
            return `.${call(take('F', ctx.form), '')}`
        }
        function letExpression(kind, ctx) {
            const form = ctx.form === 'override' ? 'override' : 'let'
            const inner = { ...ctx, form, inLet: true }
            if (kind === 'value') {
                if (rng() < 0.3) return { source: call(take('S', form), ''), starter: true }
                return { source: chainValue(inner, 0), starter: false }
            }
            if (kind === 'fcall') {
                if (rng() < 0.5) {
                    const effect = take('F', form)
                    return { source: call(effect, ''), effect }
                }
                return { source: call(take('M', form), `tex: ${value(inner, 1)}`) }
            }
            return { source: call(take('M', form), '') }
        }
        function declareLet(ctx, prefix) {
            const kind = pickOne(['value', 'value', 'fcall', 'mcall'])
            const name = `${prefix}${++lets}`
            const expression = letExpression(kind, ctx)
            ctx.scope.push({ name, kind, starter: expression.starter, effect: expression.effect })
            return { name, kind, source: `let ${name} = ${expression.source}` }
        }
        // `let <effect> = <other effect>`: an alias that renames the effect a
        // filter let calls, so applying that let calls the other effect. The
        // alias is not itself called, since calling it directly is a call
        // written outside a let.
        function aliasLet(ctx) {
            const targets = ctx.scope.filter(l => l.kind === 'fcall' && l.effect && !ctx.scope.some(m => m.name === l.effect))
            if (!targets.length || rng() >= 0.5) return null
            const target = pickOne(targets)
            ctx.scope.push({ name: target.effect, kind: 'alias' })
            return `let ${target.effect} = ${take('F', 'alias')}`
        }
        // `let a<n> = <effect>`, an alias of its own name, called like a filter.
        function callableAlias(ctx) {
            if (rng() >= 0.5) return null
            const name = `a${++lets}`
            ctx.scope.push({ name, kind: 'callable alias' })
            return `let ${name} = ${take('F', 'aliasCall')}`
        }
        function overrideFor(declared, ctx) {
            const inner = { ...ctx, form: 'override' }
            const sameKind = ctx.scope.filter(l => l.kind === declared.kind && l.name !== declared.name)
            if (rng() < 0.2 && sameKind.length) return pickOne(sameKind).name
            if (declared.kind === 'value') return value(inner, 0)
            return letExpression(declared.kind, inner).source
        }
        function useOf(part, ctx) {
            const args = []
            if (rng() < 0.5) args.push(`_id: "u${++ids}"`)
            for (const declared of part.lets) if (rng() < 0.6) args.push(`${declared.name}: ${overrideFor(declared, ctx)}`)
            return `${part.statement ? '' : '.'}use(${[part.name, ...args].join(', ')})`
        }

        const top = { form: 'written', scope: [], parts: [] }
        const lines = []
        const topLets = Math.floor(rng() * 3)
        for (let i = 0; i < topLets; i++) lines.push(declareLet(top, 't').source)
        const topAlias = aliasLet(top)
        if (topAlias) lines.push(topAlias)
        const topCallable = callableAlias(top)
        if (topCallable) lines.push(topCallable)
        const statementParts = []
        const partCount = 1 + Math.floor(rng() * 3)
        for (let i = 0; i < partCount; i++) {
            const statement = rng() < 0.25
            const name = `${statement ? 'q' : 'p'}${i}`
            const ctx = { form: 'written', scope: [...top.scope], parts: top.parts.filter(p => !p.statement) }
            const partLets = []
            const body = []
            const letCount = Math.floor(rng() * 3)
            for (let k = 0; k < letCount; k++) {
                const declared = declareLet(ctx, 'h')
                partLets.push(declared)
                body.push(`  ${declared.source};`)
            }
            const partAlias = aliasLet(ctx)
            if (partAlias) body.push(`  ${partAlias};`)
            if (statement) {
                let source = call(take('S', 'written'), '')
                const count = 1 + Math.floor(rng() * 3)
                for (let k = 0; k < count; k++) source += item(ctx, 0, true)
                body.push(`  ${source}.write(o${1 + i % 2})`)
            } else {
                const count = 1 + Math.floor(rng() * 3)
                for (let k = 0; k < count; k++) body.push(`  ${item(ctx, 0, true)}`)
            }
            const part = { name, lets: partLets, statement }
            lines.push(`part ${name} {\n${body.join('\n')}\n}`)
            if (statement) statementParts.push(part)
            else top.parts.push(part)
        }
        const statements = 1 + Math.floor(rng() * 2)
        for (let i = 0; i < statements; i++) {
            const heads = top.scope.filter(l => l.kind === 'value' && l.starter)
            let source = heads.length && rng() < 0.15 ? `${pickOne(heads).name}()` : call(take('S', 'written'), '')
            const count = 1 + Math.floor(rng() * 3)
            for (let k = 0; k < count; k++) source += item(top, 0, true)
            lines.push(`${source}.write(o${i === 0 ? 0 : 3})`)
        }
        for (const part of statementParts) {
            const uses = 1 + Math.floor(rng() * 2)
            for (let j = 0; j < uses; j++) lines.push(useOf(part, top))
        }
        const seedLine = rng() < 0.5 ? `seed ${1 + Math.floor(rng() * 9)}\n` : ''
        return { source: `${HEAD}${seedLine}${lines.join('\n')}\nrender(o0)`, origin }
    }
    return () => {
        try { return program() } catch (error) {
            if (error instanceof OutOfEffects) return null
            throw error
        }
    }
}

const PROGRAMS = 1000
for (const seed of [1, 2, 3]) {
    test(`seed ${seed}: steps from a let record no names, and every other effect step records both`, () => {
        const next = generator(seed)
        let checked = 0
        let partSteps = 0
        const forms = { written: 0, aliasCall: 0, let: 0, override: 0, alias: 0 }
        const problems = []
        for (let i = 0; i < PROGRAMS; i++) {
            const generated = next()
            if (!generated) continue
            let result
            try { result = compile(generated.source) } catch { continue }
            if (result.diagnostics.some(d => d.severity === 'error')) continue
            checked++
            for (const step of allSteps(result.plans).filter(step => !step.builtin && !step.scene)) {
                const effect = step.op.split('.').pop()
                if (!generated.origin.has(effect)) {
                    problems.push(`${effect}: a step of no generated call\n${generated.source}`)
                    continue
                }
                const names = { occurrence: step.occurrence, keyName: step.keyName, usePath: step.usePath }
                const form = generated.origin.get(effect)
                forms[form]++
                if (form !== 'written' && form !== 'aliasCall') {
                    if ('occurrence' in step || 'keyName' in step || 'usePath' in step) {
                        problems.push(`${effect} comes from a let and records ${JSON.stringify(names)}\n${generated.source}`)
                    }
                } else {
                    if (step.usePath) partSteps++
                    if (typeof step.occurrence !== 'string' || typeof step.keyName !== 'string') {
                        problems.push(`${effect} is written outside any let and records ${JSON.stringify(names)}\n${generated.source}`)
                    }
                }
            }
        }
        assert.deepEqual(problems.slice(0, 3), [], `${problems.length} problems`)
        // The check means something only if it reached steps of every form.
        assert.ok(checked >= PROGRAMS / 3, `only ${checked} of ${PROGRAMS} generated programs compile`)
        for (const [form, count] of Object.entries(forms)) assert.ok(count > 0, `no ${form} steps: ${JSON.stringify(forms)}`)
        assert.ok(partSteps > 0, 'no written steps in a part body')
    })
}
