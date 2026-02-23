@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> scale : f32;
@group(0) @binding(4) var<uniform> edgeWidth : f32;
@group(0) @binding(5) var<uniform> seed : i32;
@group(0) @binding(6) var<uniform> invert : i32;

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
    var p = st * scale;
    p.x = p.x * aspect;

    let cellCoord = floor(p);
    let cellFract = fract(p);

    // Find nearest and second-nearest cell centers
    var d1: f32 = 1e10;
    var d2: f32 = 1e10;
    var nearestHash: f32 = 0.0;

    for (var y: i32 = -1; y <= 1; y = y + 1) {
        for (var x: i32 = -1; x <= 1; x = x + 1) {
            let neighbor = vec2<f32>(f32(x), f32(y));
            let cellId = cellCoord + neighbor;
            let rnd = prng(vec3<f32>(cellId, f32(seed)));
            let point = neighbor + rnd.xy - cellFract;
            let dist = dot(point, point);

            if (dist < d1) {
                d2 = d1;
                d1 = dist;
                nearestHash = rnd.z;
            } else if (dist < d2) {
                d2 = dist;
            }
        }
    }

    // Use cell hash to assign A or B (threshold at 0.5)
    var cellChoice = step(0.5, nearestHash);

    // Apply invert
    if (invert == 1) {
        cellChoice = 1.0 - cellChoice;
    }

    // Sharp edge line at cell boundaries
    let edgeDist = sqrt(d2) - sqrt(d1);
    var onEdge: f32;
    if (edgeWidth > 0.0) {
        onEdge = step(edgeDist, edgeWidth);
    } else {
        onEdge = 0.0;
    }

    // cellChoice selects A or B; edge pixels show 50/50 mix
    let mask = mix(cellChoice, 0.5, onEdge);
    var color = mix(colorA, colorB, mask);
    color.a = max(colorA.a, colorB.a);

    return color;
}
