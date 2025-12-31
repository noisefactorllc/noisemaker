#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float time;
uniform float scale;
uniform float seed;
uniform float speed;
uniform int octaves;
uniform bool ridges;
uniform int outputMode;
uniform float intensity;

out vec4 fragColor;

// ============================================================================
// 3D Simplex Noise Implementation
// Based on Stefan Gustavson's implementation
// ============================================================================

// Permutation polynomial: (34x^2 + 10x) mod 289
vec3 permute(vec3 x) {
    return mod(((x * 34.0) + 10.0) * x, 289.0);
}
vec4 permute(vec4 x) {
    return mod(((x * 34.0) + 10.0) * x, 289.0);
}

vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

// 3D Simplex noise with seed support
float simplex3D(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    
    // Apply seed offset to input
    v += seed * 0.1271;
    
    // First corner
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    
    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    
    // Permutations
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    
    // Gradients: 7x7 points over a square, mapped onto an octahedron
    float n_ = 0.142857142857; // 1/7
    vec3 ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    
    // Normalise gradients
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    
    // Mix final noise value
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// FBM
float fbmSimplex3D(vec3 p, int numOctaves) {
    float sum = 0.0;
    float amp = 1.0;
    float freq = 1.0;
    float maxAmp = 0.0;
    
    for (int i = 0; i < 3; i++) {
        if (i >= numOctaves) break;
        
        float n = simplex3D(p * freq);
        
        sum += n * amp;
        maxAmp += amp;
        freq *= 2.0;
        amp *= 0.5;
    }
    
    return sum / maxAmp;
}

// ============================================================================
// 3D Curl Noise
// curl(F) = (dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy)
// ============================================================================

vec3 curlNoise3D(vec3 p, int numOctaves) {
    const float eps = 1.0;
    
    // We need 3 independent scalar fields to compute curl of a vector field
    // Use offset positions to create decorrelated fields
    float a = sin(time * 6.28318) * (speed) + 1.0;
    float b = cos(time * 6.28318) * (speed) + 1.0;

    vec3 offset1 = vec3(a, b, 0.0);
    vec3 offset2 = vec3(31.416 - a, 47.853 - b, 12.793);
    vec3 offset3 = vec3(93.719 - b, 61.248 - a, 73.561 + a);
    
    // Sample Fx derivatives
    float Fx_py = fbmSimplex3D(p + vec3(0.0, eps, 0.0) - offset1, numOctaves);
    float Fx_ny = fbmSimplex3D(p - vec3(0.0, eps, 0.0) + offset1, numOctaves);
    float Fx_pz = fbmSimplex3D(p + vec3(0.0, 0.0, eps) - offset1, numOctaves);
    float Fx_nz = fbmSimplex3D(p - vec3(0.0, 0.0, eps) + offset1, numOctaves);
    
    // Sample Fy derivatives
    float Fy_px = fbmSimplex3D(p + vec3(eps, 0.0, 0.0) - offset2, numOctaves);
    float Fy_nx = fbmSimplex3D(p - vec3(eps, 0.0, 0.0) + offset2, numOctaves);
    float Fy_pz = fbmSimplex3D(p + vec3(0.0, 0.0, eps) - offset2, numOctaves);
    float Fy_nz = fbmSimplex3D(p - vec3(0.0, 0.0, eps) + offset2, numOctaves);
    
    // Sample Fz derivatives
    float Fz_px = fbmSimplex3D(p + vec3(eps, 0.0, 0.0) - offset3, numOctaves);
    float Fz_nx = fbmSimplex3D(p - vec3(eps, 0.0, 0.0) + offset3, numOctaves);
    float Fz_py = fbmSimplex3D(p + vec3(0.0, eps, 0.0) - offset3, numOctaves);
    float Fz_ny = fbmSimplex3D(p - vec3(0.0, eps, 0.0) + offset3, numOctaves);
    
    // Compute partial derivatives
    float dFx_dy = (Fx_py - Fx_ny) / (2.0 * eps);
    float dFx_dz = (Fx_pz - Fx_nz) / (2.0 * eps);
    float dFy_dx = (Fy_px - Fy_nx) / (2.0 * eps);
    float dFy_dz = (Fy_pz - Fy_nz) / (2.0 * eps);
    float dFz_dx = (Fz_px - Fz_nx) / (2.0 * eps);
    float dFz_dy = (Fz_py - Fz_ny) / (2.0 * eps);
    
    // curl = (dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy)
    return vec3(
        dFz_dy - dFy_dz,
        dFx_dz - dFz_dx,
        dFy_dx - dFx_dy
    );
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float aspect = resolution.x / resolution.y;
    
    // Center and scale coordinates
    vec2 centered = (uv - 0.5) * vec2(aspect, 1.0);
    vec3 p = vec3(centered * scale, 0.5);
    
    // Clamp octaves to valid range
    int oct = clamp(octaves, 1, 3);
    
    // Compute 3D curl noise
    vec3 curl = curlNoise3D(p, oct);
    
    // Apply intensity
    curl *= intensity;
    
    // Normalize curl to approximately [-1, 1] range then to [0, 1] for display
    curl = curl * 0.5 + 0.5;
    
    vec3 color;
    
    if (outputMode == 0) {
        // flowX: curl.x component
        color = vec3(curl.x);
    } else if (outputMode == 1) {
        // flowY: curl.y component
        color = vec3(curl.y);
    } else if (outputMode == 2) {
        // flowZ: curl.z component
        color = vec3(curl.z);
    } else if (outputMode == 3) {
        // full: all three components as RGB
        color = curl;
    } else {
        // magnitude: length of curl vector
        vec3 curlCentered = curl * 2.0 - 1.0; // Back to [-1, 1]
        float mag = length(curlCentered);
        color = vec3(mag);
    }

    if (ridges) {
        color = 1.0 - abs(color * 2.0 - 1.0);
    }
    
    fragColor = vec4(color, 1.0);
}
