/**
 * Seed edits on a compiled program: the program seed, the binding of a
 * parameter, and pins. Each edit changes the compiled program in place; the
 * caller unparses it to get the new source.
 *
 * A step is addressed as ProgramState addresses it: by its index among the
 * steps of the program's top-level chains, in order.
 */
import { pinSeed } from './draws.js'

/** The step at a top-level index, and its plan's index. */
export function stepAt(compiled, stepIndex) {
    let index = 0
    const plans = compiled?.plans || []
    for (let planIndex = 0; planIndex < plans.length; planIndex++) {
        for (const step of plans[planIndex].chain || []) {
            if (index === stepIndex) return { step, planIndex }
            index++
        }
    }
    return null
}

/** Set or remove the program seed. */
export function setProgramSeed(compiled, seed) {
    if (seed === null || seed === undefined) {
        delete compiled.seed
        return
    }
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
        throw new RangeError(`A seed is a whole number from 0 to 4294967295, got ${seed}`)
    }
    compiled.seed = seed
}

/**
 * How a parameter's value is set: by a random call (`random`, with its
 * source node), by inheriting the program seed (`inherited-seed`), or by
 * neither (null).
 */
export function bindingOf(compiled, stepIndex, param) {
    const found = stepAt(compiled, stepIndex)
    if (!found) return null
    const { step } = found
    if (step.randomSources?.[param]) return { kind: 'random', source: step.randomSources[param] }
    const value = step.args?.[param]
    if (value && typeof value === 'object' && value._varRef && letFor(compiled, value._varRef, found.planIndex)) {
        return { kind: 'random', let: value._varRef }
    }
    if (step.inheritedSeeds?.[param]) return { kind: 'inherited-seed' }
    return null
}

// The top-level `let` of a name that a plan reads: the last one declared
// before the plan. Only random lets have a source.
function letFor(compiled, name, planIndex) {
    let found = null
    for (const v of compiled.vars || []) {
        if (v.name === name && (v.planIndex ?? 0) <= planIndex) found = v
    }
    return found && compiled.letSources?.has(found) ? found : null
}

// Pairs of (node to write, node that drew) for every random call a value
// depends on: the calls written in it, and those of the random lets it reads.
function randomCalls(compiled, written, drawn, planIndex, pairs, seenLets) {
    if (!written || typeof written !== 'object') return
    if (Array.isArray(written)) {
        written.forEach((w, i) => randomCalls(compiled, w, drawn?.[i], planIndex, pairs, seenLets))
        return
    }
    const letName = written.type === 'Ident' ? written.name : drawn?._varRef
    if (letName && (written.type === 'Ident' || drawn?._varRef)) {
        const v = letFor(compiled, letName, planIndex)
        if (v && !seenLets.has(v)) {
            seenLets.add(v)
            randomCalls(compiled, v.expr, compiled.letSources.get(v), planIndex, pairs, seenLets)
        }
        if (written.type === 'Ident') return
    }
    if (written.type === 'Random') pairs.push({ written, drawn: drawn || written, origin: written._origin || written })
    for (const key of Object.keys(written)) {
        if (key === 'loc' || key === '_varRef') continue
        const child = written[key]
        if (child && typeof child === 'object') randomCalls(compiled, child, drawn?.[key], planIndex, pairs, seenLets)
    }
}

function callsOf(compiled, stepIndex, param) {
    const found = stepAt(compiled, stepIndex)
    if (!found) throw new RangeError(`No step ${stepIndex}`)
    const { step, planIndex } = found
    const pairs = []
    const source = step.randomSources?.[param]
    if (source) {
        randomCalls(compiled, source, source, planIndex, pairs, new Set())
    } else {
        const value = step.args?.[param]
        if (value && typeof value === 'object' && value._varRef) {
            randomCalls(compiled, { type: 'Ident', name: value._varRef }, null, planIndex, pairs, new Set())
        }
    }
    return { step, pairs }
}

// A random call written in a part body is shared by every use of the part.
function sharedByUses(compiled, origin) {
    let uses = 0
    for (const plan of compiled.plans || []) {
        for (const step of plan.chain || []) {
            for (const source of Object.values(step.randomSources || {})) {
                const found = []
                randomCalls(compiled, source, source, Infinity, found, new Set())
                if (found.some(pair => pair.origin === origin)) uses++
            }
        }
    }
    return uses > 1
}

/**
 * Pin a parameter: write into every random call its value depends on the
 * call-level `seed:` that reproduces its draw, so that the value stays
 * through reseeds and structural edits. An inherited seed becomes the
 * effect's own seed. Returns false when the parameter has nothing to pin.
 */
export function pinParameter(compiled, stepIndex, param) {
    const { step, pairs } = callsOf(compiled, stepIndex, param)
    if (pairs.length === 0) {
        if (!step.inheritedSeeds?.[param]) return false
        delete step.inheritedSeeds[param]
        step.authoredSeeds = [...(step.authoredSeeds || []), param]
        return true
    }
    for (const { origin } of pairs) {
        if (sharedByUses(compiled, origin)) {
            throw new Error(`'${param}' draws in a part that is used more than once; pin it at the use instead`)
        }
    }
    for (const { written, drawn, origin } of pairs) {
        if (written.kwargs?.seed !== undefined) continue
        if (drawn._draw === undefined) throw new Error(`'${param}' has a random call that has not drawn`)
        // Written both where the compiled step keeps it and in the source
        // statement, which the unparser writes for parts and maybes.
        for (const node of new Set([written, origin])) {
            node.kwargs = { ...(node.kwargs || {}), seed: { type: 'Number', value: pinSeed(drawn._draw) } }
        }
    }
    return true
}

/**
 * Unpin a parameter: remove the call-level `seed:` from the random calls its
 * value depends on, except calls that a parameter in `keep` (pairs of step
 * index and parameter, still pinned) also depends on.
 */
export function unpinParameter(compiled, stepIndex, param, keep = []) {
    const { pairs } = callsOf(compiled, stepIndex, param)
    const kept = new Set()
    for (const [index, name] of keep) {
        for (const { origin } of callsOf(compiled, index, name).pairs) kept.add(origin)
    }
    let changed = false
    for (const { written, origin } of pairs) {
        if (kept.has(origin)) continue
        for (const node of new Set([written, origin])) {
            if (node.kwargs?.seed === undefined) continue
            const rest = { ...node.kwargs }
            delete rest.seed
            if (Object.keys(rest).length) node.kwargs = rest
            else delete node.kwargs
            changed = true
        }
    }
    return changed
}
