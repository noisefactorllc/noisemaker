// WGSL version – WebGPU
// Pack uniforms into a struct to stay within WebGPU's 12 uniform buffer limit
struct Uniforms {
    // Slot 0: resolution.xy, time, operation
    // Slot 1: scale, offsetX, offsetY, mask
    // Slot 2: seed, colorMode, speed, rotation
    // Slot 3: colorOffset
    data: array<vec4<f32>, 4>,
};

const PI: f32 = 3.14159265358979;

// Branchless HSV to RGB conversion
fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
    let p = abs(fract(c.xxx + vec3<f32>(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3<f32>(1.0), clamp(p - 1.0, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(c.y));
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Perform the selected bitwise/arithmetic operation on two integers,
// mask the result, then normalize to 0..1
fn bitOp(a: i32, b: i32, op: i32, m: i32) -> f32 {
    var r: i32 = 0;
    if (op == 0)      { r = a ^ b; }        // xor
    else if (op == 1) { r = a & b; }        // and
    else if (op == 2) { r = a | b; }        // or
    else if (op == 3) { r = ~(a & b); }     // nand
    else if (op == 4) { r = ~(a ^ b); }     // xnor
    else if (op == 5) { r = a * b; }        // mul
    else if (op == 6) { r = a + b; }        // add
    else              { r = a - b; }        // sub
    r = r & m;
    return f32(r) / f32(m);
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    // Unpack uniforms
    let resolution = uniforms.data[0].xy;
    let time = uniforms.data[0].z;
    let operation = i32(uniforms.data[0].w);
    let scale = uniforms.data[1].x;
    let offsetX = i32(uniforms.data[1].y);
    let offsetY = i32(uniforms.data[1].z);
    let mask = i32(uniforms.data[1].w);
    let seed = i32(uniforms.data[2].x);
    let colorMode = i32(uniforms.data[2].y);
    let speed = i32(uniforms.data[2].z);
    let rotation = uniforms.data[2].w;
    let colorOffset = i32(uniforms.data[3].x);

    // Map scale so higher value = bigger cells (lower frequency)
    let pixelScale = scale * 0.1;

    // Apply rotation around screen center
    let angle = rotation * PI / 180.0;
    let c = cos(angle);
    let s = sin(angle);
    let centered = position.xy - resolution * 0.5;
    let rotated = vec2<f32>(centered.x * c - centered.y * s, centered.x * s + centered.y * c);
    let coord = rotated + resolution * 0.5;

    // Time offset — uses 256 (pattern period) so it loops seamlessly at any speed
    let animOffset = i32(floor(time * f32(-speed) * 256.0));

    // Compute integer coordinates
    var x = i32(floor(coord.x / pixelScale)) + offsetX + animOffset;
    var y = i32(floor(coord.y / pixelScale)) + offsetY;

    // Seed XORs into coordinates (dramatic pattern shifts)
    x = x ^ seed;
    y = y ^ (seed * 3);

    if (colorMode == 0) {
        // Mono: same operation across all channels
        let v = bitOp(x, y, operation, mask);
        return vec4<f32>(v, v, v, 1.0);
    } else if (colorMode == 1) {
        // RGB: channel-shifted patterns (chromatic aberration)
        let r = bitOp(x, y, operation, mask);
        let g = bitOp(x + colorOffset, y, operation, mask);
        let b = bitOp(x, y + colorOffset, operation, mask);
        return vec4<f32>(r, g, b, 1.0);
    } else {
        // HSV: bitwise value drives hue, full saturation and value
        // Scale hue to avoid wrapping both ends to red
        let v = bitOp(x, y, operation, mask);
        let hueScale = f32(mask) / f32(mask + 1);
        return vec4<f32>(hsv2rgb(vec3<f32>(v * hueScale, 1.0, 1.0)), 1.0);
    }
}
