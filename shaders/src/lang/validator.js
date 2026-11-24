import diagnostics from './diagnostics.js'
import enums from './enums.js'
import { stdEnums } from './std_enums.js'
import { ops } from './ops.js'
import { normalizeMemberPath, pathStartsWith, applyEnumPrefix } from './enumPaths.js'
import { resolveParamAliases } from './paramAliases.js'
import { checkEffectAlias } from './effectAliases.js'
import { decodeJsonStringLiteralContent } from './stringLiterals.js'
import { SURFACE } from '../stability.js'
import { drawU32, joinKey, randIntFrom } from './draws.js'
import { RandomCallError, containsRandom, resolveRandom, sourceCallsRandom } from './randomize.js'

/**
 * STRICT ALLOWLIST FOR STRING PARAMETERS
 *
 * !! WARNING: DO NOT EXPAND THIS ALLOWLIST !!
 *
 * Format: "effect.param" where effect is the func name (e.g., "text.text")
 */
const ALLOWED_STRING_PARAMS = new Set([
    'text.text',     // Text content for text overlay effect
    'text.font',     // Font family for text overlay effect
    'text.justify',  // Text justification (left/center/right)
    // Named cut within the family ("Bold Italic", or "Argon Medium Italic" for
    // a family bundling several typefaces). Same category as text.font above:
    // the valid values are whatever the host's installed font bundle provides,
    // so this cannot be an enum or a choices map. It has to reach the DSL or
    // the unparser drops it and every recompile reverts the text to the
    // family's first cut.
    'text.style',
    // MIDI input identity mirrors the Web MIDI MIDIPort surface. These are
    // descriptor fields rather than effect parameters, but remain here so
    // every accepted free-form string has one auditable allowlist.
    'midi.name',
    'midi.id',
    // Audio input identity mirrors MediaDeviceInfo. As with MIDI, these are
    // descriptor fields and the only audio strings permitted through the DSL.
    'audio.name',
    'audio.id',
])

const stateSurfaces = new Set(['time','frame','mouse','resolution','seed','a'])
const stateValues = new Set(['time','frame','mouse','resolution','seed','a','u1','u2','u3','u4','s1','s2','b1','b2','a1','a2','deltaTime'])
const STARTER_OPS = new Set()

const SURFACE_PASSTHROUGH_CALLS = new Set(['read'])

/**
 * Scene DSL function names.
 * These are recognized as scene description primitives and pass through
 * the validator without requiring an ops registration. The scene compiler
 * (a later pipeline stage) is responsible for interpreting them.
 */
// The scene vocabulary is what the stability registry lists.
const SCENE_FUNCTIONS = new Set(Object.keys(SURFACE.sceneCalls))

const validatorHooks = {}

const AUTOMATION_FIELDS = {
    Oscillator: ['oscType', 'min', 'max', 'speed', 'offset', 'seed'],
    Midi: ['channel', 'mode', 'min', 'max', 'sensitivity', 'name', 'id', 'cc', 'nrpn', 'zone', 'members'],
    Audio: ['band', 'min', 'max', 'channel', 'name', 'id']
}
const MAX_AUTOMATION_DEPTH = 8

export function registerValidatorHook(name, hook) {
    if (typeof name === 'string' && typeof hook === 'function') {
        validatorHooks[name] = hook
    }
}

export function registerStarterOps(names = []) {
    if (!Array.isArray(names)) { return }
    names.forEach((name) => {
        if (typeof name === 'string' && name) {
            STARTER_OPS.add(name)
        }
    })
}

export function isStarterOp(name) {
    if (typeof name !== 'string') { return false }
    // Force particles to be non-starter (workaround for stale manifest/cache)
    if (name === 'particles' || name === 'render.particles') return false
    // Check exact name first
    if (STARTER_OPS.has(name)) {
        return true
    }
    // For namespaced names like nm.voronoi
    const parts = name.split('.')
    if (parts.length > 1) {
        const canonical = parts[parts.length - 1]
        // If the bare canonical is a starter, check if any namespaced version exists
        if (STARTER_OPS.has(canonical)) {
            // Look for any "X.canonical" in STARTER_OPS
            for (const op of STARTER_OPS) {
                if (op.endsWith('.' + canonical)) {
                    // A namespaced starter exists (e.g., basics.voronoi)
                    // Since our exact name (nm.voronoi) wasn't found, we're not a starter
                    return false
                }
            }
            // No namespaced version - bare name applies
            return true
        }
    }
    return false
}

export function clamp(value, min, max) {
    if (typeof min === 'number' && value < min) return min
    if (typeof max === 'number' && value > max) return max
    return value
}

function toBoolean(value) {
    return typeof value === 'number' ? value !== 0 : !!value
}

function toSurface(arg) {
    if (!arg) return null
    if (arg.type === 'OutputRef') return {kind:'output', name:arg.name}
    if (arg.type === 'SourceRef') return {kind:'source', name:arg.name}
    if (arg.type === 'XyzRef') return {kind:'xyz', name:arg.name}
    if (arg.type === 'VelRef') return {kind:'vel', name:arg.name}
    if (arg.type === 'RgbaRef') return {kind:'rgba', name:arg.name}
    if (arg.type === 'MeshRef') return {kind:'mesh', name:arg.name}
    if (arg.type === 'Ident' && arg.name === 'none') return {kind:'output', name:'none'}
    if (arg.type === 'Ident' && stateSurfaces.has(arg.name)) return {kind:'state', name:arg.name}
    return null
}

function callToSurface(node) {
    if (!node || typeof node !== 'object') { return null }
    if (node.type === 'Chain' && Array.isArray(node.chain) && node.chain.length === 1) {
        return callToSurface(node.chain[0])
    }
    if (node.type !== 'Call' || !SURFACE_PASSTHROUGH_CALLS.has(node.name)) { return null }
    let target = null
    if (Array.isArray(node.args) && node.args.length) {
        target = node.args[0]
    }
    if (!target && node.kwargs && typeof node.kwargs === 'object') {
        target = node.kwargs.tex
    }
    if (!target) { return null }
    return toSurface(target)
}

/**
 * Semantic validator producing a flattened chain with temporary surfaces
 * @param {object} ast
 * @returns {object} PlannedChain {chain, out, final, diagnostics}
 */
export function validate(ast) {
    const diagnosticsList = []
    // Identifier nodes that already have their S003 for a read before the let
    const readsBeforeLet = new WeakSet()
    function pushDiag(code, node, message = diagnostics[code].message) {
        if (node && typeof node === 'object' && readsBeforeLet.has(node)) return
        // Enrich message with identifier/location context when available
        let enrichedMessage = message
        const identName = extractIdentifierName(node)
        // Only append identifier if not already in message
        if (identName && !message.includes(identName) && !message.includes("'")) {
            enrichedMessage = `${message}: '${identName}'`
        }
        // Add source location if available
        let location = null
        if (node?.loc) {
            location = { line: node.loc.line, column: node.loc.column ?? node.loc.col }
        }
        diagnosticsList.push({
            code,
            message: enrichedMessage,
            severity: diagnostics[code].severity,
            nodeId: node?.id,
            ...(location && { location }),
            ...(identName && { identifier: identName })
        })
    }

    function extractIdentifierName(node) {
        if (!node) return null
        if (node.type === 'Ident') return node.name
        if (node.type === 'Member' && Array.isArray(node.path)) return node.path.join('.')
        if (node.type === 'Call') return node.name
        if (node.type === 'Func' && node.src) return `{${node.src.slice(0, 30)}${node.src.length > 30 ? '...' : ''}}`
        // Fallback: try to extract any name-like property
        if (node.name) return node.name
        if (node.value) return String(node.value)
        // Debug: show what we got
        return `[${node.type || 'unknown'}]`
    }
    const plans = []
    const render = ast.render ? ast.render.name : null
    let tempIndex = 0

    // Element ids (`_id:`). An element's `_id:` is checked and copied into
    // its step's args here. Duplicates are settled once the whole program is
    // compiled (settleElementIds): the first element in traversal order, the
    // order of the step numbers, keeps the id, and each later one gets S010
    // and `idDuplicate`, so it keeps its position key. Step numbers survive
    // an unparse round trip, so the same element keeps the id after it. An `_id:` written inside a `let` value carries
    // the number of that value in `_letIdOrigin`; a second element that takes
    // it gets S011 instead.
    const ELEMENT_ID = /^[A-Za-z][A-Za-z0-9_]*$/
    const elementIdRecords = new Map()
    const letIdUses = new Set()
    let letIdOrigins = 0

    function elementId(idNode, element, args) {
        if (idNode === undefined) return
        const at = idNode?.loc ? idNode : element
        if (idNode?.type !== 'String' || idNode._varRef !== undefined || !ELEMENT_ID.test(idNode.value)) {
            pushDiag('S001', at, "_id: takes a string literal of letters, digits and '_' that starts with a letter")
            return
        }
        const id = idNode.value
        args._id = id
        const origin = idNode._letIdOrigin
        if (origin !== undefined) {
            if (letIdUses.has(origin)) {
                pushDiag('S011', at, `_id: "${id}" is in a 'let' value used more than once, so its uses would share one id`)
                return
            }
            letIdUses.add(origin)
        }
        elementIdRecords.set(args, { id, at })
    }

    // A read() or read3d() passed as a parameter value is a surface, not a
    // chain element, so it takes no `_id:`.
    function rejectValueId(node) {
        if (node && node._id !== undefined) {
            pushDiag('S001', node._id?.loc ? node._id : node, "_id: names a chain element, and a 'read()' or 'read3d()' passed as a value is not one")
        }
    }

    function settleElementIds(plans) {
        const steps = []
        const visit = (node) => {
            if (!node || typeof node !== 'object') return
            if (Array.isArray(node)) { node.forEach(visit); return }
            if (Array.isArray(node.chain)) {
                for (const step of node.chain) if (step?.args && elementIdRecords.has(step.args)) steps.push(step)
            }
            for (const key of ['then', 'elif', 'else', 'body']) visit(node[key])
        }
        visit(plans)
        const byId = new Map()
        for (const step of steps) {
            const record = { ...elementIdRecords.get(step.args), step }
            if (!byId.has(record.id)) byId.set(record.id, [])
            byId.get(record.id).push(record)
        }
        for (const [id, records] of byId) {
            records.sort((a, b) => a.step.temp - b.step.temp)
            for (const record of records.slice(1)) {
                record.step.idDuplicate = true
                pushDiag('S010', record.at, `Duplicate _id: "${id}": another element, compiled before this one, keeps it`)
            }
        }
    }

    // Number each `_id:` written in a `let` value, once, so that every use of
    // the value carries the same origin through `clone()`.
    function markLetIds(node) {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) { node.forEach(markLetIds); return }
        for (const holder of [node, node.kwargs]) {
            const idNode = holder && typeof holder === 'object' ? holder._id : undefined
            if (idNode && typeof idNode === 'object' && idNode._letIdOrigin === undefined) {
                idNode._letIdOrigin = ++letIdOrigins
            }
        }
        for (const value of Object.values(node)) markLetIds(value)
    }

    const programSearchOrder = ast.namespace?.searchOrder
    if (!programSearchOrder || programSearchOrder.length === 0) {
        throw new Error("Missing required 'search' directive. Every program must start with 'search <namespace>, ...' to specify namespace search order.")
    }

    const symbols = new Map()

    // Seeded randomization. A program without a seed directive draws from 0.
    const programSeed = ast.seed ? ast.seed.value : 0
    const hasSeedDirective = !!ast.seed
    // The key scope of the statement being compiled: an `if` branch adds
    // `if_<n>/b<k>`.
    const keyScope = []
    // Occurrence names: the elements of each effect name, counted in source
    // order across the program.
    const occurrenceCounts = new Map()
    function nextOccurrence(effectName) {
        const n = (occurrenceCounts.get(effectName) || 0) + 1
        occurrenceCounts.set(effectName, n)
        return `${effectName}_${n}`
    }
    let ifCount = 0
    // Declarations of each `let` name in one key scope.
    const letDeclarations = new Map()
    // The key of the value an effect is passed into, while it compiles.
    const valueKeys = []
    // The seeds of the enclosing `_seed:` scopes, innermost last.
    const seedScopes = []
    const scopeSeed = () => (seedScopes.length ? seedScopes[seedScopes.length - 1] : programSeed)

    function choicesFor(effect, param) {
        let candidates = []
        if (effect.type === 'Member' && effect.path?.length === 2) {
            candidates = [`${effect.path[0]}.${effect.path[1]}`]
        } else if (effect.type === 'Ident') {
            candidates = (programSearchOrder || []).map(ns => `${ns}.${effect.name}`)
                .filter(name => ops[name])
            if (candidates.length > 1) {
                throw new RandomCallError(effect, `choices(): effect name '${effect.name}' is ambiguous: ${candidates.join(', ')}`)
            }
        } else {
            throw new RandomCallError(effect, 'choices() requires an effect name')
        }
        const spec = candidates.length ? ops[candidates[0]] : null
        const effectName = effect.type === 'Member' ? effect.path.join('.') : effect.name
        if (!spec) {
            throw new RandomCallError(effect, `choices(): unknown effect '${effectName}'`)
        }
        if (param.type !== 'Ident') {
            throw new RandomCallError(param, 'choices() requires a parameter name')
        }
        const def = (spec.args || []).find(d => d.name === param.name)
        if (!def) {
            throw new RandomCallError(param, `choices(): effect '${effectName}' has no parameter named '${param.name}'`)
        }
        if (!def.choices || typeof def.choices !== 'object') {
            throw new RandomCallError(param, `choices(): parameter '${param.name}' of '${effectName}' has no choices`)
        }
        return Object.keys(def.choices)
    }

    function randomContext(key, seed = scopeSeed(), absolute = false) {
        return {
            seed,
            key: absolute ? key : joinKey(...keyScope, key),
            isShadowed: name => symbols.has(name),
            choicesFor
        }
    }

    // Resolve the random calls in a value written at `key`. Returns the
    // resolved value, or undefined after reporting an error.
    function resolveRandomAt(node, key, seed, absolute) {
        try {
            return resolveRandom(node, randomContext(key, seed, absolute))
        } catch (error) {
            if (!(error instanceof RandomCallError)) throw error
            pushDiag(error.code, error.node || node, error.message)
            return undefined
        }
    }

    // Whether an effect call, or a chain of them, has a random call among
    // its arguments.
    function callsHaveRandom(node) {
        if (!node || typeof node !== 'object') return false
        if (node.type === 'Chain') return node.chain.some(callsHaveRandom)
        if (node.type === 'Call') {
            return [...(node.args || []), ...Object.values(node.kwargs || {})]
                .some(arg => containsRandom(arg) || callsHaveRandom(arg))
        }
        return false
    }

    function resolveEnum(path) {
        if (!Array.isArray(path) || path.length === 0) return undefined
        let [head, ...rest] = path
        let cur
        if (symbols.has(head)) {
            cur = symbols.get(head)
            if (cur && (cur.type === 'Number' || cur.type === 'Boolean')) cur = cur.value
        } else if (Object.prototype.hasOwnProperty.call(enums, head)) {
            cur = enums[head]
        } else if (Object.prototype.hasOwnProperty.call(stdEnums, head)) {
            // Also check stdEnums for oscKind, oscType, palette, etc.
            cur = stdEnums[head]
        } else {
            return undefined
        }
        for (const part of rest) {
            if (cur && Object.prototype.hasOwnProperty.call(cur, part)) {
                cur = cur[part]
            } else {
                return undefined
            }
        }
        if (cur && (cur.type === 'Number' || cur.type === 'Boolean')) return cur.value
        return cur
    }

    // A bare name the parameter defines itself, as an inline choice or a
    // member of its enum, means that value even where it shadows a state
    // value such as `seed` or `a`. The unparser writes choices by bare name,
    // so `geometry: seed` and `channel: a` must read back as written.
    function isOwnChoice(def, name) {
        if (def.choices && typeof def.choices[name] === 'number') return true
        const enumPath = def.enumPath || def.enum
        if (!enumPath) return false
        const resolved = resolveEnum(applyEnumPrefix([name], normalizeMemberPath(enumPath)))
        return typeof resolved === 'number'
    }

    function clone(node) {
        return node && typeof node === 'object' ? JSON.parse(JSON.stringify(node)) : node
    }

    function canResolveOpName(name) {
        // Check if a bare op name can resolve via the search order
        for (const ns of programSearchOrder) {
            if (ops[`${ns}.${name}`]) return true
        }
        return false
    }

    // A call written with both positional and keyword arguments. A call
    // merged from a `let` (see resolveCall) has both too, but is not written
    // this way.
    function isWrittenMixed(call) {
        if (call.positionalsByIndex) return false
        return !!(call.args && call.args.length > 0 && call.kwargs && Object.keys(call.kwargs).length > 0)
    }

    function resolveCall(call) {
        // console.log('Resolving call:', call.name, symbols.has(call.name));
        if (symbols.has(call.name)) {
            const val = symbols.get(call.name)
            // A `let` that holds the scene call of its own name. A call of
            // that name is applied to it once, where the call is written, and
            // the `let` itself is read as it is. Applied again each time it is
            // read, as a call of an effect is, it would carry each of the
            // let's arguments twice.
            const selfNamed = val.type === 'Call' && val.name === call.name &&
                SCENE_FUNCTIONS.has(call.name) && !canResolveOpName(call.name)
            if (selfNamed && call.letApplied) return call
            if (selfNamed && expanding.at(-1) === call.name) return {...call, letApplied: true}
            // console.log('Found symbol:', val);
            if (val.type === 'Ident') {
                return {...call, name: val.name}
            }
            if (val.type === 'Call') {
                const mergedArgs = val.args ? val.args.slice() : []
                // Merge positional args: call-site args override stored args by index?
                // Actually, partial application usually appends?
                // "Positional Arguments: Appended to the stored arguments." (LANGUAGE.md)
                // My previous logic was: mergedArgs[i] = call.args[i] (Override/Overlay)

                // Let's fix this to APPEND.
                const callArgs = call.args || []
                for (let i = 0; i < callArgs.length; i++) {
                    mergedArgs.push(callArgs[i])
                }

                let mergedKw = val.kwargs ? {...val.kwargs} : undefined
                if (call.kwargs) {
                    mergedKw = mergedKw || {}
                    for (const [k, v] of Object.entries(call.kwargs)) mergedKw[k] = v
                }
                const merged = {type:'Call', name: val.name, args: mergedArgs}
                // Keywords and positionals that meet only through this merge
                // are not a call in the mixed form: neither part is written
                // that way, so the positionals bind by index (see the binding
                // loop).
                if (mergedKw && mergedArgs.length > 0 && !isWrittenMixed(val) && !isWrittenMixed(call)) {
                    merged.positionalsByIndex = true
                }
                if (val.letApplied || selfNamed) merged.letApplied = true
                // Carry a source position across the rebuild, preferring the
                // call site over the binding. Without it every diagnostic about
                // a `let`-aliased call reported "line 0 col 0".
                const loc = call.loc ?? val.loc
                if (loc) merged.loc = loc
                if (mergedKw) merged.kwargs = mergedKw
                if (call.namespace) {
                    merged.namespace = {...call.namespace}
                } else if (val.namespace) {
                    merged.namespace = {...val.namespace}
                }
                return merged
            }
        }
        // A scene call written where no `let` of its name exists is settled
        // there: a `let` of that name declared later is not applied to it.
        if (!call.letApplied && !symbols.has(call.name) &&
            SCENE_FUNCTIONS.has(call.name) && !canResolveOpName(call.name)) {
            return {...call, letApplied: true}
        }
        return call
    }

    function firstChainCall(node) {
        if (!node || typeof node !== 'object') return null
        if (node.type === 'Call') return node
        if (node.type === 'Chain') {
            const head = node.chain && node.chain[0]
            return head && head.type === 'Call' ? head : null
        }
        return null
    }

    function getStarterInfo(node) {
        if (!node || typeof node !== 'object') return null
        if (node.type === 'Call') {
            // Build namespaced name if namespace exists
            let name = node.name
            if (node.namespace && node.namespace.resolved) {
                name = `${node.namespace.resolved}.${node.name}`
            }
            return isStarterOp(name) ? {call: node, index: 0} : null
        }
        if (node.type === 'Chain' && Array.isArray(node.chain)) {
            for (let i = 0; i < node.chain.length; i++) {
                const entry = node.chain[i]
                if (entry && entry.type === 'Call') {
                    let name = entry.name
                    if (entry.namespace && entry.namespace.resolved) {
                        name = `${entry.namespace.resolved}.${entry.name}`
                    }
                    if (isStarterOp(name)) {
                        return {call: entry, index: i}
                    }
                }
            }
        }
        return null
    }

    function isStarterChain(node) {
        if (!node || node.type !== 'Chain') return false
        const starter = getStarterInfo(node)
        return !!(starter && starter.index === 0)
    }

    const reportedAutomationCycles = new Set()

    // Whether the program names scene() anywhere, as a call or as the value
    // of a `let`. Only such a program resolves the elements of its array
    // literals; in every other program substitute() leaves an array literal
    // untouched, the stable behaviour.
    function namesScene(node) {
        if (!node || typeof node !== 'object') return false
        if (Array.isArray(node)) return node.some(namesScene)
        if ((node.type === 'Call' || node.type === 'Ident') && node.name === 'scene') return true
        return Object.values(node).some(namesScene)
    }
    const sceneProgram = namesScene(ast)

    // What substitute() is in: the names it is reading through their `let`
    // (innermost last), the depth of the array and object literals around the
    // node, and whether the node belongs to the scene() call being compiled.
    const expanding = []
    let literalDepth = 0
    let inScene = false

    // Resolve one element of an array literal. An element substitute() cannot
    // read, such as a chain that starts with read(), stays as it is written:
    // only scene() reads the result, and it reports what it cannot use. Any
    // other failure is the program's and is thrown on.
    function resolveElement(element) {
        try {
            return substitute(element)
        } catch (error) {
            if (!(error instanceof TypeError)) throw error
            return element
        }
    }

    function substitute(node, resolving = []) {
        if (!node) return node
        if (node.type === 'Ident' && resolving.includes(node.name)) {
            // Outside scene() nothing reads the resolved elements of an array
            // literal, and the stable language reports nothing for a name
            // there. The name stays a name.
            if (literalDepth > 0 && !inScene) return node
            const cycleStart = resolving.indexOf(node.name)
            const cycle = [...resolving.slice(cycleStart), node.name]
            const cycleKey = cycle.join(' -> ')
            if (!reportedAutomationCycles.has(cycleKey)) {
                reportedAutomationCycles.add(cycleKey)
                pushDiag('S001', node, `Automation cycle detected: ${cycleKey}`)
            }
            return {type:'Number', value:0, _automationInvalid:true}
        }
        if (node.type === 'Ident' && symbols.has(node.name)) {
            // Inside a literal, a name that leads back to the `let` being read
            // stays a name: reading it again would never end.
            if (literalDepth > 0 && expanding.includes(node.name)) return node
            expanding.push(node.name)
            let result
            try {
                result = substitute(clone(symbols.get(node.name)), [...resolving, node.name])
            } finally {
                expanding.pop()
            }
            if (result && typeof result === 'object') {
                result._varRef = node.name
            }
            return result
        }
        if (node.type === 'Random') {
            const mapped = {...node, args: (node.args || []).map(a => substitute(a, resolving))}
            if (node.kwargs) {
                mapped.kwargs = {}
                for (const [k, v] of Object.entries(node.kwargs)) mapped.kwargs[k] = substitute(v, resolving)
            }
            return mapped
        }
        if (node.type === 'Binary') {
            return {...node, left: substitute(node.left, resolving), right: substitute(node.right, resolving)}
        }
        if (node.type === 'Unary') {
            return {...node, arg: substitute(node.arg, resolving)}
        }
        if (AUTOMATION_FIELDS[node.type]) {
            const mapped = {...node}
            for (const field of AUTOMATION_FIELDS[node.type]) {
                if (node[field] !== undefined) {
                    mapped[field] = substitute(node[field], resolving)
                }
            }
            return mapped
        }
        if (node.type === 'Chain') {
            const mapped = node.chain.map(c => {
                const mappedArgs = c.args.map(a => substitute(a, resolving))
                let mappedCall = {type:'Call', name:c.name, args:mappedArgs}
                // Carry the source location across the rebuild. Scene nodes are
                // handed to the scene compiler as raw AST, and it reports errors
                // from `loc`; without this every scene error says line 0 col 0.
                if (c.loc) mappedCall.loc = c.loc
                if (c.positionalsByIndex) mappedCall.positionalsByIndex = true
                if (c.letApplied) mappedCall.letApplied = true
                // Not enumerable, so the compiled output is unchanged.
                if (resolving.length > 0) Object.defineProperty(mappedCall, 'fromLet', { value: true })
                if (c.kwargs) {
                    const kw = {}
                    for (const [k,v] of Object.entries(c.kwargs)) kw[k] = substitute(v, resolving)
                    mappedCall.kwargs = kw
                }
                return resolveCall(mappedCall)
            })
            return {type:'Chain', chain:mapped}
        }
        if (node.type === 'Call') {
            const mappedArgs = node.args.map(a => substitute(a, resolving))
            let mappedCall = {type:'Call', name:node.name, args:mappedArgs}
            if (node.loc) mappedCall.loc = node.loc
            if (node.positionalsByIndex) mappedCall.positionalsByIndex = true
            if (node.letApplied) mappedCall.letApplied = true
            if (node.kwargs) {
                const kw = {}
                for (const [k,v] of Object.entries(node.kwargs)) kw[k] = substitute(v, resolving)
                mappedCall.kwargs = kw
            }
            return resolveCall(mappedCall)
        }
        // A name inside an array literal resolves only inside scene(). In
        // every other call the elements stay as written, the stable
        // behaviour: an element that is a name is not a number there. In a
        // program that names
        // scene() the literal carries its resolved elements beside the
        // written ones, and scene() takes them
        // (see useResolvedElements). They are resolved again each time the
        // literal is substituted, so a name takes the value it has at the
        // literal's `let`, or at the first later use where it has one.
        if (node.type === 'ArrayLiteral') {
            if (!sceneProgram) return node
            literalDepth++
            try {
                return {
                    ...node,
                    _resolvedElements: (node._resolvedElements ?? node.elements).map(resolveElement)
                }
            } finally {
                literalDepth--
            }
        }
        if (node.type === 'Object') {
            const properties = {}
            literalDepth++
            try {
                for (const [key, value] of Object.entries(node.properties || {})) {
                    properties[key] = substitute(value)
                }
            } finally {
                literalDepth--
            }
            return { ...node, properties }
        }
        // The three animation descriptors carry their arguments as named
        // fields rather than in `args`, so a generic walk misses them and the
        // binding never resolves. Rebuilding only Oscillator left the other two
        // behind: the 2D path's resolveMidiParam/resolveAudioParam see an Ident,
        // return undefined and fall back to the parameter's DEFAULT, so
        // `let ch = 5; midi(channel: ch)` silently played channel 1; inside a
        // scene() the same node reaches the scene compiler and throws.
        if (node.type === 'Oscillator') {
            return {
                ...node,
                oscType: substitute(node.oscType),
                min: substitute(node.min),
                max: substitute(node.max),
                speed: substitute(node.speed),
                offset: substitute(node.offset),
                seed: substitute(node.seed)
            }
        }
        if (node.type === 'Midi') {
            return {
                ...node,
                channel: substitute(node.channel),
                mode: substitute(node.mode),
                min: substitute(node.min),
                max: substitute(node.max),
                sensitivity: substitute(node.sensitivity),
                name: substitute(node.name),
                id: substitute(node.id)
            }
        }
        if (node.type === 'Audio') {
            return {
                ...node,
                band: substitute(node.band),
                min: substitute(node.min),
                max: substitute(node.max)
            }
        }
        return node
    }

    // Give scene() the resolved elements of every array literal in its
    // arguments. They are bound where each literal was written, so a `let`
    // that holds a literal keeps the values its names had at that `let`.
    function useResolvedElements(node) {
        if (!node || typeof node !== 'object') return node
        if (Array.isArray(node)) return node.map(useResolvedElements)
        const mapped = {}
        for (const [key, value] of Object.entries(node)) {
            if (key === '_resolvedElements' && node.type === 'ArrayLiteral') continue
            mapped[key] = useResolvedElements(value)
        }
        if (node.type === 'ArrayLiteral' && node._resolvedElements) {
            mapped.elements = useResolvedElements(node._resolvedElements)
        }
        return mapped
    }

    // Remove the marks this function leaves on call and array literal nodes
    // while it compiles. They are its own, and no compiled plan carries one:
    // outside scene() an array literal keeps only its elements as written.
    function dropMarks(node) {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) {
            for (const item of node) dropMarks(item)
            return
        }
        if (node.type === 'Call') {
            delete node.positionalsByIndex
            delete node.letApplied
        }
        if (node.type === 'ArrayLiteral') delete node._resolvedElements
        delete node._letIdOrigin
        for (const value of Object.values(node)) dropMarks(value)
    }

    function declareVar(v) {
        let expr = substitute(clone(v.expr), [v.name])
        if (expr && (expr.type === 'Chain' || expr.type === 'Call') && !(expr.type === 'Call' && /^vec[234]$/.test(expr.name))) {
            if (callsHaveRandom(expr)) {
                pushDiag('S013', v, `Random calls in an effect held by a let are not supported yet: '${v.name}'`)
            }
            // The elements of a chain held by a let are written here, so they
            // are counted here, once, and not where the let is used.
            for (const c of expr.type === 'Chain' ? expr.chain : [expr]) {
                if (c && c.type === 'Call' && c.name) nextOccurrence(c.name)
            }
        } else if (containsRandom(expr)) {
            const scopeKey = `${keyScope.join('/')}|${v.name}`
            const k = (letDeclarations.get(scopeKey) || 0) + 1
            letDeclarations.set(scopeKey, k)
            const resolved = resolveRandomAt(expr, k === 1 ? `let:${v.name}` : `let:${v.name}#${k}`)
            if (resolved === undefined) return
            expr = resolved
        }
        markLetIds(expr)
        if (expr && isStarterChain(expr)) {
            const head = firstChainCall(expr)
            if (head) pushDiag('S006', head)
        }
        if (expr == null || (expr.type === 'Ident' && (expr.name === 'null' || expr.name === 'undefined'))) {
            pushDiag('S004', v)
            return
        }
        if (expr.type === 'Ident' && !symbols.has(expr.name) && !stateValues.has(expr.name) && !ops[expr.name] && !canResolveOpName(expr.name)) {
            pushDiag('S003', expr)
            return
        }
        if (expr.type === 'Chain' && expr.chain.length === 1) {
            symbols.set(v.name, expr.chain[0])
        } else if (expr.type === 'Member') {
            const resolved = resolveEnum(expr.path)
            if (typeof resolved === 'number') {
                symbols.set(v.name, {type:'Number', value: resolved})
            } else if (resolved !== undefined) {
                symbols.set(v.name, resolved)
            } else {
                symbols.set(v.name, expr)
            }
        } else {
            symbols.set(v.name, expr)
        }
    }

    // Top-level lets are declared in statement order (see the plan loop).
    // `pendingLets` holds the names of the lets that come after the current
    // statement.
    const topLevelVars = Array.isArray(ast.vars) ? ast.vars : []
    let nextVar = 0
    let pendingLets = new Set()
    function declareVarsBefore(planIndex) {
        while (nextVar < topLevelVars.length && (topLevelVars[nextVar].planIndex ?? 0) <= planIndex) {
            declareVar(topLevelVars[nextVar++])
        }
        pendingLets = new Set(topLevelVars.slice(nextVar).map(v => v.name))
    }

    // A statement that reads a variable before any let assigns it gets
    // S003 "Variable used before assignment" at the identifier. Other
    // diagnostics for that identifier node are not added.
    function reportReadsBeforeLet(node) {
        if (pendingLets.size === 0 || !node || typeof node !== 'object') return
        if (Array.isArray(node)) {
            for (const item of node) reportReadsBeforeLet(item)
            return
        }
        if (node.type === 'Ident' && pendingLets.has(node.name) && !symbols.has(node.name)) {
            if (!readsBeforeLet.has(node)) {
                const position = node.position
                pushDiag('S003', position
                    ? { type: 'Ident', name: node.name, loc: { line: position.line, column: position.column } }
                    : { type: 'Ident', name: node.name })
                readsBeforeLet.add(node)
            }
            return
        }
        for (const value of Object.values(node)) reportReadsBeforeLet(value)
    }

    function evalExpr(node) {
        const expr = substitute(clone(node))
        if (expr && isStarterChain(expr)) {
            const head = firstChainCall(expr)
            if (head) pushDiag('S006', head)
        }
        if (expr && expr.type === 'Member') {
            const resolved = resolveEnum(expr.path)
            if (typeof resolved === 'number') return {type:'Number', value: resolved}
            if (resolved !== undefined) return resolved
        }
        return expr
    }

    function resolveAutomationEnum(node, enumName, fallback, validValues, descriptorName, fieldName) {
        let resolved
        if (node?.type === 'Number') {
            resolved = node.value
        } else if (node?.type === 'Member') {
            resolved = resolveEnum(node.path)
        } else if (node?.type === 'Ident') {
            resolved = resolveEnum([enumName, node.name])
        }
        if (resolved && resolved.type === 'Number') resolved = resolved.value
        if (typeof resolved === 'number' && validValues.has(resolved)) return resolved

        if (node?.type === 'String') {
            pushDiag('S001', node,
                `String literal not allowed for ${descriptorName}() ${fieldName}`)
        } else {
            const message = descriptorName === 'audio' && fieldName === 'band'
                ? `audio() band must resolve to an integer from 0 to 4 (got ${resolved})`
                : `${descriptorName}() ${fieldName} must resolve to a supported enum value`
            pushDiag('S002', node, message)
        }
        return fallback
    }

    function resolveAutomationString(node, descriptorName, fieldName) {
        if (!node) return undefined
        const allowlistKey = `${descriptorName}.${fieldName}`
        if (!ALLOWED_STRING_PARAMS.has(allowlistKey)) {
            pushDiag('S001', node, `String parameter '${allowlistKey}' is not allowlisted`)
            return undefined
        }
        if (node.type !== 'String') {
            pushDiag('S001', node, `${descriptorName}() ${fieldName} requires a quoted string`)
            return undefined
        }
        if (node.value.length === 0) {
            pushDiag('S001', node, `${descriptorName}() ${fieldName} must not be empty`)
            return undefined
        }
        return decodeJsonStringLiteralContent(node.value)
    }

    function resolveAutomationNumber(node, descriptorName, fieldName, fallback, options = {}, depth = 0) {
        if (!node) return fallback
        const reject = (code, message) => {
            options.onInvalid?.()
            pushDiag(code, node, message)
            return fallback
        }
        let value
        if (node.type === 'Number') {
            value = node.value
        } else if (options.allowBoolean && node.type === 'Boolean') {
            value = node.value ? 1 : 0
        } else if (node.type === 'Member' && options.allowMember !== false) {
            const resolved = resolveEnum(node.path)
            value = resolved && resolved.type === 'Number' ? resolved.value : resolved
        } else if (AUTOMATION_FIELDS[node.type] && options.allowAutomation) {
            const compiled = compileAutomationDescriptor(node, depth + 1)
            if (compiled?._invalid) options.onInvalid?.()
            return compiled
        } else if (node.type === 'String') {
            return reject('S001', `String literal not allowed for ${descriptorName}() ${fieldName}`)
        } else if (node.type === 'Ident') {
            return reject('S003',
                `Undefined automation source '${node.name}' for ${descriptorName}() ${fieldName}`)
        } else {
            return reject('S002',
                `${descriptorName}() ${fieldName} must be a number${options.allowAutomation ? ' or automation source' : ''}`)
        }

        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return reject('S002', `${descriptorName}() ${fieldName} must resolve to a finite number`)
        }
        if (options.integer && !Number.isInteger(value)) {
            return reject('S002', `${descriptorName}() ${fieldName} must be an integer`)
        }
        if (options.min !== undefined && value < options.min) {
            return reject('S002',
                `${descriptorName}() ${fieldName} must be at least ${options.min} (got ${value})`)
        }
        if (options.max !== undefined && value > options.max) {
            return reject('S002',
                `${descriptorName}() ${fieldName} must be at most ${options.max} (got ${value})`)
        }
        if (options.clamp01) return Math.max(0, Math.min(1, value))
        return value
    }

    function compileAutomationDescriptor(node, depth = 0) {
        if (depth > MAX_AUTOMATION_DEPTH) {
            pushDiag('S001', node,
                `Automation nesting exceeds the maximum depth of ${MAX_AUTOMATION_DEPTH}`)
            return 0
        }

        if (node.type === 'Oscillator') {
            const value = {
                type: 'Oscillator',
                oscType: resolveAutomationEnum(
                    node.oscType, 'oscKind', 0, new Set([0, 1, 2, 3, 4, 5, 6]), 'osc', 'type'),
                min: resolveAutomationNumber(node.min, 'osc', 'min', 0,
                    {allowBoolean:true, allowAutomation:true, clamp01:true}, depth),
                max: resolveAutomationNumber(node.max, 'osc', 'max', 1,
                    {allowBoolean:true, allowAutomation:true, clamp01:true}, depth),
                speed: resolveAutomationNumber(node.speed, 'osc', 'speed', 1,
                    {allowBoolean:true, allowAutomation:true}, depth),
                offset: resolveAutomationNumber(node.offset, 'osc', 'offset', 0,
                    {allowBoolean:true, allowAutomation:true}, depth),
                seed: resolveAutomationNumber(node.seed, 'osc', 'seed', 1,
                    {allowBoolean:true, allowAutomation:true}, depth),
                _ast: node,
                ...(node._varRef && { _varRef: node._varRef })
            }
            return value
        }

        if (node.type === 'Midi') {
            const mode = resolveAutomationEnum(
                node.mode, 'midiMode', 4, new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 'midi', 'mode')
            const hasZone = node.zone !== undefined
            const zone = hasZone
                ? resolveAutomationEnum(node.zone, 'midiZone', undefined, new Set([0, 1]), 'midi', 'zone')
                : undefined
            let validSelection = !hasZone || zone !== undefined
            let members
            if (node.members !== undefined) {
                members = resolveAutomationNumber(node.members, 'midi', 'members', undefined,
                    {integer:true, min:1, max:15, allowMember:false,
                        onInvalid:() => { validSelection = false }}, depth)
                if (!hasZone) validSelection = false
            }
            if (hasZone && node.channel !== undefined) validSelection = false
            let validChannel = true
            const channel = hasZone ? undefined : resolveAutomationNumber(node.channel, 'midi', 'channel', 1,
                {integer:true, min:1, max:16, allowMember:false,
                    onInvalid:() => { validChannel = false }}, depth)
            let validCc = true
            const cc = node.cc !== undefined || mode === 5 || mode === 6
                ? resolveAutomationNumber(node.cc, 'midi', 'cc', 1,
                    {integer:true, min:0, max:mode === 6 ? 31 : 127, allowMember:false,
                        onInvalid:() => { validCc = false }}, depth)
                : undefined
            let nrpn
            if (node.nrpn !== undefined || mode === 7) {
                if (node.nrpn === undefined) {
                    pushDiag('S002', node, 'midi() nrpn mode requires a parameter number')
                    validSelection = false
                }
                nrpn = resolveAutomationNumber(node.nrpn, 'midi', 'nrpn', undefined,
                    {integer:true, min:0, max:16382, allowMember:false,
                        onInvalid:() => { validSelection = false }}, depth)
            }
            return {
                type: 'Midi',
                channel,
                mode,
                ...(cc !== undefined && { cc }),
                ...(nrpn !== undefined && { nrpn }),
                ...(hasZone && { zone }),
                ...(node.members !== undefined && { members }),
                ...((!validCc || !validChannel || !validSelection) && { _invalid: true }),
                min: resolveAutomationNumber(node.min, 'midi', 'min', 0,
                    {allowBoolean:true, allowAutomation:true, clamp01:true}, depth),
                max: resolveAutomationNumber(node.max, 'midi', 'max', 1,
                    {allowBoolean:true, allowAutomation:true, clamp01:true}, depth),
                sensitivity: resolveAutomationNumber(node.sensitivity, 'midi', 'sensitivity', 1,
                    {allowBoolean:true, allowAutomation:true}, depth),
                name: resolveAutomationString(node.name, 'midi', 'name'),
                id: resolveAutomationString(node.id, 'midi', 'id'),
                _ast: node,
                ...(node._varRef && { _varRef: node._varRef })
            }
        }

        if (node.type === 'Audio') {
            const band = resolveAutomationEnum(
                node.band, 'audioBand', undefined, new Set([0, 1, 2, 3, 4]), 'audio', 'band')
            let validMin = true
            let validMax = true
            const min = resolveAutomationNumber(node.min, 'audio', 'min', 0,
                {allowAutomation:true, allowMember:false, clamp01:true,
                    onInvalid:() => { validMin = false }}, depth)
            const max = resolveAutomationNumber(node.max, 'audio', 'max', 1,
                {allowAutomation:true, allowMember:false, clamp01:true,
                    onInvalid:() => { validMax = false }}, depth)
            let channel
            let validChannel = true
            if (node.channel !== undefined) {
                if (node.channel.type === 'Number' &&
                    Number.isInteger(node.channel.value) && node.channel.value >= 1 && node.channel.value <= 32) {
                    channel = node.channel.value
                } else {
                    validChannel = false
                    if (node.channel.type === 'String') {
                        pushDiag('S001', node.channel,
                            'String literal not allowed for audio() channel')
                    } else {
                        pushDiag('S002', node.channel,
                            `audio() channel must be a positive integer from 1 to 32 (got ${node.channel.value ?? node.channel.name ?? node.channel.type})`)
                    }
                }
            }
            const name = resolveAutomationString(node.name, 'audio', 'name')
            const id = resolveAutomationString(node.id, 'audio', 'id')
            const validName = node.name === undefined || name !== undefined
            const validId = node.id === undefined || id !== undefined
            return {
                type: 'Audio',
                band,
                min,
                max,
                channel,
                name,
                id,
                _invalid: band === undefined || !validMin || !validMax ||
                    !validName || !validId || !validChannel,
                _ast: node,
                ...(node._varRef && { _varRef: node._varRef })
            }
        }

        return 0
    }

    function evalCondition(node) {
        const expr = evalExpr(node)
        if (!expr) return false
        if (expr.type === 'Number') return toBoolean(expr.value)
        if (expr.type === 'Boolean') return !!expr.value
        if (expr.type === 'Func') {
            try {
                const fn = new Function('state', `with(state){ return ${expr.src}; }`)
                return {fn: (state) => toBoolean(fn(state))}
            } catch {
                pushDiag('S001', expr, `Invalid function expression: '${expr.src?.slice(0, 50) || 'unknown'}'`)
                return false
            }
        }
        if (expr.type === 'Ident') {
            if (symbols.has(expr.name)) return evalCondition(symbols.get(expr.name))
            if (stateValues.has(expr.name)) {
                const key = expr.name
                return {fn:(state)=>toBoolean(state[key])}
            }
            pushDiag('S003', expr)
            return false
        }
        if (expr.type === 'Member') {
            const cur = resolveEnum(expr.path)
            if (typeof cur === 'number') return toBoolean(cur)
            if (cur !== undefined) return toBoolean(cur)
            pushDiag('S001', expr, `Unknown enum path: '${expr.path?.join('.') || 'unknown'}'`)
            return false
        }
        return false
    }

        function buildNamespaceSnapshot(callNamespace) {
            if (!callNamespace || typeof callNamespace !== 'object') { return null }
            const snapshot = {
                call: {
                    name: typeof callNamespace.name === 'string' ? callNamespace.name : null,
                    resolved: typeof callNamespace.resolved === 'string' ? callNamespace.resolved : null,
                    explicit: !!callNamespace.explicit,
                    source: typeof callNamespace.source === 'string' ? callNamespace.source : null
                }
            }
            if (Array.isArray(callNamespace.searchOrder)) {
                snapshot.call.searchOrder = Object.freeze(callNamespace.searchOrder.slice())
            }
            if (callNamespace.fromOverride) {
                snapshot.call.fromOverride = true
            }
            // Copy resolved as top-level for downstream consumers
            if (callNamespace.resolved) {
                snapshot.resolved = callNamespace.resolved
            }
            return Object.freeze(snapshot)
        }

    function compileChainStatement(stmt) {
        const chain = []
        reportReadsBeforeLet(stmt.chain)

        // Check for S006: Starter chain missing write() or write3d()
        const chainNode = { type: 'Chain', chain: stmt.chain }
        const hasWrite = stmt.write || stmt.write3d
        if (!hasWrite && isStarterChain(chainNode)) {
             pushDiag('S006', stmt.chain[0])
        }

        // write or write3d target must be explicit
        if (!hasWrite) {
            pushDiag('S001', stmt.chain[0], 'Chain must have explicit write() or write3d() target')
            return null
        }
        const writeName = stmt.write ? stmt.write.name : null
        const write3dTarget = stmt.write3d ? {
            tex3d: { kind: 'vol', name: stmt.write3d.tex3d?.name || stmt.write3d.tex3d },
            geo: { kind: 'geo', name: stmt.write3d.geo?.name || stmt.write3d.geo }
        } : null
        const states = []

        function processChain(calls, input, options = {}) {
            const allowStarterless = options.allowStarterless === true
            let current = input
            for (const original of calls) {
                // Handle Read node (pipeline built-in for reading 2D surfaces)
                if (original.type === 'Read') {
                    // GUARD: read() is a STARTER NODE. It MUST NOT be chained inline.
                    // If current !== null, someone wrote .read() which is semantically invalid.
                    if (current !== null) {
                        pushDiag('S001', original, 'read() is a starter node and cannot be chained inline. Use standalone read() to start a new chain.')
                        continue
                    }
                    if (containsRandom(original.surface)) {
                        pushDiag('S013', original, 'A random call cannot choose a surface')
                        continue
                    }
                    const surface = toSurface(original.surface)
                    if (!surface) {
                        pushDiag('S001', original, 'read() requires a valid surface reference')
                        continue
                    }
                    const idx = tempIndex++
                    const stepArgs = { tex: surface }
                    // Preserve _skip flag from parsed node
                    if (original._skip === true) {
                        stepArgs._skip = true
                    }
                    elementId(original._id, original, stepArgs)
                    const step = {
                        op: '_read',
                        args: stepArgs,
                        from: null,
                        temp: idx,
                        builtin: true
                    }
                    if (original.leadingComments) { step.leadingComments = original.leadingComments }
                    chain.push(step)
                    current = idx
                    continue
                }

                // Handle Read3D node (pipeline built-in for reading 3D textures)
                // Two-arg form: read3d(vol0, geo0) - starter node
                // Single-arg form is handled in param resolution, not here
                if (original.type === 'Read3D' && original.geo) {
                    // GUARD: read3d() is a STARTER NODE. It MUST NOT be chained inline.
                    // If current !== null, someone wrote .read3d() which is semantically invalid.
                    if (current !== null) {
                        pushDiag('S001', original, 'read3d() is a starter node and cannot be chained inline. Use standalone read3d() to start a new chain.')
                        continue
                    }
                    // Preserve the type for VolRef/GeoRef vs plain Ident
                    const tex3d = original.tex3d?.name
                        ? {
                            kind: original.tex3d.type === 'VolRef' ? 'vol' : 'tex3d',
                            name: original.tex3d.name
                        }
                        : null
                    const geo = original.geo?.name
                        ? {
                            kind: original.geo.type === 'GeoRef' ? 'geo' : 'geo',
                            name: original.geo.name
                        }
                        : null
                    if (!tex3d || !geo) {
                        pushDiag('S001', original, 'read3d() as starter requires tex3d and geo references')
                        continue
                    }
                    const idx = tempIndex++
                    const stepArgs = { tex3d, geo }
                    // Preserve _skip flag from parsed node
                    if (original._skip === true) {
                        stepArgs._skip = true
                    }
                    elementId(original._id, original, stepArgs)
                    const step = {
                        op: '_read3d',
                        args: stepArgs,
                        from: null,
                        temp: idx,
                        builtin: true
                    }
                    if (original.leadingComments) { step.leadingComments = original.leadingComments }
                    chain.push(step)
                    current = idx
                    continue
                }

                // Handle Write node (pipeline built-in for writing to surfaces - chainable)
                if (original.type === 'Write') {
                    const surface = toSurface(original.surface)
                    if (!surface) {
                        pushDiag('S001', original, 'write() requires a valid surface reference')
                        continue
                    }
                    if (current === null) {
                        pushDiag('S005', original, 'write() requires an input - cannot be first in chain')
                        continue
                    }
                    const idx = tempIndex++
                    const writeArgs = { tex: surface }
                    elementId(original._id, original, writeArgs)
                    const step = {
                        op: '_write',
                        args: writeArgs,
                        from: current,
                        temp: idx,
                        builtin: true
                    }
                    if (original.leadingComments) { step.leadingComments = original.leadingComments }
                    chain.push(step)
                    current = idx
                    continue
                }

                // Handle Write3D node (pipeline built-in for writing 3D volumes and geometry - chainable)
                if (original.type === 'Write3D') {
                    const tex3d = original.tex3d?.name
                        ? {
                            kind: original.tex3d.type === 'VolRef' ? 'vol' : 'tex3d',
                            name: original.tex3d.name
                        }
                        : null
                    const geo = original.geo?.name
                        ? {
                            kind: original.geo.type === 'GeoRef' ? 'geo' : 'geo',
                            name: original.geo.name
                        }
                        : null
                    if (!tex3d || !geo) {
                        pushDiag('S001', original, 'write3d() requires tex3d and geo references')
                        continue
                    }
                    if (current === null) {
                        pushDiag('S005', original, 'write3d() requires an input - cannot be first in chain')
                        continue
                    }
                    const idx = tempIndex++
                    const write3dArgs = { tex3d, geo }
                    elementId(original._id, original, write3dArgs)
                    const step = {
                        op: '_write3d',
                        args: write3dArgs,
                        from: current,
                        temp: idx,
                        builtin: true
                    }
                    if (original.leadingComments) { step.leadingComments = original.leadingComments }
                    chain.push(step)
                    current = idx
                    continue
                }

                // Handle Subchain node (first-class grouping of contiguous effects)
                if (original.type === 'Subchain') {
                    // Surface parser-attached subchain-argument reports
                    // once per subchain node, in source order.
                    const argDiagnostics = original.subchainArgumentDiagnostics
                    if (Array.isArray(argDiagnostics)) {
                        for (const report of argDiagnostics) {
                            diagnosticsList.push({
                                code: report.code,
                                message: report.message,
                                severity: report.severity,
                                nodeId: original?.id,
                                ...(report.location && { location: report.location })
                            })
                        }
                    }
                    if (current === null) {
                        pushDiag('S005', original, 'subchain() requires an input - cannot be first in chain')
                        continue
                    }
                    // Add subchain begin marker
                    const beginIdx = tempIndex++
                    const beginStep = {
                        op: '_subchain_begin',
                        args: {
                            name: original.name || null,
                            id: original.id || null
                        },
                        from: current,
                        temp: beginIdx,
                        builtin: true
                    }
                    if (original.leadingComments) { beginStep.leadingComments = original.leadingComments }
                    chain.push(beginStep)
                    current = beginIdx

                    // Process the subchain body by recursively calling processChain
                    // This reuses all the existing argument resolution and validation logic
                    current = processChain(original.body, current)

                    // Add subchain end marker
                    const endIdx = tempIndex++
                    const endStep = {
                        op: '_subchain_end',
                        args: {
                            name: original.name || null,
                            id: original.id || null
                        },
                        from: current,
                        temp: endIdx,
                        builtin: true
                    }
                    chain.push(endStep)
                    current = endIdx
                    continue
                }

                const call = resolveCall({...original})
                const effectiveNamespace = call.namespace || { searchOrder: programSearchOrder }
                let opName = null
                let spec = null

                const candidateNames = []
                if (call.namespace && call.namespace.resolved) {
                    candidateNames.push(`${call.namespace.resolved}.${call.name}`)
                }
                const searchOrder = effectiveNamespace.searchOrder
                if (Array.isArray(searchOrder)) {
                    for (const ns of searchOrder) {
                        candidateNames.push(`${ns}.${call.name}`)
                    }
                }
                for (const candidate of candidateNames) {
                    if (candidate && ops[candidate]) {
                        opName = candidate
                        spec = ops[candidate]
                        break
                    }
                }
                if (!spec) {
                    // Only scene() is a chain element. Its vocabulary — camera,
                    // mesh, light, material and the rest — lives *inside* the
                    // call, preserved as AST and never reaching this loop. Any
                    // of those names appearing here is a mistake, and passing
                    // them through turned a typo into a silent no-op that
                    // compiled clean and rendered nothing.
                    if (call.name !== 'scene' && SCENE_FUNCTIONS.has(call.name)) {
                        pushDiag('S001', original, `Unknown effect: '${call.name}'. Scene nodes like ${call.name}() are only valid inside scene().`)
                        continue
                    }
                    // scene() passes through the validator without an ops
                    // registration; the scene compiler interprets it later.
                    if (call.name === 'scene') {
                        // scene() renders the scene it describes; it has no
                        // input. Mid-chain it compiled clean and silently threw
                        // the incoming surface away. This also catches a second
                        // scene() in one chain before the scene compiler's
                        // one-scene-per-program check.
                        if (current !== null) {
                            pushDiag('S001', original, 'scene() is a generator and must start a chain')
                            continue
                        }
                        let sceneAst
                        inScene = true
                        try {
                            sceneAst = useResolvedElements(substitute(clone(original)))
                        } finally {
                            inScene = false
                        }
                        const idx = tempIndex++
                        const step = {
                            op: `_scene.${call.name}`,
                            args: { _ast: sceneAst },
                            from: current,
                            temp: idx,
                            scene: true
                        }
                        if (original.leadingComments) { step.leadingComments = original.leadingComments }
                        chain.push(step)
                        current = idx
                        continue
                    }
                    pushDiag('S001', original, `Unknown effect: '${call.name}'`)
                    continue
                }
                // Check for deprecated effect aliases
                const effectAliasWarning = checkEffectAlias(opName)
                if (effectAliasWarning) {
                    pushDiag('S008', original, effectAliasWarning)
                }
                if (opName === 'prev') {
                    const idx = tempIndex++
                    const args = {tex:{kind:'output', name: writeName}}
                    const namespaceSnapshot = buildNamespaceSnapshot(call.namespace)
                    const step = {op: opName, args, from: current, temp: idx}
                    if (namespaceSnapshot) { step.namespace = namespaceSnapshot }
                    if (original.leadingComments) { step.leadingComments = original.leadingComments }
                    chain.push(step)
                    current = idx
                    continue
                }
                // The element's key for its draws: its occurrence name, or,
                // for an effect passed as a value, the key of that value.
                const occurrence = original.fromLet ? call.name : nextOccurrence(call.name)
                // `_seed:` gives the element a scope of its own: its draws
                // use that seed, and their keys restart at the element.
                let elementSeed = null
                const ownSeed = call.kwargs?._seed
                if (ownSeed !== undefined) {
                    if (containsRandom(ownSeed)) {
                        pushDiag('S013', original, 'A random call cannot set _seed: it must be a literal')
                    } else if (ownSeed.type !== 'Number' || !Number.isInteger(ownSeed.value) || ownSeed.value < 0 || ownSeed.value > 4294967295) {
                        pushDiag('S012', ownSeed.loc ? ownSeed : original, '_seed must be a whole number from 0 to 4294967295')
                    } else {
                        elementSeed = ownSeed.value
                    }
                }
                const callSeed = elementSeed ?? scopeSeed()
                const restartsKeys = elementSeed !== null
                const elementKey = restartsKeys
                    ? opName
                    : valueKeys.length
                        ? `${valueKeys[valueKeys.length - 1]}/e:${opName}`
                        : `${opName}@${occurrence}`
                // Whether unseeded effect seeds inherit here: with a seed
                // directive, or inside a `_seed:` scope.
                const inherits = hasSeedDirective || restartsKeys || seedScopes.length > 0
                let randomSources = null
                const authoredSeeds = []
                const inheritable = []
                const isStarter = isStarterOp(opName)
                const starterlessRoot = current === null
                const allowPassthroughRoot = allowStarterless && SURFACE_PASSTHROUGH_CALLS.has(opName)
                if (starterlessRoot && !isStarter && !allowPassthroughRoot) {
                    pushDiag('S005', original)
                    continue
                }
                // Use the already-resolved isStarter, not getStarterInfo which uses the bare name
                const starterHasInput = !!(isStarter && current !== null)
                const fromInput = starterHasInput ? null : current
                if (starterHasInput) {
                    pushDiag('S005', original)
                }
                const args = {}
                // Sidecar map remembering the source form of each arg
                // (e.g. 'array' when the source was a literal `[…]`).
                // Stays null until something sets a form, so existing
                // programs add no new keys to the compiled step.
                let argSources = null
                const kw = call.kwargs
                // Resolve deprecated param aliases
                if (kw) {
                    const aliasWarnings = resolveParamAliases(opName, kw)
                    for (const w of aliasWarnings) {
                        pushDiag('S007', call, w)
                    }
                }
                const seen = new Set()
                const specArgs = spec.args || []
                // Positional arguments are consumed in source order against the
                // slots a keyword has not already filled. `call.args` holds only
                // the positionals (the parser routes keywords into `kw`), so it
                // must be walked with its own cursor rather than indexed by slot
                // — otherwise the first keyword shifts every later positional
                // and the trailing one falls off the end.
                let posCursor = 0
                // A call not written in the mixed form binds each positional
                // to the slot at its own index instead: a call with no
                // keyword, or one whose keywords and positionals met through
                // a `let`. There a positional whose slot a keyword holds binds
                // to nothing.
                const byIndex = !kw || call.positionalsByIndex === true
                // Members a positional hex colour has claimed but not yet
                // reached, by parameter name. See the splat branch below.
                let splatValues = null
                for (let i = 0; i < specArgs.length; i++) {
                    const def = specArgs[i]
                    if (byIndex) posCursor = i
                    const fromKeyword = kw && kw[def.name] !== undefined
                    // A single positional hex colour claims a whole r/g/b
                    // triple, and a keyword overrides its own member of it.
                    // Detected at the 'r' slot whether or not a keyword has
                    // filled that slot: gating the detection on `!fromKeyword`
                    // stood the splat down for `tint(#804020, r: 0.25)`, so the
                    // Color fell into the 'g' float slot, defaulted g AND b and
                    // reported a bogus S002 about 'g'.
                    //
                    // In a call bound by index the colour stands in the places
                    // of r, g and b, so the next slot takes the fourth
                    // positional. Outside the mixed form the colour splats
                    // only in a call with no keyword.
                    if ((!kw || !byIndex) && def.type !== 'color' && def.name === 'r' &&
                        specArgs[i + 1]?.name === 'g' && specArgs[i + 2]?.name === 'b') {
                        const positional = substitute(call.args[posCursor])
                        if (positional && positional.type === 'Color') {
                            posCursor++
                            const [r, g, b] = positional.value
                            splatValues = {
                                [def.name]: r,
                                [specArgs[i + 1].name]: g,
                                [specArgs[i + 2].name]: b
                            }
                        }
                    }
                    // A splatted colour supplies this slot: take the component
                    // rather than consuming a positional for it.
                    if (!fromKeyword && splatValues && splatValues[def.name] !== undefined) {
                        args[def.name] = splatValues[def.name]
                        continue
                    }
                    let node
                    if (fromKeyword) {
                        node = kw[def.name]
                    } else if (posCursor < call.args.length) {
                        node = call.args[posCursor]
                        posCursor++
                    }
                    node = substitute(node)
                    const argKey = def.name
                    if (kw && kw[def.name] !== undefined) seen.add(def.name)
                    const isSeedParam = def.name === 'seed' || def.inheritsSeed === true
                    if (isSeedParam && inherits) {
                        if (node !== undefined) authoredSeeds.push(def.name)
                        else inheritable.push(def)
                    }
                    if (node && node.type === 'Func' && sourceCallsRandom(node.src)) {
                        pushDiag('S013', original, `A random call cannot be evaluated at run time, in '${def.name}' of ${call.name}()`)
                        node = undefined
                    }
                    if (node && containsRandom(node)) {
                        const source = node
                        node = resolveRandomAt(node, joinKey(elementKey, def.name), callSeed, restartsKeys)
                        if (node !== undefined) {
                            randomSources = randomSources || {}
                            randomSources[argKey] = source
                        }
                    }
                    // Array literal — additive input form. Only fires when
                    // the source contains a literal `[…]`. Existing programs
                    // can never produce ArrayLiteral nodes (the lexer only
                    // emits LBRACKET when the source has `[`), so this
                    // branch is invisible to every program written before
                    // the array literal feature shipped. No length/type
                    // gating: pass the elements through as a numeric array
                    // and let the runtime decide what's valid. The source
                    // form is recorded so the unparser can round-trip back
                    // to `[…]` instead of any other form.
                    if (node && node.type === 'ArrayLiteral') {
                        const value = []
                        for (const el of node.elements) {
                            if (el.type === 'Number') {
                                value.push(el.value)
                            } else {
                                pushDiag('S002', el, `Array element must be a number for '${def.name}' in ${call.name}()`)
                                value.push(0)
                            }
                        }
                        args[argKey] = value
                        argSources = argSources || {}
                        argSources[argKey] = 'array'
                        continue
                    }
                    if (def.type === 'surface') {
                        if (node && node.type === 'String') {
                            pushDiag('S001', node, `String literal not allowed for surface parameter '${def.name}'`)
                            args[argKey] = def.default ? toSurface({ type: 'Ident', name: def.default }) : null
                            continue
                        }
                        let surf = null
                        let invalidStarterChain = false
                        const starter = node ? getStarterInfo(node) : null
                    // Handle Read nodes (parser creates special Read type for read() calls)
                    if (node && (node.type === 'Read' || node.type === 'Read3D')) rejectValueId(node)
                    if (node && node.type === 'Read' && node.surface) {
                        surf = toSurface(node.surface)
                    }
                    const inlineSurface = surf || callToSurface(node)
                    if (inlineSurface) {
                        surf = inlineSurface
                    } else if (node && node.type === 'Chain') {
                        valueKeys.push(joinKey(elementKey, argKey))
                        seedScopes.push(callSeed)
                        let idx
                        try {
                            idx = processChain(node.chain, null, {allowStarterless: true})
                        } finally {
                            valueKeys.pop()
                            seedScopes.pop()
                        }
                        if (idx !== null && idx !== undefined) {
                            surf = {kind:'temp', index: idx}
                        }
                    } else if (node && node.type === 'Call') {
                        valueKeys.push(joinKey(elementKey, argKey))
                        seedScopes.push(callSeed)
                        let idx
                        try {
                            idx = processChain([node], null, {allowStarterless: true})
                        } finally {
                            valueKeys.pop()
                            seedScopes.pop()
                        }
                        if (idx !== null && idx !== undefined) {
                            surf = {kind:'temp', index: idx}
                        }
                    } else if (starter) {
                        pushDiag('S005', starter.call)
                        invalidStarterChain = true
                    } else {
                        surf = toSurface(node)
                    }
                        if (!surf) {
                            if (invalidStarterChain) {
                                args[argKey] = surf
                                continue
                            }
                            // Only report error if there's no default to fall back to
                            if (!def.default) {
                                if (!node) {
                                    pushDiag('S001', call, `Missing required surface argument '${def.name}' for ${call.name}()`)
                                } else if (node.type === 'Ident' && !symbols.has(node.name)) {
                                    pushDiag('S003', node, `Undefined variable '${node.name}' for '${def.name}' in ${call.name}()`)
                                } else {
                                    const nodeName = node.name || node.path?.join('.') || node.value || node.type || 'invalid'
                                    pushDiag('S001', node, `Invalid surface reference '${nodeName}' for '${def.name}' in ${call.name}()`)
                                }
                            }
                            // Fall back to default surface when resolution fails
                            if (def.default) {
                                surf = toSurface({ type: 'Ident', name: def.default }) || { kind: 'pipeline', name: def.default }
                            }
                        }
                        args[argKey] = surf
                    } else if (node && node.type === 'Call' && node.args?.length === (node.name === 'vec2' ? 2 : 4) && (
                        (def.type === 'vec2' && node.name === 'vec2') ||
                        (def.type === 'color' && node.name === 'vec4' && Array.isArray(def.default) && def.default.length === 4))) {
                        // vec2(x, y) on a vec2 parameter, and vec4(x, y, z, w) on a
                        // vec4 parameter. The loader registers vec4 parameters as
                        // `color`; their default keeps its four components. Any
                        // other form, including a wrong component count, takes
                        // the branches below.
                        args[argKey] = node.args.map(arg => {
                            if (arg.type === 'Number') return arg.value
                            pushDiag('S002', arg, `Argument out of range for '${def.name}' in ${call.name}()`)
                            return 0
                        })
                    } else if (def.type === 'color') {
                        if (node && node.type === 'String') {
                            pushDiag('S001', node, `String literal not allowed for color parameter '${def.name}'`)
                            args[argKey] = def.default
                            continue
                        }
                        let value
                        if (node && node.type === 'Color') {
                            // Keep hex colors as hex strings (e.g., "#ff0000")
                            value = node.hex || node.value
                        } else {
                            if (node && node.type && node.type !== 'Ident') {
                                pushDiag('S002', node, `Argument out of range for '${def.name}' in ${call.name}()`)
                            }
                            value = def.default
                        }
                        args[argKey] = value
                    } else if (def.type === 'vec3') {
                        if (node && node.type === 'String') {
                            pushDiag('S001', node, `String literal not allowed for vec3 parameter '${def.name}'`)
                            args[argKey] = def.default ? def.default.slice() : [0,0,0]
                            continue
                        }
                        let value
                        if (node && node.type === 'Call' && node.name === 'vec3' && node.args && node.args.length === 3) {
                            value = []
                            for (const arg of node.args) {
                                if (arg.type === 'Number') {
                                    value.push(arg.value)
                                } else {
                                    pushDiag('S002', arg, `Argument out of range for '${def.name}' in ${call.name}()`)
                                    value.push(0)
                                }
                            }
                        } else if (node && node.type === 'Color') {
                            value = node.value.slice(0, 3)
                        } else {
                            if (node && node.type && node.type !== 'Ident') {
                                pushDiag('S002', node, `Argument out of range for '${def.name}' in ${call.name}()`)
                            }
                            value = def.default ? def.default.slice() : [0,0,0]
                        }
                        args[argKey] = value
                    } else if (def.type === 'vec4') {
                        if (node && node.type === 'String') {
                            pushDiag('S001', node, `String literal not allowed for vec4 parameter '${def.name}'`)
                            args[argKey] = def.default ? def.default.slice() : [0,0,0,1]
                            continue
                        }
                        let value
                        if (node && node.type === 'Call' && node.name === 'vec4' && node.args && node.args.length === 4) {
                            value = []
                            for (const arg of node.args) {
                                if (arg.type === 'Number') {
                                    value.push(arg.value)
                                } else {
                                    pushDiag('S002', arg, `Argument out of range for '${def.name}' in ${call.name}()`)
                                    value.push(0)
                                }
                            }
                        } else if (node && node.type === 'Color') {
                            // Color nodes already have 4 components [r, g, b, a]
                            value = node.value.slice()
                        } else {
                            if (node && node.type && node.type !== 'Ident') {
                                pushDiag('S002', node, `Argument out of range for '${def.name}' in ${call.name}()`)
                            }
                            value = def.default ? def.default.slice() : [0,0,0,1]
                        }
                        args[argKey] = value
                    } else if (def.type === 'boolean') {
                        if (node && node.type === 'String') {
                            pushDiag('S001', node, `String literal not allowed for boolean parameter '${def.name}'`)
                            args[argKey] = def.default !== undefined ? !!def.default : false
                            continue
                        }
                        let value
                        if (node && node.type === 'Boolean') {
                            value = !!node.value
                        } else if (node && node.type === 'Number') {
                            value = node.value !== 0
                        } else if (node && node.type === 'Func') {
                            try {
                                const fn = new Function('state', `with(state){ return ${node.src}; }`)
                                // _ast keeps the source text for the unparser.
                                value = {fn: (state) => !!fn(state), _ast: node}
                            } catch {
                                pushDiag('S001', node, `Invalid function for '${def.name}': '${node.src?.slice(0, 50) || 'unknown'}'`)
                                value = def.default !== undefined ? !!def.default : false
                            }
                        } else if (node && node.type === 'Ident' && stateValues.has(node.name)) {
                            const key = node.name
                            value = {fn: (state) => !!state[key]}
                        } else {
                            if (node && node.type === 'Ident' && !stateValues.has(node.name)) {
                                pushDiag('S003', node)
                            } else if (node && node.type && node.type !== 'Ident') {
                                pushDiag('S002', node, `Argument out of range for '${def.name}' in ${call.name}()`)
                            }
                            value = def.default !== undefined ? !!def.default : false
                        }
                        args[argKey] = value
                    } else if (def.type === 'member') {
                        if (node && node.type === 'String') {
                            pushDiag('S001', node, `String literal not allowed for member/enum parameter '${def.name}'`)
                            args[argKey] = def.default
                            continue
                        }
                        const prefix = normalizeMemberPath(def.enumPath || def.enum)
                        let path = null
                        if (node && node.type === 'Member') {
                            path = normalizeMemberPath(node.path)
                        } else if (node && (node.type === 'Number' || node.type === 'Boolean')) {
                            args[argKey] = node.type === 'Boolean' ? (node.value ? 1 : 0) : node.value
                            continue
                        } else if (node && node.type === 'Ident' && stateValues.has(node.name) && !isOwnChoice(def, node.name)) {
                            const key = node.name
                            args[argKey] = {fn: (state) => state[key]}
                            continue
                        } else if (node && node.type === 'Ident') {
                            path = [node.name]
                        }
                        if (!path) {
                            path = normalizeMemberPath(def.default)
                        }
                        let resolved = path ? resolveEnum(path) : undefined
                        if (resolved && resolved.type === 'Number') { resolved = resolved.value }
                        if (resolved && resolved.type === 'Boolean') { resolved = resolved.value ? 1 : 0 }
                        if (typeof resolved !== 'number') {
                            path = applyEnumPrefix(path || [], prefix)
                            if (prefix && path && !pathStartsWith(path, prefix)) {
                                pushDiag('S001', node || call, `Invalid enum value for '${def.name}': expected path starting with '${prefix.join('.')}'`)
                                path = prefix.slice()
                            }
                            resolved = path ? resolveEnum(path) : undefined
                            if (resolved && resolved.type === 'Number') { resolved = resolved.value }
                            if (resolved && resolved.type === 'Boolean') { resolved = resolved.value ? 1 : 0 }
                        }
                        if (typeof resolved !== 'number') {
                            const fallback = normalizeMemberPath(def.default)
                            let fallbackValue = fallback ? resolveEnum(fallback) : undefined
                            if (fallbackValue && fallbackValue.type === 'Number') {
                                fallbackValue = fallbackValue.value
                            }
                            if (fallbackValue && fallbackValue.type === 'Boolean') {
                                fallbackValue = fallbackValue.value ? 1 : 0
                            }
                            if (typeof fallbackValue === 'number') {
                                resolved = fallbackValue
                            } else {
                                resolved = 0
                            }
                        }
                        args[argKey] = resolved
                        if (node && node.type === 'Member' && path) {
                            node.path = path.slice()
                        }
                    } else if (def.type === 'volume') {
                        // Volume reference parameter (vol0-vol7 or "none")
                        if (node && node.type === 'String') {
                            pushDiag('S001', node, `String literal not allowed for volume parameter '${def.name}'`)
                            args[argKey] = def.default ? { kind: 'vol', name: def.default } : null
                            continue
                        }
                        let value = null
                        // Handle Read3D nodes with single arg (read3d(vol0) for param use)
                        if (node && (node.type === 'Read' || node.type === 'Read3D')) rejectValueId(node)
                        if (node && node.type === 'Read3D' && node.tex3d && !node.geo) {
                            const volName = node.tex3d.name
                            if (/^vol[0-7]$/.test(volName)) {
                                value = { kind: 'vol', name: volName }
                            } else {
                                pushDiag('S001', node, `Invalid volume reference '${volName}' in read3d() for '${def.name}' - expected vol0-vol7`)
                                value = def.default ? { kind: 'vol', name: def.default } : null
                            }
                        } else if (node && node.type === 'VolRef') {
                            value = { kind: 'vol', name: node.name }
                        } else if (node && node.type === 'Ident') {
                            if (node.name === 'none') {
                                value = { kind: 'vol', name: 'none' }
                            } else if (/^vol[0-7]$/.test(node.name)) {
                                value = { kind: 'vol', name: node.name }
                            } else {
                                pushDiag('S001', node, `Invalid volume reference '${node.name}' for '${def.name}' - expected vol0-vol7 or none`)
                                value = def.default ? { kind: 'vol', name: def.default } : null
                            }
                        } else if (!node && def.default) {
                            value = { kind: 'vol', name: def.default }
                        }
                        args[argKey] = value
                    } else if (def.type === 'geometry') {
                        // Geometry reference parameter (geo0-geo7 or "none")
                        if (node && node.type === 'String') {
                            pushDiag('S001', node, `String literal not allowed for geometry parameter '${def.name}'`)
                            args[argKey] = def.default ? { kind: 'geo', name: def.default } : null
                            continue
                        }
                        let value = null
                        // Handle Read3D nodes with single arg (read3d(geo0) for param use)
                        if (node && (node.type === 'Read' || node.type === 'Read3D')) rejectValueId(node)
                        if (node && node.type === 'Read3D' && node.tex3d && !node.geo) {
                            const geoName = node.tex3d.name
                            if (/^geo[0-7]$/.test(geoName)) {
                                value = { kind: 'geo', name: geoName }
                            } else {
                                pushDiag('S001', node, `Invalid geometry reference '${geoName}' in read3d() for '${def.name}' - expected geo0-geo7`)
                                value = def.default ? { kind: 'geo', name: def.default } : null
                            }
                        } else if (node && node.type === 'GeoRef') {
                            value = { kind: 'geo', name: node.name }
                        } else if (node && node.type === 'Ident') {
                            if (node.name === 'none') {
                                value = { kind: 'geo', name: 'none' }
                            } else if (/^geo[0-7]$/.test(node.name)) {
                                value = { kind: 'geo', name: node.name }
                            } else {
                                pushDiag('S001', node, `Invalid geometry reference '${node.name}' for '${def.name}' - expected geo0-geo7 or none`)
                                value = def.default ? { kind: 'geo', name: def.default } : null
                            }
                        } else if (!node && def.default) {
                            value = { kind: 'geo', name: def.default }
                        }
                        args[argKey] = value
                    } else if (def.type === 'string') {
                        // STRICT STRING PARAMETER VALIDATION
                        // Extract func name from opName (e.g., "filter.text" -> "text")
                        const funcName = opName.includes('.') ? opName.split('.').pop() : opName
                        const allowlistKey = `${funcName}.${def.name}`

                        if (!ALLOWED_STRING_PARAMS.has(allowlistKey)) {
                            pushDiag('S001', node || original, `String parameter '${def.name}' on effect '${funcName}' is NOT in the allowed string params list. String params are strictly controlled - use enums or choices instead.`)
                            args[argKey] = def.default
                            continue
                        }

                        // String type parameters - only accept String AST nodes or use default
                        let value
                        if (node && node.type === 'String') {
                            value = node.value
                        } else if (node && node.type === 'Ident' && def.choices) {
                            // Allow bare identifiers if they match a choice key
                            if (def.choices[node.name] !== undefined) {
                                value = def.choices[node.name]
                            } else {
                                pushDiag('S001', node, `Invalid choice '${node.name}' for string parameter '${def.name}'`)
                                value = def.default
                            }
                        } else if (node) {
                            pushDiag('S001', node, `String parameter '${def.name}' requires a quoted string literal, got ${node.type}`)
                            value = def.default
                        } else {
                            value = def.default
                        }
                        args[argKey] = value
                    } else {
                        // Numeric types - REJECT String nodes
                        if (node && node.type === 'String') {
                            pushDiag('S001', node, `String literal not allowed for numeric parameter '${def.name}' - strings are only valid for type: "string" parameters`)
                            args[argKey] = def.default
                            continue
                        }
                        let value
                        if (node && (node.type === 'Number' || node.type === 'Boolean')) {
                            value = node.type === 'Boolean' ? (node.value ? 1 : 0) : node.value
                            const clamped = clamp(value, def.min, def.max)
                            if (clamped !== value) {
                                pushDiag('S002', node, `Argument out of range for '${def.name}' in ${call.name}() (got ${value}, clamped to ${clamped})`)
                            }
                            value = clamped
                            // Preserve variable reference marker for unparser round-trip
                            if (node._varRef) {
                                value = { _varRef: node._varRef, value }
                            }
                        } else if (node && node.type === 'Func') {
                            try {
                                const fn = new Function('state', `with(state){ return ${node.src}; }`)
                                // _ast keeps the source text for the unparser.
                                value = {fn, min:def.min, max:def.max, _ast: node}
                            } catch {
                                pushDiag('S001', node, `Invalid function for '${def.name}': '${node.src?.slice(0, 50) || 'unknown'}'`)
                                value = def.default
                            }
                        } else if (node && node.type === 'Oscillator') {
                            value = compileAutomationDescriptor(node)
                        } else if (node && node.type === 'Midi') {
                            value = compileAutomationDescriptor(node)
                        } else if (node && node.type === 'Audio') {
                            value = compileAutomationDescriptor(node)
                        } else if (node && node.type === 'Member') {
                            const cur = resolveEnum(node.path)
                            if (typeof cur === 'number') {
                                value = clamp(cur, def.min, def.max)
                                if (value !== cur) {
                                    pushDiag('S002', node, `Argument out of range for '${def.name}' in ${call.name}() (got ${cur}, clamped to ${value})`)
                                }
                            } else if (typeof cur === 'boolean') {
                                const num = cur ? 1 : 0
                                value = clamp(num, def.min, def.max)
                                if (value !== num) {
                                    pushDiag('S002', node, `Argument out of range for '${def.name}' in ${call.name}() (got ${num}, clamped to ${value})`)
                                }
                            } else {
                                pushDiag('S001', node, `Cannot resolve enum value for '${def.name}': '${node?.path?.join('.') || node?.name || 'unknown'}'`)
                                value = def.default
                            }
                        } else if (node && node.type === 'Ident' && stateValues.has(node.name) && !isOwnChoice(def, node.name)) {
                            const key = node.name
                            value = {fn: (state) => state[key], min:def.min, max:def.max, _ast: node}
                        } else if (node && node.type === 'Ident' && def.enum) {
                            // Try to resolve bare identifier as enum value within the param's enum path
                            const prefix = normalizeMemberPath(def.enum)
                            const path = prefix ? prefix.concat([node.name]) : [node.name]
                            const resolved = resolveEnum(path)
                            if (typeof resolved === 'number') {
                                value = clamp(resolved, def.min, def.max)
                            } else if (resolved && resolved.type === 'Number') {
                                value = clamp(resolved.value, def.min, def.max)
                            } else {
                                pushDiag('S003', node)
                                value = def.default
                            }
                        } else if (node && node.type === 'Ident' && def.choices) {
                            // Try to resolve bare identifier against inline choices
                            const choiceVal = def.choices[node.name]
                            if (typeof choiceVal === 'number') {
                                value = clamp(choiceVal, def.min, def.max)
                            } else {
                                pushDiag('S003', node)
                                value = def.default
                            }
                        } else {
                            if (node && node.type === 'Ident' && !stateValues.has(node.name)) {
                                pushDiag('S003', node)
                            } else if (node && node.type && node.type !== 'Ident') {
                                pushDiag('S002', node, `Argument out of range for '${def.name}' in ${call.name}()`)
                            }
                            if (def.defaultFrom) {
                                // Look up the referenced arg by its DSL name (def.name), NOT uniform name
                                const ref = spec.args.find(d => d.name === def.defaultFrom)
                                const refKey = ref ? ref.name : def.defaultFrom
                                if (args[refKey] !== undefined) {
                                    value = args[refKey]
                                } else {
                                    value = def.default
                                }
                            } else {
                                value = def.default
                            }
                        }
                        args[argKey] = value
                    }
                }

                // The element's own seed is kept for the unparser.
                if (kw && kw._seed !== undefined) {
                    if (elementSeed !== null) args._seed = elementSeed
                    seen.add('_seed')
                }

                // Effect seeds the program did not set inherit from the
                // scope's seed: a draw over the parameter's whole-number range.
                let inheritedSeeds = null
                for (const def of inheritable) {
                    if (!Number.isFinite(def.min) || !Number.isFinite(def.max)) continue
                    const key = restartsKeys
                        ? joinKey(elementKey, def.name, 'inherit')
                        : joinKey(...keyScope, elementKey, def.name, 'inherit')
                    args[def.name] = randIntFrom(drawU32(callSeed, key), Math.ceil(def.min), Math.floor(def.max))
                    inheritedSeeds = inheritedSeeds || {}
                    inheritedSeeds[def.name] = true
                }

                // The element id (`_id:` meta-argument)
                if (kw && kw._id !== undefined) {
                    elementId(kw._id, call, args)
                    seen.add('_id')
                }

                // Handle _skip meta-argument (skip this step in the pipeline)
                if (kw && kw._skip !== undefined) {
                    const skipNode = kw._skip
                    if (containsRandom(skipNode)) {
                        pushDiag('S013', original, 'A random call cannot set _skip')
                    }
                    if (skipNode && skipNode.type === 'Boolean') {
                        args._skip = skipNode.value
                    } else {
                        args._skip = false
                    }
                    seen.add('_skip')
                }

                if (kw) {
                    for (const key of Object.keys(kw)) {
                        if (!seen.has(key)) {
                            pushDiag('S001', kw[key], `Unknown argument '${key}' for ${call.name}()`)
                        }
                    }
                }

                // Positionals left over after every slot is filled correspond to
                // no parameter, so they would bind to nothing. On 2.x that is an
                // error: a program that passes them does not compile.
                if (byIndex) posCursor = specArgs.length
                if (posCursor < call.args.length) {
                    const extra = call.args[posCursor]
                    pushDiag('S009', extra || call, `Too many positional arguments for ${call.name}(): '${call.name}' takes ${specArgs.length}`)
                }
                const hook = typeof call.name === 'string' ? validatorHooks[call.name] : null
                if (typeof hook === 'function') {
                    const starterInfo = getStarterInfo(original)
                    const hookResult = hook({
                        call,
                        originalCall: original,
                        args,
                        writeName,
                        from: fromInput,
                        allocateTemp: () => tempIndex++,
                        addStep: (step) => {
                            if (step && typeof step === 'object') {
                                chain.push(step)
                            }
                        },
                        addState: (state) => {
                            if (state && typeof state === 'object') {
                                states.push(state)
                            }
                        },
                        pushDiagnostic: pushDiag,
                        states,
                        starter: starterInfo
                    })
                    if (hookResult && hookResult.handled) {
                        if (hookResult.current !== undefined && hookResult.current !== null) {
                            current = hookResult.current
                        }
                        continue
                    }
                }
                const idx = tempIndex++
                const namespaceSnapshot = buildNamespaceSnapshot(call.namespace)
                const step = {op: opName, args, from: fromInput, temp: idx}
                if (namespaceSnapshot) { step.namespace = namespaceSnapshot }
                if (original.leadingComments) { step.leadingComments = original.leadingComments }
                // Preserve raw kwargs from original AST for automation UI extraction
                if (original.kwargs && Object.keys(original.kwargs).length > 0) {
                    step.rawKwargs = original.kwargs
                }
                // Sidecar source-form metadata for unparser round-trip.
                // Absent when no arg used a source-tagged input form, so
                // existing programs add no new fields to compiled output.
                if (argSources) { step.argSources = argSources }
                if (randomSources) { step.randomSources = randomSources }
                if (authoredSeeds.length) { step.authoredSeeds = authoredSeeds }
                if (inheritedSeeds) { step.inheritedSeeds = inheritedSeeds }
                chain.push(step)
                current = idx
            }
            return current
        }

        const finalIndex = processChain(stmt.chain, null)
        let writeSurf = null
        if (stmt.write) {
            writeSurf = {kind:'output', name: stmt.write.name}
        }
        const plan = {chain, write: writeSurf, write3d: write3dTarget, final: finalIndex, states}
        // Preserve plan-level leading comments (from the statement)
        if (stmt.leadingComments) { plan.leadingComments = stmt.leadingComments }
        return plan
    }

    function compileBlock(body) {
        const result = []
        // A `let` inside a block applies to the rest of that block only, so a
        // block cannot change how statements outside it compile.
        const shadowed = new Map()
        for (const s of body || []) {
            if (s.type === 'VarAssign') {
                if (!shadowed.has(s.name)) {
                    shadowed.set(s.name, symbols.has(s.name) ? { value: symbols.get(s.name) } : null)
                }
                declareVar(s)
                // Kept as the parser node, like the top-level `vars` entries
                result.push(s)
                continue
            }
            const compiled = compileStmt(s)
            if (compiled) result.push(compiled)
        }
        for (const [name, previous] of shadowed) {
            if (previous) symbols.set(name, previous.value)
            else symbols.delete(name)
        }
        return result
    }

    // Control-flow plans keep their parser statement as a non-enumerable
    // `source`, so the unparser can write conditions and return values as
    // written. The public compiled plan shape is unchanged.
    function withSource(plan, stmt) {
        Object.defineProperty(plan, 'source', { value: stmt, enumerable: false })
        return plan
    }

    function compileStmt(stmt) {
        if (stmt.type === 'IfStmt') {
            const ifKey = `if_${++ifCount}`
            const resolveCondition = (condition, k) => {
                if (!containsRandom(condition)) return condition
                return resolveRandomAt(substitute(clone(condition)), joinKey(ifKey, `cond${k}`)) ?? {type: 'Boolean', value: false}
            }
            const inBranch = (k, body) => {
                keyScope.push(`${ifKey}/b${k}`)
                try {
                    return compileBlock(body)
                } finally {
                    keyScope.pop()
                }
            }
            reportReadsBeforeLet(stmt.condition)
            const cond = evalCondition(resolveCondition(stmt.condition, 0))
            const thenBranch = inBranch(0, stmt.then)
            const elif = []
            let branch = 0
            for (const e of stmt.elif || []) {
                branch++
                reportReadsBeforeLet(e.condition)
                elif.push({cond: evalCondition(resolveCondition(e.condition, branch)), then: inBranch(branch, e.then)})
            }
            const elseBranch = inBranch(branch + 1, stmt.else)
            return withSource({type:'Branch', cond, then: thenBranch, elif, else: elseBranch}, stmt)
        }
        if (stmt.type === 'Break') {
            return withSource({type:'Break'}, stmt)
        }
        if (stmt.type === 'Continue') {
            return withSource({type:'Continue'}, stmt)
        }
        if (stmt.type === 'Return') {
            const node = {type:'Return'}
            if (stmt.value) {
                reportReadsBeforeLet(stmt.value)
                node.value = evalExpr(stmt.value)
            }
            return withSource(node, stmt)
        }
        return compileChainStatement(stmt)
    }

    // Statements compile in order. Each one sees the lets written before it,
    // and the latest assignment of a name wins. Lets that come after the
    // last statement are still declared, so their own checks run.
    const statements = ast.plans || []
    for (let index = 0; index < statements.length; index++) {
        declareVarsBefore(index)
        const compiled = compileStmt(statements[index])
        if (compiled) plans.push(compiled)
    }
    declareVarsBefore(Infinity)
    settleElementIds(plans)
    dropMarks(plans)

    // Include original variable declarations for unparsing
    const vars = ast.vars || []

    // Include search order for transform operations
    const searchNamespaces = programSearchOrder || []

    // Preserve trailing comments from program
    const result = {plans, diagnostics: diagnosticsList, render, vars, searchNamespaces}
    if (hasSeedDirective) { result.seed = programSeed }
    if (ast.trailingComments) { result.trailingComments = ast.trailingComments }
    // The plans in source order. A let's `planIndex` points into this list,
    // so the unparser can keep statement order after hosts remove plans.
    Object.defineProperty(result, 'planOrder', { value: plans.slice(), enumerable: false })
    return result
}
