const effects = new Map()

export function registerEffect(name, definition) {
    effects.set(name, definition)
}

export function getEffect(name) {
    return effects.get(name)
}

export function getAllEffects() {
    return effects
}
