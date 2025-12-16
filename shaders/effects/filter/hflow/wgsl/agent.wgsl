// Hydraulic Flow - Pass 1: Agent State Update
// Fragment shader with MRT output to 3 state textures
// Agent format: [x, y, x_dir, y_dir] [r, g, b, inertia] [age, 0, 0, 0]

const TAU: f32 = 6.283185307179586;

struct Uniforms {
    resolution: vec2<f32>,
    stride: f32,
    quantize: f32,
    time: f32,
    inverse: f32,
    attrition: f32,
    inputWeight: f32,
    resetState: i32,
}

struct Outputs {
    @location(0) outState1: vec4<f32>,
    @location(1) outState2: vec4<f32>,
    @location(2) outState3: vec4<f32>,
}

// textureLoad doesn't require sampler - start bindings at 0
@group(0) @binding(0) var stateTex1: texture_2d<f32>;
@group(0) @binding(1) var stateTex2: texture_2d<f32>;
@group(0) @binding(2) var stateTex3: texture_2d<f32>;
@group(0) @binding(3) var inputTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> uniforms: Uniforms;

fn hash2(seed: u32) -> vec2<f32> {
    var state = seed * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    let x_bits = (word >> 22u) ^ word;
    state = x_bits * 747796405u + 2891336453u;
    word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    let y_bits = (word >> 22u) ^ word;
    return vec2<f32>(f32(x_bits) / 4294967295.0, f32(y_bits) / 4294967295.0);
}

fn wrap_float(value: f32, size: f32) -> f32 {
    if (size <= 0.0) { return 0.0; }
    let scaled = floor(value / size);
    var wrapped = value - scaled * size;
    if (wrapped < 0.0) { wrapped = wrapped + size; }
    return wrapped;
}

fn wrap_int(value: i32, size: i32) -> i32 {
    if (size <= 0) { return 0; }
    var result = value % size;
    if (result < 0) { result = result + size; }
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

fn oklab_l(rgb: vec3<f32>) -> f32 {
    let r_lin = srgb_to_linear(clamp(rgb.x, 0.0, 1.0));
    let g_lin = srgb_to_linear(clamp(rgb.y, 0.0, 1.0));
    let b_lin = srgb_to_linear(clamp(rgb.z, 0.0, 1.0));
    let l = 0.4121656120 * r_lin + 0.5362752080 * g_lin + 0.0514575653 * b_lin;
    let m = 0.2118591070 * r_lin + 0.6807189584 * g_lin + 0.1074065790 * b_lin;
    let s = 0.0883097947 * r_lin + 0.2818474174 * g_lin + 0.6302613616 * b_lin;
    return 0.2104542553 * cube_root(l) + 0.7936177850 * cube_root(m) - 0.0040720468 * cube_root(s);
}

fn fetch_texel(x: i32, y: i32, width: i32, height: i32) -> vec4<f32> {
    let wrapped_x = wrap_int(x, width);
    let wrapped_y = wrap_int(y, height);
    return textureLoad(inputTex, vec2<i32>(wrapped_x, wrapped_y), 0);
}

fn luminance_at(x: i32, y: i32, width: i32, height: i32) -> f32 {
    let texel = fetch_texel(x, y, width, height);
    return oklab_l(texel.xyz);
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> Outputs {
    let stateSize = vec2<i32>(textureDimensions(stateTex1, 0));
    let coord = vec2<i32>(clamp(position.xy, vec2<f32>(0.0), vec2<f32>(stateSize) - vec2<f32>(1.0)));
    
    let state1 = textureLoad(stateTex1, coord, 0);
    let state2 = textureLoad(stateTex2, coord, 0);
    let state3 = textureLoad(stateTex3, coord, 0);
    
    var x = state1.x;
    var y = state1.y;
    var x_dir = state1.z;
    var y_dir = state1.w;
    var cr = state2.r;
    var cg = state2.g;
    var cb = state2.b;
    var inertia = state2.w;
    var age = state3.x;
    
    let width = i32(uniforms.resolution.x);
    let height = i32(uniforms.resolution.y);
    
    let agent_id = u32(coord.y * stateSize.x + coord.x);
    let total_agents = u32(stateSize.x * stateSize.y);
    
    // Initialization: detect uninitialized state (all zeros) or reset requested
    let needs_init = (x == 0.0 && y == 0.0 && x_dir == 0.0 && y_dir == 0.0) || uniforms.resetState != 0;
    if (needs_init) {
        // Initialize agent at random position
        let pos = hash2(agent_id);
        x = pos.x * uniforms.resolution.x;
        y = pos.y * uniforms.resolution.y;
        
        // Random direction
        let dir_raw = hash2(agent_id + 12345u) * 2.0 - 1.0;
        let dir_len = length(dir_raw);
        if (dir_len > 1e-5) {
            x_dir = dir_raw.x / dir_len;
            y_dir = dir_raw.y / dir_len;
        } else {
            x_dir = 1.0;
            y_dir = 0.0;
        }
        
        // Sample initial color from input
        let init_xi = wrap_int(i32(floor(x)), width);
        let init_yi = wrap_int(i32(floor(y)), height);
        let init_sample = textureLoad(inputTex, vec2<i32>(init_xi, init_yi), 0);
        cr = init_sample.x;
        cg = init_sample.y;
        cb = init_sample.z;
        
        inertia = 0.7 + hash2(agent_id + 99999u).x * 0.3;
        age = 0.0;
        
        return Outputs(
            vec4<f32>(x, y, x_dir, y_dir),
            vec4<f32>(cr, cg, cb, inertia),
            vec4<f32>(age, 0.0, 0.0, 0.0)
        );
    }
    
    // Respawn logic using attrition (percentage of agents respawning per frame)
    let respawn_rand = hash2(agent_id + u32(uniforms.time * 60.0)).x;
    let attrition_rate = uniforms.attrition * 0.01;  // Convert 0-10% to 0-0.1
    let respawn_check = uniforms.attrition > 0.0 && respawn_rand < attrition_rate;
    
    let needs_initial_color = age < 0.0;
    if (needs_initial_color) {
        let init_xi = wrap_int(i32(floor(x)), width);
        let init_yi = wrap_int(i32(floor(y)), height);
        let init_sample = textureLoad(inputTex, vec2<i32>(init_xi, init_yi), 0);
        cr = init_sample.x;
        cg = init_sample.y;
        cb = init_sample.z;
        age = 0.0;
    }
    
    if (respawn_check) {
        let seed = agent_id + u32(uniforms.time * 1000.0);
        let pos = hash2(seed);
        x = pos.x * uniforms.resolution.x;
        y = pos.y * uniforms.resolution.y;
        let spawn_xi = wrap_int(i32(floor(x)), width);
        let spawn_yi = wrap_int(i32(floor(y)), height);
        let spawn_sample = textureLoad(inputTex, vec2<i32>(spawn_xi, spawn_yi), 0);
        cr = spawn_sample.x;
        cg = spawn_sample.y;
        cb = spawn_sample.z;
        age = 0.0;
        let dir_seed = seed + 12345u;
        let dir_raw = hash2(dir_seed) * 2.0 - 1.0;
        let dir_len = length(dir_raw);
        if (dir_len > 1e-5) {
            x_dir = dir_raw.x / dir_len;
            y_dir = dir_raw.y / dir_len;
        } else {
            x_dir = 1.0;
            y_dir = 0.0;
        }
    }
    
    // Gradient descent
    let xi = wrap_int(i32(floor(x)), width);
    let yi = wrap_int(i32(floor(y)), height);
    let x1i = wrap_int(xi + 1, width);
    let y1i = wrap_int(yi + 1, height);
    
    let u = x - floor(x);
    let v = y - floor(y);
    
    let c00 = luminance_at(xi, yi, width, height);
    let c10 = luminance_at(x1i, yi, width, height);
    let c01 = luminance_at(xi, y1i, width, height);
    let c11 = luminance_at(x1i, y1i, width, height);
    
    var gx = mix(c01 - c00, c11 - c10, u);
    var gy = mix(c10 - c00, c11 - c01, v);
    
    if (uniforms.quantize > 0.5) {
        gx = floor(gx);
        gy = floor(gy);
    }
    
    let glen = length(vec2<f32>(gx, gy));
    if (glen > 1e-6) {
        // Stride is in 1/10th of pixels, so divide by 10
        let scale = (uniforms.stride * 0.1) / glen;
        gx = gx * scale;
        gy = gy * scale;
    } else {
        gx = 0.0;
        gy = 0.0;
    }
    
    // inputWeight controls how much the gradient influences direction
    // 0 = pure inertia (keep current direction), 100 = fully gradient-driven
    let weightBlend = clamp(uniforms.inputWeight * 0.01, 0.0, 1.0);
    let effectiveInertia = inertia * weightBlend;
    
    x_dir = mix(x_dir, gx, effectiveInertia);
    y_dir = mix(y_dir, gy, effectiveInertia);
    
    x = wrap_float(x + x_dir, uniforms.resolution.x);
    y = wrap_float(y + y_dir, uniforms.resolution.y);
    
    return Outputs(
        vec4<f32>(x, y, x_dir, y_dir),
        vec4<f32>(cr, cg, cb, inertia),
        vec4<f32>(max(age, 0.0), 0.0, 0.0, 0.0)
    );
}
