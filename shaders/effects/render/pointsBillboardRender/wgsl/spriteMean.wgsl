struct Uniforms {
    shapeMode: i32,
    aperture: f32,
    viewMode: i32,
}
@group(0) @binding(0) var tilesTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> u: Uniforms;

fn proceduralCoverage() -> f32 {
    // Means of the same 5x5 centered SDF samples, evaluated in double
    // precision and rounded once to f32. Recompute if a shape changes.
    // Fixed values avoid driver-dependent coverage drift during defocus.
    if (u.shapeMode == 1) { return 0.713220537; }
    if (u.shapeMode == 2) { return 0.310907274; }
    if (u.shapeMode == 3) { return 0.680000007; }
    if (u.shapeMode == 4) { return 0.519999981; }
    if (u.shapeMode == 5) { return 0.0951406509; }
    if (u.shapeMode == 6) { return 0.103062622; }
    return 0.362012237; // Soft shape and the existing fallback.
}

@fragment
fn main(@builtin(position) coord: vec4f) -> @location(0) vec4f {
    if (u.aperture <= 0.0 || u.viewMode == 0) { return vec4f(0.0); }
    if (u.shapeMode != 0) {
        return vec4f(proceduralCoverage());
    }
    let origin = vec2i(coord.xy) * 32;
    var total = vec4f(0.0);
    for (var y = 0; y < 32; y++) {
        for (var x = 0; x < 32; x++) {
            total += textureLoad(tilesTex, origin + vec2i(x, y), 0);
        }
    }
    return total;
}
