const effects = new Map()

export function registerEffect(name, definition) {
    effects.set(name, definition)
}

export function unregisterEffect(name) {
    return effects.delete(name)
}

export function getEffect(name) {
    return effects.get(name)
}

export function getAllEffects() {
    return effects
}
