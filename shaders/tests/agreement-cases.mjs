import { UIController } from '../../demo/shaders/lib/demo-ui.js'
import { lex, parse, unparseCall } from '../src/lang/index.js'

export function agreementProgram(effect, params = {}) {
    const ui = Object.create(UIController.prototype)
    ui._parameterValues = {}
    const source = ui.buildDslSource(effect)
    const tokens = lex(source).filter(token => token.type !== 'COMMENT')
    const targets = tokens.flatMap((token, i) => token.type === 'IDENT' && token.lexeme === effect.instance.func && tokens[i + 1]?.type === 'LPAREN' ? [i] : [])
    if (targets.length !== 1) throw new Error(`Expected one target call for ${effect.namespace}/${effect.instance.func}`)
    const start = targets[0]
    let depth = 1
    let end = start + 2
    for (; end < tokens.length && depth; end++) {
        if (tokens[end].type === 'LPAREN') depth++
        if (tokens[end].type === 'RPAREN') depth--
    }
    if (depth) throw new Error('Unclosed target call')
    const callSource = source.slice(tokens[start].position.start, tokens[end - 1].position.end)
    const call = parse(lex(`search ${effect.namespace}\n${callSource}`)).plans[0].chain[0]
    // Keep the demo's input wiring, but let the engine supply every target
    // default. Demo-specific artistic settings are not default parameters.
    const inputs = Object.fromEntries(Object.entries(call.kwargs || {}).filter(([name]) =>
        ['surface', 'volume', 'geometry'].includes(effect.instance.globals?.[name]?.type)))
    const replacement = unparseCall({ name: effect.instance.func, args: [], kwargs: { ...inputs, ...params } })
    return source.slice(0, tokens[start].position.start) + replacement + source.slice(tokens[end - 1].position.end)
}

export function parameterCases(definition) {
    const cases = [{ name: 'default', params: {} }]
    for (const [name, spec] of Object.entries(definition.globals || {})) {
        const add = (label, value) => cases.push({ name: `${name}:${label}`, params: { [name]: value } })
        if (['int', 'float'].includes(spec.type)) {
            const choices = spec.choices ? [...new Set(Object.values(spec.choices).filter(Number.isFinite))].sort((a, b) => a - b) : null
            // Match the existing scalar slider's fallback range. Internal
            // storage fields have no UI range and stay at their defaults.
            const publicControl = spec.ui?.control !== false && !spec.ui?.hidden
            const min = spec.min ?? (publicControl ? 0 : undefined)
            const max = spec.max ?? (publicControl ? 100 : undefined)
            if (choices?.length && choices.every(Number.isFinite)) {
                for (const index of new Set([0, Math.floor((choices.length - 1) / 2), choices.length - 1])) add(choices[index], choices[index])
            } else if (Number.isFinite(min) && Number.isFinite(max)) {
                const midpoint = (min + max) / 2
                const values = [min, spec.type === 'int' ? Math.floor(midpoint) : midpoint, max]
                if (/seed/i.test(name)) {
                    for (let seed = 0; seed < 16; seed++) if (seed >= min && seed <= max) values.push(seed)
                }
                for (const value of [...new Set(values)].sort((a, b) => a - b)) add(value, value)
            } else if (/seed/i.test(name)) {
                throw new Error(`Seed parameter ${name} has no finite range`)
            }
        } else if (/^vec[234]$/.test(spec.type) && Array.isArray(spec.default)) {
            for (let i = 0; i < spec.default.length; i++) {
                const publicVector = spec.type === 'vec3' && spec.ui?.control !== false && !spec.ui?.hidden
                const min = (Array.isArray(spec.min) ? spec.min[i] : spec.min) ?? (publicVector ? -1 : undefined)
                const max = (Array.isArray(spec.max) ? spec.max[i] : spec.max) ?? (publicVector ? 1 : undefined)
                if (!Number.isFinite(min) || !Number.isFinite(max)) continue
                for (const value of new Set([min, (min + max) / 2, max])) {
                    const vector = [...spec.default]
                    vector[i] = value
                    add(`${i}:${value}`, vector)
                }
            }
        }
    }
    return cases
}

export function effectCases(effect) {
    const cases = parameterCases(effect.instance).map(c => ({ ...c, dsl: agreementProgram(effect, c.params) }))
    // Empty default polygons cannot exercise routed input. Keep the default
    // sweep and also run the effect's authored populated fixture.
    if (effect.namespace === 'synth' && effect.instance.func === 'remap') {
        cases.push({ name: 'active-input', params: {}, dsl: effect.instance.defaultProgram })
    }
    return cases
}

export function compareFrames(a, b) {
    if (a.width !== b.width || a.height !== b.height || !(a.width > 0 && a.height > 0)) throw new Error('Frame dimensions differ or are empty')
    const pixelCount = a.width * a.height
    if (a.data.length !== pixelCount * 4 || b.data.length !== pixelCount * 4) throw new Error('Invalid frame data length')
    let differingPixels = 0
    let maxDifference = 0
    for (let i = 0; i < a.data.length; i += 4) {
        let difference = 0
        for (let c = 0; c < 4; c++) difference = Math.max(difference, Math.abs(a.data[i + c] - b.data[i + c]))
        if (difference > 2) differingPixels++
        maxDifference = Math.max(maxDifference, difference)
    }
    return { differingPixels, pixelCount, fractionAbove2: differingPixels / pixelCount, maxDifference, pass: differingPixels === 0 }
}
