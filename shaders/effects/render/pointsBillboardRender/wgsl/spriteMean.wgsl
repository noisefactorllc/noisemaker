struct Uniforms {
    shapeMode: i32,
    aperture: f32,
    viewMode: i32,
}
@group(0) @binding(0) var tilesTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> u: Uniforms;

fn shapeCoverage(uv: vec2f) -> f32 {
    // Procedural SDF shapes
    let p = uv - 0.5;
    var sdf: f32;
    var alpha: f32;

    if (u.shapeMode == 1) {
        // Circle
        sdf = length(p) - 0.45;
    } else if (u.shapeMode == 2) {
        // Ring
        sdf = abs(length(p) - 0.35) - 0.08;
    } else if (u.shapeMode == 3) {
        // Square
        sdf = max(abs(p.x), abs(p.y)) - 0.4;
    } else if (u.shapeMode == 4) {
        // Diamond
        sdf = abs(p.x) + abs(p.y) - 0.45;
    } else if (u.shapeMode == 5) {
        // Equilateral triangle (Inigo Quilez SDF)
        let r = 0.25;
        let k = 1.732050808; // sqrt(3)
        var t = vec2<f32>(abs(p.x) - r, p.y - 0.04 + r / k);
        if (t.x + k * t.y > 0.0) { t = vec2<f32>(t.x - k * t.y, -k * t.x - t.y) / 2.0; }
        t.x -= clamp(t.x, -2.0 * r, 0.0);
        sdf = -length(t) * sign(t.y);
    } else if (u.shapeMode == 6) {
        // 5-point star (Inigo Quilez SDF — straight edges)
        let r = 0.35;
        let rf = 0.4;
        let k1 = vec2<f32>(0.809016994375, -0.587785252292);
        let k2 = vec2<f32>(-k1.x, k1.y);
        var s = vec2<f32>(abs(p.x), p.y);
        s -= 2.0 * max(dot(k1, s), 0.0) * k1;
        s -= 2.0 * max(dot(k2, s), 0.0) * k2;
        s.x = abs(s.x);
        s.y -= r;
        let ba = rf * vec2<f32>(-k1.y, k1.x) - vec2<f32>(0.0, 1.0);
        let h = clamp(dot(s, ba) / dot(ba, ba), 0.0, r);
        sdf = length(s - ba * h) * sign(s.y * ba.x - s.x * ba.y);
    } else {
        // Soft (7) — gaussian falloff
        alpha = exp(-dot(p, p) * 8.0);
        return alpha;
    }

    alpha = 1.0 - smoothstep(-0.02, 0.02, sdf);
    return alpha;
}

@fragment
fn main(@builtin(position) coord: vec4f) -> @location(0) vec4f {
    if (u.aperture <= 0.0 || u.viewMode == 0) { return vec4f(0.0); }
    if (u.shapeMode != 0) {
        // Integrate once per frame, rather than once per fragment.
        var coverage = 0.0;
        for (var y = 0; y < 5; y++) {
            for (var x = 0; x < 5; x++) {
                coverage += shapeCoverage((vec2f(f32(x), f32(y)) + 0.5) / 5.0);
            }
        }
        return vec4f(coverage / 25.0);
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
