// Buddhabrot z-state writer
// Recomputes z from scratch to current step for storage

@group(0) @binding(1) var xyzTex: texture_2d<f32>;
@group(0) @binding(3) var velTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let coord = vec2<i32>(fragCoord.xy);
    let pos = textureLoad(xyzTex, coord, 0);
    let vel = textureLoad(velTex, coord, 0);

    // Dead agent
    if (pos.w < 0.5) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }

    let cRe = vel.x;
    let cIm = vel.y;
    let stepI = i32(vel.z);

    // Recompute z from scratch to current step
    var z = vec2<f32>(0.0, 0.0);

    for (var i: i32 = 0; i < 2048; i = i + 1) {
        if (i >= stepI) { break; }
        let zr = z.x * z.x - z.y * z.y + cRe;
        let zi = 2.0 * z.x * z.y + cIm;
        z = vec2<f32>(zr, zi);
    }

    return vec4<f32>(z.x, z.y, 0.0, 0.0);
}
