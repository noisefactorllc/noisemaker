/**
 * Resource Management Module
 * Handles Liveness Analysis and Texture Pooling (Register Allocation).
 */

/**
 * Analyzes the lifetime of each virtual texture in the pass list.
 * @param {Array} passes List of render passes
 * @returns {Map} Map<virtualId, {start: number, end: number}>
 */
export function analyzeLiveness(passes) {
    const lifetime = new Map()

    const touch = (texId, index) => {
        if (!texId) return
        // Ignore globals for liveness analysis (they are infinite)
        if (texId.startsWith('global_')) return

        if (!lifetime.has(texId)) {
            lifetime.set(texId, { start: index, end: index })
        } else {
            const l = lifetime.get(texId)
            l.start = Math.min(l.start, index)
            l.end = Math.max(l.end, index)
        }
    }

    passes.forEach((pass, index) => {
        // Inputs are read at this index
        if (pass.inputs) {
            Object.values(pass.inputs).forEach(tex => touch(tex, index))
        }
        // Outputs are written at this index
        if (pass.outputs) {
            Object.values(pass.outputs).forEach(tex => touch(tex, index))
        }
    })

    return lifetime
}

/**
 * Allocates physical texture slots to virtual textures based on liveness.
 * Implements a simple Linear Scan Register Allocation algorithm.
 * @param {Array} passes
 * @returns {Map} Map<virtualId, physicalId>
 */
export function allocateResources(passes) {
    const lifetime = analyzeLiveness(passes)
    const allocations = new Map()
    // freeList: Array of { id: string, availableAfter: number }
    const freeList = []
    let physicalCount = 0

    // We iterate through passes to simulate the timeline
    for (let i = 0; i < passes.length; i++) {
        const pass = passes[i]

        // 1. Allocate Outputs (Definitions)
        if (pass.outputs) {
            Object.values(pass.outputs).forEach(texId => {
                if (texId.startsWith('global_')) return // Globals are pre-allocated
                if (allocations.has(texId)) return

                // Try to find a free slot
                // A slot is free if it was released in a strictly previous pass (availableAfter < i)
                // Because we are currently AT step i, we can reuse anything that finished BEFORE i.
                const freeIdx = freeList.findIndex(item => item.availableAfter < i)

                if (freeIdx !== -1) {
                    // Reuse
                    const item = freeList.splice(freeIdx, 1)[0]
                    allocations.set(texId, item.id)
                } else {
                    // Allocate new
                    const id = `phys_${physicalCount++}`
                    allocations.set(texId, id)
                }
            })
        }

        // 2. Release Inputs (Last Uses)
        if (pass.inputs) {
            Object.values(pass.inputs).forEach(texId => {
                if (texId.startsWith('global_')) return

                const l = lifetime.get(texId)
                // If this pass is the END of the texture's life, release it.
                if (l && l.end === i) {
                    const physId = allocations.get(texId)
                    if (physId) {
                        // It becomes available AFTER this pass is done.
                        freeList.push({ id: physId, availableAfter: i })
                    }
                }
            })
        }
    }

    return allocations
}
