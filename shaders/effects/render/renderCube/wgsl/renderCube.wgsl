/*
 * Cubemap volume renderer (WGSL) — renderCube
 *
 * Renders a 3D volume (inputTex3d) into a 2D output using a center-camera
 * 90-degree mat3 frustum projection (cubeBasis). Two compositing modes:
 *   cubeMode 0 = isosurface (SDF raymarching with bisection refinement)
 *   cubeMode 1 = volumetric (front-to-back emission/absorption, nebula look)
 *
 * The volume is sampled from the red channel (.r) for the density/SDF field.
 * RGB channels are used for coloring.
 *
 * INVERT is a compile-time define injected by the expander (see definition.js).
 */

// INVERT is a compile-time const; the optimizer drops the dead branch.
@group(0) @binding(0) var<uniform> resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> threshold: f32;
@group(0) @binding(2) var<uniform> volumeSize: i32;
@group(0) @binding(3) var<uniform> bgColor: vec3<f32>;
@group(0) @binding(4) var<uniform> bgAlpha: f32;
@group(0) @binding(5) var volumeCache: texture_2d<f32>;
@group(0) @binding(6) var<uniform> tileOffset: vec2<f32>;
@group(0) @binding(7) var<uniform> fullResolution: vec2<f32>;
@group(0) @binding(8) var<uniform> cubeBasis: mat3x3<f32>;
@group(0) @binding(9) var<uniform> cubeMode: i32;
@group(0) @binding(10) var<uniform> density: f32;
@group(0) @binding(11) var<uniform> absorption: f32;
@group(0) @binding(12) var<uniform> emission: f32;

const TAU: f32 = 6.283185307179586;
const PI: f32 = 3.141592653589793;
const MAX_STEPS: i32 = 256;
const MAX_DIST: f32 = 10.0;

// MRT output structure for color and geometry buffer
struct FragmentOutput {
    @location(0) color: vec4<f32>,
    @location(1) geoOut: vec4<f32>,
}

// Convert 3D volume coordinates to 2D atlas texel coordinates
fn volumeToAtlas(x: i32, y: i32, z: i32, volSize: i32) -> vec2<i32> {
    return vec2<i32>(x, y + z * volSize);
}

// Sample the cached 3D volume with trilinear interpolation
// World position p is in [-1, 1]^3 (bounding box coordinates)
fn sampleVolume(worldPos: vec3<f32>) -> vec4<f32> {
    let volSize = volumeSize;
    let volSizeF = f32(volSize);

    // Convert world position [-1, 1] to normalized volume coords [0, 1]
    var uvw = worldPos * 0.5 + 0.5;
    uvw = clamp(uvw, vec3<f32>(0.0), vec3<f32>(1.0));

    // Convert to texel coordinates
    let texelPos = uvw * (volSizeF - 1.0);
    let texelFloor = floor(texelPos);
    let frac = texelPos - texelFloor;

    let i0 = vec3<i32>(texelFloor);
    let i1 = min(i0 + 1, vec3<i32>(volSize - 1));

    // Trilinear filtering - load 8 corners
    let c000 = textureLoad(volumeCache, volumeToAtlas(i0.x, i0.y, i0.z, volSize), 0);
    let c100 = textureLoad(volumeCache, volumeToAtlas(i1.x, i0.y, i0.z, volSize), 0);
    let c010 = textureLoad(volumeCache, volumeToAtlas(i0.x, i1.y, i0.z, volSize), 0);
    let c110 = textureLoad(volumeCache, volumeToAtlas(i1.x, i1.y, i0.z, volSize), 0);
    let c001 = textureLoad(volumeCache, volumeToAtlas(i0.x, i0.y, i1.z, volSize), 0);
    let c101 = textureLoad(volumeCache, volumeToAtlas(i1.x, i0.y, i1.z, volSize), 0);
    let c011 = textureLoad(volumeCache, volumeToAtlas(i0.x, i1.y, i1.z, volSize), 0);
    let c111 = textureLoad(volumeCache, volumeToAtlas(i1.x, i1.y, i1.z, volSize), 0);

    // Trilinear interpolation
    let c00 = mix(c000, c100, frac.x);
    let c10 = mix(c010, c110, frac.x);
    let c01 = mix(c001, c101, frac.x);
    let c11 = mix(c011, c111, frac.x);

    let c0 = mix(c00, c10, frac.y);
    let c1 = mix(c01, c11, frac.y);

    return mix(c0, c1, frac.z);
}

// Get the scalar field value at a point (what we're finding the isosurface of)
// Convention: HIGH values = SOLID, field < 0 = inside solid
fn getField(p: vec3<f32>) -> f32 {
    var val = sampleVolume(p).r;
    // INVERT is a compile-time const; the optimizer drops the dead branch.
    if (INVERT) {
        val = 1.0 - val;
    }
    return threshold - val;
}

// Ray-box intersection against [-1,1]^3. Returns vec2(tEnter, tExit).
// tb.y < 0 or tb.x > tb.y means no intersection.
fn intersectBox(ro: vec3<f32>, rd: vec3<f32>) -> vec2<f32> {
    let invRd = 1.0 / rd;
    let t0 = (-1.0 - ro) * invRd;
    let t1 = (1.0 - ro) * invRd;
    let tmin = min(t0, t1);
    let tmax = max(t0, t1);
    let tEnter = max(max(tmin.x, tmin.y), tmin.z);
    let tExit = min(min(tmax.x, tmax.y), tmax.z);
    if (tEnter > tExit || tExit < 0.0) {
        return vec2<f32>(-1.0);
    }
    return vec2<f32>(tEnter, tExit);
}

// Compute smooth normal using central differences on the SDF field
fn calcNormal(p: vec3<f32>) -> vec3<f32> {
    let eps = 2.0 / f32(volumeSize);

    let dx = getField(p + vec3<f32>(eps, 0.0, 0.0)) - getField(p - vec3<f32>(eps, 0.0, 0.0));
    let dy = getField(p + vec3<f32>(0.0, eps, 0.0)) - getField(p - vec3<f32>(0.0, eps, 0.0));
    let dz = getField(p + vec3<f32>(0.0, 0.0, eps)) - getField(p - vec3<f32>(0.0, 0.0, eps));

    var n = vec3<f32>(dx, dy, dz);

    let len = length(n);
    if (len < 0.0001) { return vec3<f32>(0.0, 1.0, 0.0); }

    return n / len;
}

// Isosurface hit result
struct IsoHit {
    dist: f32,
    pos: vec3<f32>,
    hit: bool,
}

// Analytic isosurface raymarching with bisection refinement
fn isosurfaceTrace(ro: vec3<f32>, rd: vec3<f32>) -> IsoHit {
    var result: IsoHit;
    result.hit = false;
    result.dist = -1.0;
    result.pos = vec3<f32>(0.0);

    let tb = intersectBox(ro, rd);
    if (tb.y < 0.0 || tb.x > tb.y) { return result; }

    let tStart = max(tb.x, 0.0);
    let tExit = tb.y;
    let stepSize = 1.5 / f32(volumeSize);

    var t = tStart;
    var prevField = getField(ro + rd * t);

    // If we start inside solid (e.g., inverted volume), hit the bounding box surface
    if (prevField < 0.0) {
        result.hit = true;
        result.dist = tStart;
        result.pos = ro + rd * tStart;
        return result;
    }

    for (var i: i32 = 0; i < MAX_STEPS; i = i + 1) {
        t = t + stepSize;
        if (t > tExit) { break; }

        let p = ro + rd * t;
        let field = getField(p);

        if (prevField * field < 0.0) {
            var tLo = t - stepSize;
            var tHi = t;
            var pf = prevField;

            for (var j: i32 = 0; j < 8; j = j + 1) {
                let tMid = (tLo + tHi) * 0.5;
                let fMid = getField(ro + rd * tMid);

                if (pf * fMid < 0.0) {
                    tHi = tMid;
                } else {
                    tLo = tMid;
                    pf = fMid;
                }
            }

            result.hit = true;
            result.dist = (tLo + tHi) * 0.5;
            result.pos = ro + rd * result.dist;
            return result;
        }

        prevField = field;
    }

    return result;
}

// Shading for smooth isosurface
fn shade(p: vec3<f32>, rd: vec3<f32>) -> vec3<f32> {
    let n = calcNormal(p);
    let lightDir = normalize(vec3<f32>(1.0, 1.0, -1.0));

    let diff = max(dot(n, lightDir), 0.0);
    let amb: f32 = 0.15;

    let halfVec = normalize(lightDir - rd);
    let spec = pow(max(dot(n, halfVec), 0.0), 32.0);

    let rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

    // Use RGB from volume for coloring
    let volColor = sampleVolume(p);
    var baseColor = volColor.rgb;

    // If volume appears grayscale (R≈G≈B), use a neutral gray
    let colorVariance = length(volColor.rgb - vec3<f32>(volColor.r));
    if (colorVariance < 0.01) {
        baseColor = vec3<f32>(0.75);
    }

    return baseColor * (amb + diff * 0.7) + spec * 0.2 + rim * 0.15;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> FragmentOutput {
    // Square face: uv in [-1, 1], 90-degree frustum. Camera at the volume center.
    let res = select(resolution, fullResolution, fullResolution.x > 0.0);
    let uv = ((position.xy + tileOffset) - 0.5 * res) / (0.5 * res.y);
    let ro = vec3<f32>(0.0, 0.0, 0.0);
    let rd = normalize(cubeBasis * vec3<f32>(uv.x, -uv.y, 1.0));

    // Volumetric mode: front-to-back emission/absorption integration
    if (cubeMode == 1) {
        var col = vec3<f32>(0.0);
        var trans = 1.0;
        let tb = intersectBox(ro, rd);
        if (tb.y > 0.0) {
            let t0 = max(tb.x, 0.0);
            let dt = (tb.y - t0) / f32(MAX_STEPS);
            var t = t0;
            for (var i = 0; i < MAX_STEPS; i = i + 1) {
                let s = sampleVolume(ro + rd * t);
                let a = 1.0 - exp(-s.r * density * absorption * dt);
                col = col + trans * a * s.rgb * emission;
                trans = trans * (1.0 - a);
                if (trans < 0.01) { break; }
                t = t + dt;
            }
        }
        let outc = pow(col + bgColor * trans, vec3<f32>(1.0 / 2.2));
        var output: FragmentOutput;
        output.color = vec4<f32>(outc, 1.0 - trans + bgAlpha * trans);
        output.geoOut = vec4<f32>(0.5, 0.5, 0.5, 1.0);
        return output;
    }

    // Isosurface mode
    var color: vec3<f32>;
    var normal = vec3<f32>(0.0, 0.0, 1.0);
    var depth: f32 = 1.0;
    var alpha: f32 = 1.0;

    let hit = isosurfaceTrace(ro, rd);
    if (hit.hit) {
        color = shade(hit.pos, rd);
        normal = calcNormal(hit.pos);
        depth = hit.dist / MAX_DIST;
    } else {
        color = bgColor;
        alpha = bgAlpha;
    }

    color = pow(color, vec3<f32>(1.0 / 2.2));

    var output: FragmentOutput;
    output.color = vec4<f32>(color, alpha);
    output.geoOut = vec4<f32>(normal * 0.5 + 0.5, depth);
    return output;
}
