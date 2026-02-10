const legacyEnums = {}
let mutableEnums = legacyEnums
let frozenEnums = null

/**
 * Deep merge source into target, recursively merging nested objects
 * Creates new objects as needed to avoid mutating frozen objects
 */
function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target

  for (const key of Object.keys(source)) {
    const sourceVal = source[key]
    const targetVal = target[key]

    // If both are plain objects (not arrays, not enum entries with 'type'), recurse
    if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
        targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal) &&
        !('type' in sourceVal)) {
      // Create a new object if target is frozen
      if (Object.isFrozen(targetVal)) {
        target[key] = deepMerge({ ...targetVal }, sourceVal)
      } else {
        deepMerge(targetVal, sourceVal)
      }
    } else {
      // Otherwise just assign (overwrites or adds)
      target[key] = sourceVal
    }
  }
  return target
}

/**
 * Deep clone an object
 */
function deepClone(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(deepClone)

  const clone = {}
  for (const key of Object.keys(obj)) {
    clone[key] = deepClone(obj[key])
  }
  return clone
}

function cloneEnumTree(source, mergeEnumsFn) {
  if (!mergeEnumsFn) return deepClone(source)
  const clone = {}
  mergeEnumsFn(clone, source)
  return clone
}

function deepFreezeEnumTree(node) {
  if (!node || typeof node !== 'object' || Object.isFrozen(node)) { return node }
  Object.freeze(node)
  for (const child of Object.values(node)) {
    if (child && typeof child === 'object') {
      deepFreezeEnumTree(child)
    }
  }
  return node
}

function rebuildFrozenEnums(mergeEnumsFn) {
  const clone = cloneEnumTree(mutableEnums, mergeEnumsFn)
  frozenEnums = deepFreezeEnumTree(clone)
}

export async function mergeIntoEnums(source, mergeEnumsFn) {
  if (!source || typeof source !== 'object') { return frozenEnums }
  if (mergeEnumsFn) {
      mergeEnumsFn(mutableEnums, source)
  } else {
      // Use deep merge to properly handle nested namespace paths
      deepMerge(mutableEnums, source)
  }
  rebuildFrozenEnums(mergeEnumsFn)
  return frozenEnums
}

// Initialize with empty enums
rebuildFrozenEnums()

export { frozenEnums as default }
