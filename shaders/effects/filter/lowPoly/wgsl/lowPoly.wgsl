/*
 * Low Poly - Voronoi-based low-polygon art style
 * Generates deterministic seed points, finds nearest Voronoi cell,
 * fills with input color at seed position, blends with distance for edges.
 */

struct Uniforms {
    freq: f32,
    seed: f32,
    nth: f32,
    alpha: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// Hash function for deterministic pseudo-random seed points
fn hash2(p: vec2<f32>, s: f32) -> vec2<f32> {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * vec3<f32>(0.1031, 0.1030, 0.0973) + s * 0.1);
    p3 = p3 + dot(p3, vec3<f32>(p3.y, p3.z, p3.x) + 33.33);
    return fract((vec2<f32>(p3.x, p3.x) + vec2<f32>(p3.y, p3.z)) * vec2<f32>(p3.z, p3.y));
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;

    let n = max(102.0 - uniforms.freq, 2.0);
    let s = uniforms.seed;

    // Scale UV to grid
    let scaled = uv * n;
    let cell = vec2<i32>(floor(scaled));

    var minDist: f32 = 1e10;
    var secondDist: f32 = 1e10;
    var thirdDist: f32 = 1e10;
    var nearestPoint = vec2<f32>(0.0);

    // Search 3x3 neighborhood of cells
    for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
        for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
            let neighbor = cell + vec2<i32>(dx, dy);
            let neighborF = vec2<f32>(neighbor);

            // Generate seed point in this cell
            let offset = hash2(neighborF, s);
            let point = (neighborF + offset) / n;

            let d = distance(uv, point);

            if (d < minDist) {
                thirdDist = secondDist;
                secondDist = minDist;
                minDist = d;
                nearestPoint = point;
            } else if (d < secondDist) {
                thirdDist = secondDist;
                secondDist = d;
            } else if (d < thirdDist) {
                thirdDist = d;
            }
        }
    }

    // Sample input color at the nearest seed point
    let cellColor = textureSample(inputTex, inputSampler, nearestPoint);

    var result: vec3<f32>;
    if (uniforms.nth < 0.5) {
        // nth=0: flat cell color with subtle edge darkening
        let edgeDist = clamp((secondDist - minDist) * n * 2.0, 0.0, 1.0);
        result = cellColor.rgb * (0.85 + 0.15 * edgeDist);
    } else {
        // nth=1,2: blend distance field with cell color (matches Python lowpoly)
        var selectedDist: f32;
        if (uniforms.nth < 1.5) { selectedDist = secondDist; }
        else { selectedDist = thirdDist; }
        let distField = sqrt(clamp(selectedDist * n, 0.0, 1.0));
        result = mix(vec3<f32>(distField), cellColor.rgb, 0.5);
    }

    // Alpha blend with original
    let original = textureSample(inputTex, inputSampler, uv);
    return vec4<f32>(mix(original.rgb, result, uniforms.alpha), original.a);
}
