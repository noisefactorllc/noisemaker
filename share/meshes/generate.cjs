#!/usr/bin/env node
// Generate procedural mesh OBJ files
const fs = require('fs')
const path = require('path')

const PI = Math.PI
const TAU = 2 * PI

function toOBJ(vertices, normals, faces) {
    let lines = ['# Generated procedural mesh']
    for (const v of vertices) lines.push(`v ${v[0].toFixed(6)} ${v[1].toFixed(6)} ${v[2].toFixed(6)}`)
    for (const n of normals) lines.push(`vn ${n[0].toFixed(6)} ${n[1].toFixed(6)} ${n[2].toFixed(6)}`)
    for (const f of faces) {
        const parts = f.map(([vi, ni]) => `${vi + 1}//${ni + 1}`)
        lines.push(`f ${parts.join(' ')}`)
    }
    return lines.join('\n') + '\n'
}

function normalize(v) {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0]
}

// ========== CUBE ==========
function generateCube() {
    const s = 0.5
    const vertices = [
        [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
        [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]
    ]
    const normals = [
        [0, 0, -1], [0, 0, 1], [-1, 0, 0],
        [1, 0, 0], [0, -1, 0], [0, 1, 0]
    ]
    // Each face: two triangles, all vertices get the face normal
    const faces = [
        // front (-Z)
        [[0, 0], [2, 0], [1, 0]], [[0, 0], [3, 0], [2, 0]],
        // back (+Z)
        [[4, 1], [5, 1], [6, 1]], [[4, 1], [6, 1], [7, 1]],
        // left (-X)
        [[0, 2], [4, 2], [7, 2]], [[0, 2], [7, 2], [3, 2]],
        // right (+X)
        [[1, 3], [2, 3], [6, 3]], [[1, 3], [6, 3], [5, 3]],
        // bottom (-Y)
        [[0, 4], [1, 4], [5, 4]], [[0, 4], [5, 4], [4, 4]],
        // top (+Y)
        [[3, 5], [7, 5], [6, 5]], [[3, 5], [6, 5], [2, 5]]
    ]
    return toOBJ(vertices, normals, faces)
}

// ========== UV SPHERE ==========
function generateSphere(segments = 32, rings = 16) {
    const vertices = []
    const normals = []
    const faces = []

    for (let r = 0; r <= rings; r++) {
        const phi = PI * r / rings
        for (let s = 0; s <= segments; s++) {
            const theta = TAU * s / segments
            const x = Math.sin(phi) * Math.cos(theta)
            const y = Math.cos(phi)
            const z = Math.sin(phi) * Math.sin(theta)
            vertices.push([x * 0.5, y * 0.5, z * 0.5])
            normals.push([x, y, z])
        }
    }

    for (let r = 0; r < rings; r++) {
        for (let s = 0; s < segments; s++) {
            const a = r * (segments + 1) + s
            const b = a + segments + 1
            if (r > 0) faces.push([[a, a], [b, b], [a + 1, a + 1]])
            if (r < rings - 1) faces.push([[a + 1, a + 1], [b, b], [b + 1, b + 1]])
        }
    }
    return toOBJ(vertices, normals, faces)
}

// ========== TORUS ==========
function generateTorus(majorR = 0.35, minorR = 0.15, majorSeg = 32, minorSeg = 16) {
    const vertices = []
    const normals = []
    const faces = []

    for (let i = 0; i <= majorSeg; i++) {
        const theta = TAU * i / majorSeg
        const ct = Math.cos(theta), st = Math.sin(theta)
        for (let j = 0; j <= minorSeg; j++) {
            const phi = TAU * j / minorSeg
            const cp = Math.cos(phi), sp = Math.sin(phi)
            const x = (majorR + minorR * cp) * ct
            const y = (majorR + minorR * cp) * st
            const z = minorR * sp
            vertices.push([x, y, z])
            normals.push(normalize([cp * ct, cp * st, sp]))
        }
    }

    for (let i = 0; i < majorSeg; i++) {
        for (let j = 0; j < minorSeg; j++) {
            const a = i * (minorSeg + 1) + j
            const b = a + minorSeg + 1
            faces.push([[a, a], [a + 1, a + 1], [b, b]])
            faces.push([[a + 1, a + 1], [b + 1, b + 1], [b, b]])
        }
    }
    return toOBJ(vertices, normals, faces)
}

// ========== CYLINDER ==========
function generateCylinder(segments = 32, h = 1.0, r = 0.4) {
    const vertices = []
    const normals = []
    const faces = []
    const halfH = h / 2

    // Side vertices and normals
    for (let i = 0; i <= segments; i++) {
        const theta = TAU * i / segments
        const x = Math.cos(theta) * r
        const z = Math.sin(theta) * r
        const nx = Math.cos(theta), nz = Math.sin(theta)
        // Bottom ring
        vertices.push([x, -halfH, z])
        normals.push([nx, 0, nz])
        // Top ring
        vertices.push([x, halfH, z])
        normals.push([nx, 0, nz])
    }

    // Side faces
    for (let i = 0; i < segments; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3
        faces.push([[a, a], [c, c], [b, b]])
        faces.push([[b, b], [c, c], [d, d]])
    }

    // Cap centers
    const botCenter = vertices.length
    vertices.push([0, -halfH, 0])
    normals.push([0, -1, 0])
    const topCenter = vertices.length
    vertices.push([0, halfH, 0])
    normals.push([0, 1, 0])

    // Cap vertices (need separate normals pointing up/down)
    const botStart = vertices.length
    for (let i = 0; i <= segments; i++) {
        const theta = TAU * i / segments
        vertices.push([Math.cos(theta) * r, -halfH, Math.sin(theta) * r])
        normals.push([0, -1, 0])
    }
    const topStart = vertices.length
    for (let i = 0; i <= segments; i++) {
        const theta = TAU * i / segments
        vertices.push([Math.cos(theta) * r, halfH, Math.sin(theta) * r])
        normals.push([0, 1, 0])
    }

    // Cap faces
    for (let i = 0; i < segments; i++) {
        faces.push([[botCenter, botCenter], [botStart + i + 1, botStart + i + 1], [botStart + i, botStart + i]])
        faces.push([[topCenter, topCenter], [topStart + i, topStart + i], [topStart + i + 1, topStart + i + 1]])
    }

    return toOBJ(vertices, normals, faces)
}

// ========== CONE ==========
function generateCone(segments = 32, h = 1.0, r = 0.4) {
    const vertices = []
    const normals = []
    const faces = []
    const halfH = h / 2
    const slopeLen = Math.sqrt(r * r + h * h)
    const ny = r / slopeLen
    const nr = h / slopeLen

    // Tip vertex (one per side segment for proper normals)
    const tipStart = vertices.length
    for (let i = 0; i <= segments; i++) {
        const theta = TAU * (i + 0.5) / segments
        vertices.push([0, halfH, 0])
        normals.push(normalize([Math.cos(theta) * nr, ny, Math.sin(theta) * nr]))
    }

    // Base ring (side normals)
    const baseStart = vertices.length
    for (let i = 0; i <= segments; i++) {
        const theta = TAU * i / segments
        const x = Math.cos(theta) * r
        const z = Math.sin(theta) * r
        vertices.push([x, -halfH, z])
        normals.push(normalize([Math.cos(theta) * nr, ny, Math.sin(theta) * nr]))
    }

    // Side faces
    for (let i = 0; i < segments; i++) {
        faces.push([[tipStart + i, tipStart + i], [baseStart + i, baseStart + i], [baseStart + i + 1, baseStart + i + 1]])
    }

    // Base cap
    const capCenter = vertices.length
    vertices.push([0, -halfH, 0])
    normals.push([0, -1, 0])
    const capStart = vertices.length
    for (let i = 0; i <= segments; i++) {
        const theta = TAU * i / segments
        vertices.push([Math.cos(theta) * r, -halfH, Math.sin(theta) * r])
        normals.push([0, -1, 0])
    }
    for (let i = 0; i < segments; i++) {
        faces.push([[capCenter, capCenter], [capStart + i + 1, capStart + i + 1], [capStart + i, capStart + i]])
    }

    return toOBJ(vertices, normals, faces)
}

// ========== CAPSULE ==========
function generateCapsule(segments = 32, rings = 8, h = 0.3, r = 0.25) {
    const vertices = []
    const normals = []
    const faces = []

    // Top hemisphere: phi from 0 (pole) to PI/2 (equator)
    for (let ring = 0; ring <= rings; ring++) {
        const phi = PI * 0.5 * ring / rings
        for (let s = 0; s <= segments; s++) {
            const theta = TAU * s / segments
            const x = Math.sin(phi) * Math.cos(theta)
            const y = Math.cos(phi)
            const z = Math.sin(phi) * Math.sin(theta)
            vertices.push([x * r, y * r + h, z * r])
            normals.push([x, y, z])
        }
    }

    // Bottom hemisphere: phi from PI/2 (equator) to PI (pole)
    // Start at ring=1 to avoid duplicating the equator row
    for (let ring = 1; ring <= rings; ring++) {
        const phi = PI * 0.5 + PI * 0.5 * ring / rings
        for (let s = 0; s <= segments; s++) {
            const theta = TAU * s / segments
            const x = Math.sin(phi) * Math.cos(theta)
            const y = Math.cos(phi)
            const z = Math.sin(phi) * Math.sin(theta)
            vertices.push([x * r, y * r - h, z * r])
            normals.push([x, y, z])
        }
    }

    // Total vertex rows: (rings+1) top + rings bottom = 2*rings+1
    const totalVertexRows = 2 * rings + 1
    const stride = segments + 1
    const totalFaceRows = totalVertexRows - 1

    for (let row = 0; row < totalFaceRows; row++) {
        for (let s = 0; s < segments; s++) {
            const a = row * stride + s
            const b = a + stride
            // Skip degenerate triangles at top pole (row 0) and bottom pole (last row)
            if (row > 0) faces.push([[a, a], [b, b], [a + 1, a + 1]])
            if (row < totalFaceRows - 1) faces.push([[a + 1, a + 1], [b, b], [b + 1, b + 1]])
        }
    }

    return toOBJ(vertices, normals, faces)
}

// ========== ICOSPHERE ==========
function generateIcosphere(subdivisions = 2) {
    const t = (1 + Math.sqrt(5)) / 2

    let verts = [
        [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
        [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
        [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ].map(v => normalize(v))

    let tris = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ]

    const midpointCache = {}
    function getMidpoint(a, b) {
        const key = Math.min(a, b) + '_' + Math.max(a, b)
        if (midpointCache[key] !== undefined) return midpointCache[key]
        const mid = normalize([
            (verts[a][0] + verts[b][0]) / 2,
            (verts[a][1] + verts[b][1]) / 2,
            (verts[a][2] + verts[b][2]) / 2
        ])
        const idx = verts.length
        verts.push(mid)
        midpointCache[key] = idx
        return idx
    }

    for (let s = 0; s < subdivisions; s++) {
        const newTris = []
        for (const [a, b, c] of tris) {
            const ab = getMidpoint(a, b)
            const bc = getMidpoint(b, c)
            const ca = getMidpoint(c, a)
            newTris.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
        }
        tris = newTris
    }

    // Scale to radius 0.5
    const vertices = verts.map(v => [v[0] * 0.5, v[1] * 0.5, v[2] * 0.5])
    const normals = verts // already normalized unit vectors
    const faces = tris.map(([a, b, c]) => [[a, a], [b, b], [c, c]])

    return toOBJ(vertices, normals, faces)
}

// Generate all meshes
const meshes = {
    cube: generateCube(),
    sphere: generateSphere(32, 16),
    torus: generateTorus(),
    cylinder: generateCylinder(),
    cone: generateCone(),
    capsule: generateCapsule(),
    icosphere: generateIcosphere(2)
}

const dir = path.dirname(__filename)
for (const [name, obj] of Object.entries(meshes)) {
    const filepath = path.join(dir, `${name}.obj`)
    fs.writeFileSync(filepath, obj)
    const vCount = (obj.match(/^v /gm) || []).length
    const fCount = (obj.match(/^f /gm) || []).length
    console.log(`${name}.obj: ${vCount} vertices, ${fCount} faces`)
}
