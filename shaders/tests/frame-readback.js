#!/usr/bin/env node
/**
 * GAP-012 focused regressions: the render-surface pixel readback that the
 * harness `renderEffectFrame` wrapper (shaders/tests/test-harness.js)
 * performs on WebGPU, expressed as an auditable node-side mirror.
 *
 * The upstream Shade MCP verb (vendor/shade-mcp/harness/index.js, originally
 * `src/tools/browser/render.ts`) shipped a GL-only readback that returned
 * `Failed to read pixels` on WebGPU; the vendor refresh (noisemaker 10386a1)
 * delivers the backend-neutral readback (shade-mcp#28), which reads the
 * render surface through the backend's async `readPixels(textureId)` on both
 * backends. The wrapper predates the fix and stays the repository readback
 * path because the delivered verb does not consult the pipeline's frame-read
 * textures. This module mirrors the wrapper's readback contract so it is
 * testable outside the browser and guarded against silent regression to a
 * GL-only readback.
 */

/**
 * Ordered render-surface texture candidates for `backend.readPixels()`.
 *
 * Mirrors the wrapper's in-page selection exactly: the pipeline's frame-read
 * texture for the graph's render surface first, then the global surface read
 * and write textures, then the highest-index `node_<n>_out` texture the
 * backend exposes (backends that do not expose a texture map in harness mode
 * contribute nothing instead of throwing). Candidates are deduplicated
 * preserving first occurrence.
 *
 * @param {object|null} pipeline - The live rendering pipeline.
 * @returns {string[]} Ordered, deduplicated texture ids (possibly empty).
 */
export function renderSurfaceCandidateIds(pipeline, backend = pipeline?.backend) {
    const candidates = []
    const surface = pipeline?.graph?.renderSurface
    const frameReadId = surface ? pipeline?.frameReadTextures?.get(surface) : null
    if (frameReadId) candidates.push(frameReadId)
    if (surface) {
        candidates.push(`global_${surface}_read`)
        candidates.push(`global_${surface}_write`)
    }
    try {
        const nodeIds = []
        for (const key of backend?.textures?.keys() ?? []) {
            if (/node_\d+_out/.test(key)) nodeIds.push(key)
        }
        nodeIds.sort((a, b) => parseInt(a.match(/node_(\d+)/)[1], 10) - parseInt(b.match(/node_(\d+)/)[1], 10))
        if (nodeIds.length) candidates.push(nodeIds[nodeIds.length - 1])
    } catch {
        // Some backends do not expose a texture map in harness mode.
    }
    return [...new Set(candidates)]
}

/**
 * A pixel read is usable only with positive dimensions and a data array.
 *
 * @param {object|null} pixels - A `{width, height, data}` read result.
 * @returns {boolean}
 */
export function isValidPixelRead(pixels) {
    return Boolean(pixels?.width && pixels?.height && pixels?.data)
}

/**
 * Read the render surface through the backend's `readPixels` and return the
 * first valid `{width, height, data}` result, or `null` when the backend
 * cannot read pixels (missing `readPixels`, every candidate missing,
 * throwing, or invalid). Async because WebGPU readback maps a staging
 * buffer. Never throws for per-candidate failures.
 *
 * @param {object|null} backend - The live pipeline backend.
 * @param {object|null} pipeline - The live rendering pipeline.
 * @returns {Promise<{width: number, height: number, data: Uint8Array}|null>}
 */
export async function readRenderSurfacePixels(backend, pipeline) {
    if (!backend || typeof backend.readPixels !== 'function') return null
    for (const textureId of renderSurfaceCandidateIds(pipeline, backend)) {
        try {
            const pixels = await backend.readPixels(textureId)
            if (isValidPixelRead(pixels)) return pixels
        } catch {
            // Try the next candidate texture.
        }
    }
    return null
}
