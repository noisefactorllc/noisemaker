import {
    normalizeNamespaceName,
    getNamespaceMetadata,
    getCanonicalNamespaceRecord,
    buildNamespaceExportMap
} from './namespaces.js'

function normalizeCallName(name) {
    return normalizeNamespaceName(name)
}

function normalizeNamespacePreference(namespace) {
    const result = []
    const push = (value) => {
        const normalized = normalizeNamespaceName(value)
        if (!normalized) { return }
        if (result.includes(normalized)) { return }
        result.push(normalized)
    }
    if (!namespace) { return result }
    if (typeof namespace === 'string') {
        push(namespace)
        return result
    }
    if (Array.isArray(namespace)) {
        namespace.forEach(push)
        return result
    }
    if (typeof namespace !== 'object') { return result }
    if (Array.isArray(namespace.searchOrder)) {
        namespace.searchOrder.forEach(push)
    }
    if (typeof namespace.resolved === 'string') {
        push(namespace.resolved)
    }
    if (typeof namespace.name === 'string') {
        push(namespace.name)
    }
    if (Array.isArray(namespace.path) && namespace.path.length) {
        push(namespace.path.join('.'))
    }
    if (typeof namespace.preferred === 'string') {
        push(namespace.preferred)
    }
    return result
}

function pickBestRecord({ metadata, namespacePreference, fallbackName }) {
    if (!metadata) { return null }
    const canonicalName = metadata.canonicalName || fallbackName
    const preferences = Array.isArray(namespacePreference) ? namespacePreference : (namespacePreference ? [namespacePreference] : [])
    for (const ns of preferences) {
        const preferred = getCanonicalNamespaceRecord(ns, canonicalName)
        if (preferred) { return preferred }
    }
    return getCanonicalNamespaceRecord(metadata.namespace, canonicalName) || metadata
}

export function resolveCallTarget(callName, callNamespace = null) {
    const normalizedName = normalizeCallName(callName)
    if (!normalizedName) {
        return {
            lookupName: callName,
            canonicalName: callName,
            legacyName: callName,
            namespaceId: null,
            namespacedName: null,
            exportsEnabled: false,
            namespaceRecord: null,
            metadata: null
        }
    }

    // No namespace? Use the call name as-is. The DSL file is the source of truth.
    if (!callNamespace) {
        return {
            lookupName: normalizedName,
            canonicalName: normalizedName,
            legacyName: normalizedName,
            namespaceId: null,
            namespacedName: null,
            exportsEnabled: false,
            namespaceRecord: null,
            metadata: null
        }
    }

    // Extract namespace preference
    const namespacePreference = normalizeNamespacePreference(callNamespace)
    const preferredNamespaceId = Array.isArray(namespacePreference) && namespacePreference.length
        ? namespacePreference[0]
        : (typeof namespacePreference === 'string' ? namespacePreference : null)

    // With explicit namespace, get the specific record
    let record = null
    if (preferredNamespaceId) {
        record = getCanonicalNamespaceRecord(preferredNamespaceId, normalizedName)
    }

    // Fall back to general metadata lookup
    const metadata = record || getNamespaceMetadata(normalizedName)
    const bestRecord = pickBestRecord({ metadata, namespacePreference, fallbackName: normalizedName })
    const finalRecord = bestRecord || record || metadata

    const canonicalName = finalRecord?.canonicalName || normalizedName
    const namespacedName = finalRecord?.namespacedName || null
    const namespaceId = finalRecord?.namespace || preferredNamespaceId || null
    const exportsEnabled = finalRecord?.exportsEnabled === true
    return {
        lookupName: canonicalName,
        canonicalName,
        legacyName: normalizedName,
        namespaceId,
        namespacedName,
        exportsEnabled,
        namespaceRecord: finalRecord || null,
        metadata: metadata || null
    }
}

export function getActiveNamespaceResolutionMap({ includeDisabled = true } = {}) {
    const exportMap = buildNamespaceExportMap({ includeDisabled })
    const result = {}
    Object.keys(exportMap).forEach((legacyName) => {
        const metadata = getNamespaceMetadata(legacyName)
        result[legacyName] = {
            namespacedName: exportMap[legacyName],
            exportsEnabled: metadata?.exportsEnabled === true,
            namespaceId: metadata?.namespace || null,
            canonicalName: metadata?.canonicalName || legacyName
        }
    })
    return result
}

export default {
    resolveCallTarget,
    getActiveNamespaceResolutionMap
}
