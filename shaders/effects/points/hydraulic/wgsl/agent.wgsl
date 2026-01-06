// Hflow agent pass - Common Agent Architecture middleware
// Reads from global_xyz/vel/rgba, applies gradient descent, writes back
// State format: xyz=[x, y, z, alive] vel=[vx, vy, vz, seed] rgba=[r, g, b, a]
// Positions in normalized coords [0,1], velocities in pixel-space

struct Uniforms {
    resolution: vec2f,
    time: f32,
    stride: f32,
    quantize: f32,
    inverse: f32,
    inputWeight: f32,
}

struct Outputs {
    @location(0) xyz: vec4f,
    @location(1) vel: vec4f,
    @location(2) rgba: vec4f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var xyzTex: texture_2d<f32>;
@group(0) @binding(4) var velTex: texture_2d<f32>;
@group(0) @binding(5) var rgbaTex: texture_2d<f32>;

// === ORIGINAL HFLOW HELPER FUNCTIONS (PRESERVED EXACTLY) ===

fn hash2(seed: u32) -> vec2f {
    var state = seed * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    let x_bits = (word >> 22u) ^ word;
    state = x_bits * 747796405u + 2891336453u;
    word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    let y_bits = (word >> 22u) ^ word;
    return vec2f(f32(x_bits) / 4294967295.0, f32(y_bits) / 4294967295.0);
}

fn wrap_float(value: f32, size: f32) -> f32 {
    if (size <= 0.0) { return 0.0; }
    let scaled = floor(value / size);
    var wrapped = value - scaled * size;
    if (wrapped < 0.0) { wrapped += size; }
    return wrapped;
}

fn wrap_int(value: i32, size: i32) -> i32 {
    if (size <= 0) { return 0; }
    var result = value % size;
    if (result < 0) { result += size; }
    return result;
}

fn srgb_to_linear(value: f32) -> f32 {
    if (value <= 0.04045) { return value / 12.92; }
    return pow((value + 0.055) / 1.055, 2.4);
}

fn cube_root(value: f32) -> f32 {
    if (value == 0.0) { return 0.0; }
    let sign_value = select(-1.0, 1.0, value >= 0.0);
    return sign_value * pow(abs(value), 1.0 / 3.0);
}

fn oklab_l(rgb: vec3f) -> f32 {
    let r_lin = srgb_to_linear(clamp(rgb.x, 0.0, 1.0));
    let g_lin = srgb_to_linear(clamp(rgb.y, 0.0, 1.0));
    let b_lin = srgb_to_linear(clamp(rgb.z, 0.0, 1.0));
    let l = 0.4121656120 * r_lin + 0.5362752080 * g_lin + 0.0514575653 * b_lin;
    let m = 0.2118591070 * r_lin + 0.6807189584 * g_lin + 0.1074065790 * b_lin;
    let s = 0.0883097947 * r_lin + 0.2818474174 * g_lin + 0.6302613616 * b_lin;
    return 0.2104542553 * cube_root(l) + 0.7936177850 * cube_root(m) - 0.0040720468 * cube_root(s);
}

fn fetch_texel(x: i32, y: i32, width: i32, height: i32) -> vec4f {
    let wrapped_x = wrap_int(x, width);
    let wrapped_y = wrap_int(y, height);
    return textureLoad(inputTex, vec2i(wrapped_x, wrapped_y), 0);
}

fn luminance_at(x: i32, y: i32, width: i32, height: i32) -> f32 {
    let texel = fetch_texel(x, y, width, height);
    return oklab_l(texel.xyz);
}

// === END ORIGINAL HELPER FUNCTIONS ===

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> Outputs {
    let coord = vec2i(fragCoord.xy);
    let stateSize = textureDimensions(xyzTex, 0);
    
    // Read input state from pipeline
    let xyz = textureLoad(xyzTex, coord, 0);
    let vel = textureLoad(velTex, coord, 0);
    let rgba = textureLoad(rgbaTex, coord, 0);
    
    // Extract components
    // xyz stores normalized coords [0,1], convert to pixel coords for algorithm
    let px = xyz.x;  // normalized x
    let py = xyz.y;  // normalized y
    let alive = xyz.w;
    
    // vel stores: [vx, vy, vz, seed] - standard velocity format
    // Compatible with physical() and other particle effects
    var vx = vel.x;
    var vy = vel.y;
    let vz = vel.z;
    var seed_f = vel.w;
    
    let width = i32(u.resolution.x);
    let height = i32(u.resolution.y);
    
    let agent_id = u32(coord.x) + u32(coord.y) * u32(stateSize.x);
    
    // Convert normalized to pixel coords for the algorithm
    var x = px * u.resolution.x;
    var y = py * u.resolution.y;
    
    // If not alive, pass through unchanged
    if (alive < 0.5) {
        return Outputs(xyz, vel, rgba);
    }
    
    // Initialize seed on first spawn (when seed is 0)
    if (seed_f == 0.0) {
        seed_f = hash2(agent_id + 99999u).x;
    }
    
    // Per-agent inertia derived from seed (for gradient blending)
    let inertia = 0.7 + seed_f * 0.3;
    
    // Attrition is now handled by pointsEmit

    // === GRADIENT DESCENT ALGORITHM ===
    
    let xi = wrap_int(i32(floor(x)), width);
    let yi = wrap_int(i32(floor(y)), height);
    let x1i = wrap_int(xi + 1, width);
    let y1i = wrap_int(yi + 1, height);
    
    let uu = x - floor(x);
    let vv = y - floor(y);
    
    let c00 = luminance_at(xi, yi, width, height);
    let c10 = luminance_at(x1i, yi, width, height);
    let c01 = luminance_at(xi, y1i, width, height);
    let c11 = luminance_at(x1i, y1i, width, height);
    
    var gx = mix(c01 - c00, c11 - c10, uu);
    var gy = mix(c10 - c00, c11 - c01, vv);
    
    // Apply inverse if requested
    if (u.inverse > 0.5) {
        gx = -gx;
        gy = -gy;
    }
    
    if (u.quantize > 0.5) {
        gx = floor(gx);
        gy = floor(gy);
    }
    
    // Convert gradient to velocity contribution
    // Stride controls the speed (in 1/10th pixels per frame)
    let glen = length(vec2f(gx, gy));
    var targetVx = 0.0;
    var targetVy = 0.0;
    if (glen > 1e-6) {
        let scale = (u.stride * 0.1) / glen;
        targetVx = gx * scale;
        targetVy = gy * scale;
    }
    
    // inputWeight controls how much gradient influences velocity
    // 0 = keep current velocity, 100 = fully gradient-driven
    let weightBlend = clamp(u.inputWeight * 0.01, 0.0, 1.0);
    let blendFactor = inertia * weightBlend;
    
    // Blend current velocity with gradient-derived target velocity
    vx = mix(vx, targetVx, blendFactor);
    vy = mix(vy, targetVy, blendFactor);
    
    // === END GRADIENT ALGORITHM ===
    
    // Integrate position with velocity (in pixel space)
    x = wrap_float(x + vx, u.resolution.x);
    y = wrap_float(y + vy, u.resolution.y);
    
    // Convert back to normalized coords [0,1]
    let newPx = x / u.resolution.x;
    let newPy = y / u.resolution.y;
    
    // Output: position updated, velocity in normalized space for compatibility
    let normVx = vx / u.resolution.x;
    let normVy = vy / u.resolution.y;
    
    return Outputs(
        vec4f(newPx, newPy, xyz.z, alive),
        vec4f(normVx, normVy, vz, seed_f),
        rgba
    );
}
