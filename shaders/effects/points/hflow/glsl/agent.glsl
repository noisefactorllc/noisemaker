#version 300 es
precision highp float;
precision highp int;

// Standard uniforms
uniform vec2 resolution;
uniform float time;

// Hflow parameters
uniform float stride;
uniform float quantize;
uniform float inverse;
uniform float attrition;
uniform float inputWeight;

// Input state from pipeline (from pointsEmitter)
uniform sampler2D inputTex;  // Source texture for gradient descent
uniform sampler2D xyzTex;    // [x, y, z, alive]
uniform sampler2D velTex;    // [x_dir, y_dir, inertia, 0]
uniform sampler2D rgbaTex;   // [r, g, b, a]

// Output state (MRT)
layout(location = 0) out vec4 outXYZ;
layout(location = 1) out vec4 outVel;
layout(location = 2) out vec4 outRGBA;

// === ORIGINAL HFLOW HELPER FUNCTIONS (PRESERVED EXACTLY) ===

vec2 hash2(uint seed) {
    uint state = seed * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    uint x_bits = (word >> 22u) ^ word;
    state = x_bits * 747796405u + 2891336453u;
    word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    uint y_bits = (word >> 22u) ^ word;
    return vec2(float(x_bits) / 4294967295.0, float(y_bits) / 4294967295.0);
}

float wrap_float(float value, float size) {
    if (size <= 0.0) return 0.0;
    float scaled = floor(value / size);
    float wrapped = value - scaled * size;
    if (wrapped < 0.0) wrapped += size;
    return wrapped;
}

int wrap_int(int value, int size) {
    if (size <= 0) return 0;
    int result = value % size;
    if (result < 0) result += size;
    return result;
}

float srgb_to_linear(float value) {
    if (value <= 0.04045) return value / 12.92;
    return pow((value + 0.055) / 1.055, 2.4);
}

float cube_root(float value) {
    if (value == 0.0) return 0.0;
    float sign_value = value >= 0.0 ? 1.0 : -1.0;
    return sign_value * pow(abs(value), 1.0 / 3.0);
}

float oklab_l(vec3 rgb) {
    float r_lin = srgb_to_linear(clamp(rgb.x, 0.0, 1.0));
    float g_lin = srgb_to_linear(clamp(rgb.y, 0.0, 1.0));
    float b_lin = srgb_to_linear(clamp(rgb.z, 0.0, 1.0));
    float l = 0.4121656120 * r_lin + 0.5362752080 * g_lin + 0.0514575653 * b_lin;
    float m = 0.2118591070 * r_lin + 0.6807189584 * g_lin + 0.1074065790 * b_lin;
    float s = 0.0883097947 * r_lin + 0.2818474174 * g_lin + 0.6302613616 * b_lin;
    return 0.2104542553 * cube_root(l) + 0.7936177850 * cube_root(m) - 0.0040720468 * cube_root(s);
}

vec4 fetch_texel(int x, int y, int width, int height) {
    int wrapped_x = wrap_int(x, width);
    int wrapped_y = wrap_int(y, height);
    return texelFetch(inputTex, ivec2(wrapped_x, wrapped_y), 0);
}

float luminance_at(int x, int y, int width, int height) {
    vec4 texel = fetch_texel(x, y, width, height);
    return oklab_l(texel.xyz);
}

// === END ORIGINAL HELPER FUNCTIONS ===

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 stateSize = textureSize(xyzTex, 0);
    
    // Read input state from pipeline
    vec4 xyz = texelFetch(xyzTex, coord, 0);
    vec4 vel = texelFetch(velTex, coord, 0);
    vec4 rgba = texelFetch(rgbaTex, coord, 0);
    
    // Extract components
    // xyz stores normalized coords [0,1], convert to pixel coords for algorithm
    float px = xyz.x;  // normalized x
    float py = xyz.y;  // normalized y
    float alive = xyz.w;
    
    // vel stores: [x_dir, y_dir, inertia, 0]
    float x_dir = vel.x;
    float y_dir = vel.y;
    float inertia = vel.z;
    
    // Color from rgba
    float cr = rgba.r;
    float cg = rgba.g;
    float cb = rgba.b;
    
    int width = int(resolution.x);
    int height = int(resolution.y);
    
    uint agent_id = uint(coord.x + coord.y * stateSize.x);
    
    // Convert normalized to pixel coords for the algorithm
    float x = px * resolution.x;
    float y = py * resolution.y;
    
    // If not alive, pass through unchanged
    if (alive < 0.5) {
        outXYZ = xyz;
        outVel = vel;
        outRGBA = rgba;
        return;
    }
    
    // Initialize inertia on first use (if zero from pointsEmitter)
    if (inertia == 0.0) {
        inertia = 0.7 + hash2(agent_id + 99999u).x * 0.3;
        // Initialize random direction
        vec2 dir_raw = hash2(agent_id + 12345u) * 2.0 - 1.0;
        float dir_len = length(dir_raw);
        if (dir_len > 1e-5) {
            x_dir = dir_raw.x / dir_len;
            y_dir = dir_raw.y / dir_len;
        } else {
            x_dir = 1.0;
            y_dir = 0.0;
        }
    }
    
    // Respawn check (attrition)
    bool needsRespawn = false;
    if (attrition > 0.0) {
        uint time_seed = uint(time * 60.0);
        uint check_seed = agent_id + time_seed * 747796405u;
        float respawn_rand = hash2(check_seed).x;
        float attrition_rate = attrition * 0.01;
        if (respawn_rand < attrition_rate) {
            needsRespawn = true;
        }
    }
    
    if (needsRespawn) {
        // Signal respawn by setting alive flag to 0
        outXYZ = vec4(px, py, xyz.z, 0.0);
        outVel = vec4(x_dir, y_dir, inertia, 0.0);
        outRGBA = rgba;
        return;
    }

    // === ORIGINAL GRADIENT DESCENT ALGORITHM (PRESERVED EXACTLY) ===
    
    int xi = wrap_int(int(floor(x)), width);
    int yi = wrap_int(int(floor(y)), height);
    int x1i = wrap_int(xi + 1, width);
    int y1i = wrap_int(yi + 1, height);
    
    float u = x - floor(x);
    float v = y - floor(y);
    
    float c00 = luminance_at(xi, yi, width, height);
    float c10 = luminance_at(x1i, yi, width, height);
    float c01 = luminance_at(xi, y1i, width, height);
    float c11 = luminance_at(x1i, y1i, width, height);
    
    float gx = mix(c01 - c00, c11 - c10, u);
    float gy = mix(c10 - c00, c11 - c01, v);
    
    // Apply inverse if requested
    if (inverse > 0.5) {
        gx = -gx;
        gy = -gy;
    }
    
    if (quantize > 0.5) {
        gx = floor(gx);
        gy = floor(gy);
    }
    
    float glen = length(vec2(gx, gy));
    if (glen > 1e-6) {
        // Stride is in 1/10th of pixels, so divide by 10
        float scale = (stride * 0.1) / glen;
        gx *= scale;
        gy *= scale;
    } else {
        gx = 0.0;
        gy = 0.0;
    }
    
    // inputWeight controls how much the gradient influences direction
    // 0 = pure inertia (keep current direction), 100 = fully gradient-driven
    float weightBlend = clamp(inputWeight * 0.01, 0.0, 1.0);
    float effectiveInertia = inertia * weightBlend;
    
    x_dir = mix(x_dir, gx, effectiveInertia);
    y_dir = mix(y_dir, gy, effectiveInertia);
    
    x = wrap_float(x + x_dir, resolution.x);
    y = wrap_float(y + y_dir, resolution.y);
    
    // === END ORIGINAL ALGORITHM ===
    
    // Convert back to normalized coords
    float newPx = x / resolution.x;
    float newPy = y / resolution.y;
    
    outXYZ = vec4(newPx, newPy, xyz.z, 1.0);
    outVel = vec4(x_dir, y_dir, inertia, 0.0);
    outRGBA = rgba;
}
