@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> mode : i32;
@group(0) @binding(4) var<uniform> scale : f32;
@group(0) @binding(5) var<uniform> edgeWidth : f32;
@group(0) @binding(6) var<uniform> seed : i32;
@group(0) @binding(7) var<uniform> invert : i32;
@group(0) @binding(8) var<uniform> time : f32;
@group(0) @binding(9) var<uniform> speed : f32;

const TAU: f32 = 6.28318530718;

// PCG PRNG - MIT License
// https://github.com/riccardoscalco/glsl-pcg-prng
fn pcg(seed: vec3<u32>) -> vec3<u32> {
    var v = seed * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

fn prng(p0: vec3<f32>) -> vec3<f32> {
    var p = p0;
    if (p.x >= 0.0) { p.x = p.x * 2.0; } else { p.x = -p.x * 2.0 + 1.0; }
    if (p.y >= 0.0) { p.y = p.y * 2.0; } else { p.y = -p.y * 2.0 + 1.0; }
    if (p.z >= 0.0) { p.z = p.z * 2.0; } else { p.z = -p.z * 2.0 + 1.0; }
    let u = pcg(vec3<u32>(p));
    return vec3<f32>(u) / f32(0xffffffffu);
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let st = position.xy / dims;

    let colorA = textureSample(inputTex, samp, st);
    let colorB = textureSample(tex, samp, st);

    // Aspect-correct, scaled coordinates
    let aspect = dims.x / dims.y;
    var p = st * (31.0 - scale);
    p.x = p.x * aspect;

    let spd = floor(speed);
    let cellCoord = floor(p);
    let cellFract = fract(p);

    // Pass 1: find nearest cell center
    var d1: f32 = 1e10;
    var nearestPoint: vec2<f32> = vec2<f32>(0.0);
    var nearestCell: vec2<f32> = vec2<f32>(0.0);
    var nearestHash: f32 = 0.0;

    for (var y: i32 = -1; y <= 1; y = y + 1) {
        for (var x: i32 = -1; x <= 1; x = x + 1) {
            let neighbor = vec2<f32>(f32(x), f32(y));
            let cellId = cellCoord + neighbor;
            let rnd = prng(vec3<f32>(cellId, f32(seed)));
            let wobble = sin(TAU * time * spd + rnd.xy * TAU) * 0.15 * min(spd, 1.0);
            let point = neighbor + rnd.xy + wobble - cellFract;
            let dist = dot(point, point);

            if (dist < d1) {
                d1 = dist;
                nearestPoint = point;
                nearestCell = cellId;
                nearestHash = rnd.z;
            }
        }
    }

    // Pass 2: find minimum perpendicular distance to any Voronoi edge
    // (bisector between nearest center and each neighbor center)
    var edgeDistVal: f32 = 1e10;
    for (var y: i32 = -2; y <= 2; y = y + 1) {
        for (var x: i32 = -2; x <= 2; x = x + 1) {
            let neighbor = vec2<f32>(f32(x), f32(y));
            let cellId = cellCoord + neighbor;
            if (all(cellId == nearestCell)) { continue; }
            let rnd = prng(vec3<f32>(cellId, f32(seed)));
            let wobble = sin(TAU * time * spd + rnd.xy * TAU) * 0.15 * min(spd, 1.0);
            let point = neighbor + rnd.xy + wobble - cellFract;
            // Perpendicular distance to bisector between nearest and this neighbor
            let mid = (nearestPoint + point) * 0.5;
            let edge = normalize(point - nearestPoint);
            let d = abs(dot(mid, edge));
            edgeDistVal = min(edgeDistVal, d);
        }
    }

    var onEdge: f32;
    if (edgeWidth > 0.0) {
        onEdge = step(edgeDistVal, edgeWidth);
    } else {
        onEdge = 0.0;
    }

    var mask: f32;
    if (mode == 0) {
        // Edges mode: cells show A, edges show B
        mask = onEdge;
    } else {
        // Split mode: cells randomly assigned to A or B, edges show 50/50
        var cellChoice = step(0.5, nearestHash);
        if (invert == 1) {
            cellChoice = 1.0 - cellChoice;
        }
        mask = mix(cellChoice, 0.5, onEdge);
    }

    // Apply invert (in edges mode, swaps cells/edges assignment)
    if (mode == 0 && invert == 1) {
        mask = 1.0 - mask;
    }

    var color = mix(colorA, colorB, mask);
    color.a = max(colorA.a, colorB.a);

    return color;
}
