/**
 * A text for a compiled argument value, as JSON with these changes: numbers
 * keep NaN, the infinities and -0, and object keys are sorted, so the same
 * value rebuilt in another key order gives the same text. As in JSON,
 * undefined reads as null, and undefined and function members are left out. The
 * validator records it for the values a let call compiled to, and the
 * unparser compares it to find a value a host changed in place.
 */
export function argValueKey(value) {
    return JSON.stringify(value === undefined ? null : value, (key, v) => {
        if (typeof v === 'number') {
            if (Number.isNaN(v)) return '\u0000NaN'
            if (v === Infinity) return '\u0000Infinity'
            if (v === -Infinity) return '\u0000-Infinity'
            if (Object.is(v, -0)) return '\u0000-0'
            return v
        }
        if (v instanceof Map) return { '\u0000map': [...v] }
        if (v instanceof Set) return { '\u0000set': [...v] }
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            return Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]]))
        }
        return v
    })
}
