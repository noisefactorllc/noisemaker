/**
 * Resolution of the language's random constructs.
 *
 * The validator calls resolveRandom on a value that contains a random call.
 * It returns the value with every random call, and the arithmetic around
 * them, replaced by a literal node. Each call draws from the seed of its
 * scope and from a key: the key of the place the value is written, extended
 * by the call's path inside the value. The source keeps the calls; only the
 * compiled program holds the results.
 */
import {
    PIN_KEY,
    chanceFrom,
    drawU32,
    joinKey,
    pathSegment,
    pickIndex,
    randColorFrom,
    randFrom,
    randIntFrom
} from './draws.js'

/** The names a random call can have. They are not keywords. */
export const RANDOM_FUNCTIONS = new Set(['rand', 'randInt', 'pick', 'chance', 'randColor', 'choices'])

/** Arguments by position and name, for the calls with a fixed signature. */
const SIGNATURES = {
    rand: ['min', 'max'],
    randInt: ['min', 'max'],
    chance: ['p'],
    randColor: ['h', 's', 'v']
}

/** Automation nodes keep their arguments as fields of these names. */
const AUTOMATION_ARGUMENTS = {
    Oscillator: { oscType: 'type', min: 'min', max: 'max', speed: 'speed', offset: 'offset', seed: 'seed' },
    Midi: { channel: 'channel', mode: 'mode', cc: 'cc', nrpn: 'nrpn', zone: 'zone', members: 'members', min: 'min', max: 'max', sensitivity: 'sensitivity' },
    Audio: { band: 'band', min: 'min', max: 'max' }
}

/** An error in a random call, reported with the node it concerns. */
export class RandomCallError extends Error {
    constructor(node, message, code = 'S012') {
        super(message)
        this.node = node
        this.code = code
    }
}

function isVectorCall(node) {
    return node.type === 'Call' && /^vec[234]$/.test(node.name)
}

/**
 * Whether a value contains a random call. An effect passed as a value is
 * compiled as its own element, so the walk stops there.
 */
export function containsRandom(node) {
    if (!node || typeof node !== 'object') return false
    if (Array.isArray(node)) return node.some(containsRandom)
    switch (node.type) {
        case 'Random':
            return true
        case 'Binary':
            return containsRandom(node.left) || containsRandom(node.right)
        case 'Unary':
            return containsRandom(node.arg)
        case 'ArrayLiteral':
            return containsRandom(node.elements)
        case 'Chain':
            return false
        case 'Call':
            return isVectorCall(node) && (containsRandom(node.args) || containsRandom(Object.values(node.kwargs || {})))
        default:
            if (AUTOMATION_ARGUMENTS[node.type]) {
                return Object.keys(AUTOMATION_ARGUMENTS[node.type]).some(field => containsRandom(node[field]))
            }
            return false
    }
}

/**
 * Whether a source text calls a random function, for arrow function bodies,
 * which are evaluated at run time and must not draw.
 */
export function sourceCallsRandom(src) {
    return /(^|[^A-Za-z0-9_.])(rand|randInt|pick|chance|randColor|choices)\s*\(/.test(src || '')
}

function numberOf(node, what) {
    if (node && node.type === 'Number') return node.value
    throw new RandomCallError(node, `${what} requires a numeric argument`)
}

function withLoc(node, from) {
    if (from?.loc && node && typeof node === 'object' && !node.loc) node.loc = from.loc
    return node
}

function hexToColor(hex, from) {
    const value = [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
        1
    ]
    return withLoc({ type: 'Color', value }, from)
}

/**
 * Bind a call's arguments to its signature: positionals in order, then
 * keywords. `seed` is the call-level seed and is not an argument.
 */
function bindArguments(node, names) {
    const bound = {}
    const args = node.args || []
    if (args.length > names.length) {
        throw new RandomCallError(node, `${node.fn}() takes at most ${names.length} argument${names.length === 1 ? '' : 's'}`)
    }
    args.forEach((arg, i) => { bound[names[i]] = arg })
    for (const [key, value] of Object.entries(node.kwargs || {})) {
        if (key === 'seed') continue
        if (!names.includes(key)) {
            throw new RandomCallError(node, `${node.fn}() has no argument '${key}'`)
        }
        if (bound[key] !== undefined) {
            throw new RandomCallError(node, `'${key}' is passed twice to ${node.fn}()`)
        }
        bound[key] = value
    }
    return bound
}

/**
 * The draw of a random call: from its call-level seed under the constant key,
 * or from the scope's seed under the call's key.
 */
function drawFor(node, ctx, path) {
    const own = node.kwargs?.seed
    if (own !== undefined) {
        if (own.type !== 'Number' || !Number.isInteger(own.value) || own.value < 0 || own.value > 4294967295) {
            throw new RandomCallError(own, `${node.fn}(seed:) must be a whole number from 0 to 4294967295`, own.type === 'Random' ? 'S013' : 'S012')
        }
        return drawU32(own.value, PIN_KEY)
    }
    return drawU32(ctx.seed, joinKey(ctx.key, ...path))
}

function rangeError(node, error) {
    if (error instanceof RangeError) return new RandomCallError(node, error.message)
    return error
}

function resolveChoices(node, ctx) {
    if (!ctx.choicesFor) {
        throw new RandomCallError(node, 'choices() is not available here')
    }
    const [effect, param] = node.args || []
    if (!effect || !param || (node.args || []).length !== 2 || node.kwargs) {
        throw new RandomCallError(node, 'choices(effect, parameter) requires an effect and a parameter')
    }
    const names = ctx.choicesFor(effect, param)
    return names.map(name => withLoc({ type: 'Ident', name }, node))
}

/**
 * Resolve every random call in a value.
 *
 * @param {object} node the value's AST
 * @param {{seed: number, key: string, isShadowed?: Function, choicesFor?: Function}} ctx
 *   `seed` is the scope's seed and `key` the key of the place the value is
 *   written. `isShadowed(name)` says whether a `let` hides a random
 *   function's name; `choicesFor(effect, param)` lists a parameter's choices.
 * @param {string[]} [path] the path of `node` inside the value
 * @returns {object} the value with literal nodes in place of random calls
 */
export function resolveRandom(node, ctx, path = []) {
    if (!node || typeof node !== 'object') return node
    switch (node.type) {
        case 'Random':
            return resolveCall(node, ctx, path)
        case 'Binary': {
            const left = numberOf(resolveRandom(node.left, ctx, [...path, pathSegment.operand(0)]), `'${node.op}'`)
            const right = numberOf(resolveRandom(node.right, ctx, [...path, pathSegment.operand(1)]), `'${node.op}'`)
            let value
            switch (node.op) {
                case '+': value = left + right; break
                case '-': value = left - right; break
                case '*': value = left * right; break
                default: value = left / right
            }
            return withLoc({ type: 'Number', value }, node)
        }
        case 'Unary':
            return withLoc({ type: 'Number', value: -numberOf(resolveRandom(node.arg, ctx, [...path, pathSegment.operand(0)]), "'-'") }, node)
        case 'ArrayLiteral': {
            const resolved = { ...node, elements: node.elements.map((e, i) => resolveRandom(e, ctx, [...path, pathSegment.component(i)])) }
            if (node.position) Object.defineProperty(resolved, 'position', { value: node.position, enumerable: false })
            return resolved
        }
        case 'Call':
            if (!isVectorCall(node)) return node
            return { ...node, args: (node.args || []).map((a, i) => resolveRandom(a, ctx, [...path, pathSegment.component(i)])) }
        default: {
            const fields = AUTOMATION_ARGUMENTS[node.type]
            if (!fields) return node
            const resolved = { ...node }
            for (const [field, name] of Object.entries(fields)) {
                if (node[field] !== undefined) {
                    resolved[field] = resolveRandom(node[field], ctx, [...path, pathSegment.named(name)])
                }
            }
            return resolved
        }
    }
}

function resolveCall(node, ctx, path) {
    if (ctx.isShadowed?.(node.fn)) {
        throw new RandomCallError(node, `'${node.fn}' is a variable here and cannot be called`)
    }
    if (node.fn === 'choices') {
        resolveChoices(node, ctx)
        throw new RandomCallError(node, 'choices() produced a list where a single value was expected. Wrap it in pick()')
    }
    if (node.fn === 'pick') return resolvePick(node, ctx, path)

    const names = SIGNATURES[node.fn]
    const bound = bindArguments(node, names)
    const value = {}
    for (const name of names) {
        if (bound[name] !== undefined) {
            value[name] = resolveRandom(bound[name], ctx, [...path, pathSegment.named(name)])
        }
    }
    const u = drawFor(node, ctx, path)
    try {
        switch (node.fn) {
            case 'rand': {
                if ((value.min === undefined) !== (value.max === undefined)) {
                    throw new RandomCallError(node, 'rand(min, max) requires both bounds or neither')
                }
                if (value.min === undefined) return withLoc({ type: 'Number', value: randFrom(u) }, node)
                return withLoc({ type: 'Number', value: randFrom(u, numberOf(value.min, 'rand(min, max)'), numberOf(value.max, 'rand(min, max)')) }, node)
            }
            case 'randInt': {
                if (value.min === undefined || value.max === undefined) {
                    throw new RandomCallError(node, 'randInt(min, max) requires exactly 2 arguments')
                }
                return withLoc({ type: 'Number', value: randIntFrom(u, numberOf(value.min, 'randInt(min, max)'), numberOf(value.max, 'randInt(min, max)')) }, node)
            }
            case 'chance': {
                if (value.p === undefined) {
                    throw new RandomCallError(node, 'chance(p) requires a probability')
                }
                return withLoc({ type: 'Boolean', value: chanceFrom(u, numberOf(value.p, 'chance(p)')) }, node)
            }
            default: {
                const given = {}
                for (const name of names) {
                    if (value[name] !== undefined) given[name] = numberOf(value[name], 'randColor()')
                }
                return hexToColor(randColorFrom(u, given), node)
            }
        }
    } catch (error) {
        throw rangeError(node, error)
    }
}

function resolvePick(node, ctx, path) {
    const kwargNames = Object.keys(node.kwargs || {}).filter(k => k !== 'seed')
    if (kwargNames.length) {
        throw new RandomCallError(node, `pick() has no argument '${kwargNames[0]}'`)
    }
    const items = []
    ;(node.args || []).forEach((arg, i) => {
        if (arg && arg.type === 'Random' && arg.fn === 'choices') {
            if (ctx.isShadowed?.('choices')) {
                throw new RandomCallError(arg, "'choices' is a variable here and cannot be called")
            }
            items.push(...resolveChoices(arg, ctx))
        } else {
            items.push(resolveRandom(arg, ctx, [...path, pathSegment.arg(i)]))
        }
    })
    if (items.length === 0) {
        throw new RandomCallError(node, 'pick() needs at least one value')
    }
    const u = drawFor(node, ctx, path)
    return items[pickIndex(u, items.length)]
}
