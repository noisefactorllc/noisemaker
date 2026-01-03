struct Uniforms {
    resolution: vec2f,
    time: f32,
    aspectRatio: f32,
    scale: f32,
    seed: i32,
    speed: f32,
    octaves: f32,
    ridges: f32,
    outputMode: f32,
    intensity: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

// ============================================================================
// 3D Simplex Noise Implementation
// Based on Stefan Gustavson's implementation
// ============================================================================

// Permutation polynomial: (34x^2 + 10x) mod 289
fn permute3(x: vec3f) -> vec3f {
    return (((x * 34.0) + 10.0) * x) % 289.0;
}

fn permute4(x: vec4f) -> vec4f {
    return (((x * 34.0) + 10.0) * x) % 289.0;
}

fn taylorInvSqrt(r: vec4f) -> vec4f {
    return 1.79284291400159 - 0.85373472095314 * r;
}

// 3D Simplex noise with seed support
fn simplex3D(v: vec3f) -> f32 {
    let C = vec2f(1.0 / 6.0, 1.0 / 3.0);
    let D = vec4f(0.0, 0.5, 1.0, 2.0);
    
    // Apply seed offset to input
    let vSeeded = v + f32(u.seed) * 0.1271;
    
    // First corner
    let i = floor(vSeeded + dot(vSeeded, C.yyy));
    let x0 = vSeeded - i + dot(i, C.xxx);
    
    // Other corners
    let g = step(x0.yzx, x0.xyz);
    let l = 1.0 - g;
    let i1 = min(g.xyz, l.zxy);
    let i2 = max(g.xyz, l.zxy);
    
    let x1 = x0 - i1 + C.xxx;
    let x2 = x0 - i2 + C.yyy;
    let x3 = x0 - D.yyy;
    
    // Permutations
    let iMod = i % 289.0;
    let p = permute4(permute4(permute4(
        iMod.z + vec4f(0.0, i1.z, i2.z, 1.0))
        + iMod.y + vec4f(0.0, i1.y, i2.y, 1.0))
        + iMod.x + vec4f(0.0, i1.x, i2.x, 1.0));
    
    // Gradients: 7x7 points over a square, mapped onto an octahedron
    let n_ = 0.142857142857; // 1/7
    let ns = n_ * D.wyz - D.xzx;
    
    let j = p - 49.0 * floor(p * ns.z * ns.z);
    
    let x_ = floor(j * ns.z);
    let y_ = floor(j - 7.0 * x_);
    
    let x = x_ * ns.x + ns.yyyy;
    let y = y_ * ns.x + ns.yyyy;
    let h = 1.0 - abs(x) - abs(y);
    
    let b0 = vec4f(x.xy, y.xy);
    let b1 = vec4f(x.zw, y.zw);
    
    let s0 = floor(b0) * 2.0 + 1.0;
    let s1 = floor(b1) * 2.0 + 1.0;
    let sh = -step(h, vec4f(0.0));
    
    let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    let a1 = b1.xzyw + s1.xzyw * sh.zzww;
    
    let p0 = vec3f(a0.xy, h.x);
    let p1 = vec3f(a0.zw, h.y);
    let p2 = vec3f(a1.xy, h.z);
    let p3 = vec3f(a1.zw, h.w);
    
    // Normalise gradients
    let norm = taylorInvSqrt(vec4f(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    let p0n = p0 * norm.x;
    let p1n = p1 * norm.y;
    let p2n = p2 * norm.z;
    let p3n = p3 * norm.w;
    
    // Mix final noise value
    var m = max(0.6 - vec4f(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4f(0.0));
    m = m * m;
    return 42.0 * dot(m * m, vec4f(dot(p0n, x0), dot(p1n, x1), dot(p2n, x2), dot(p3n, x3)));
}

// FBM
fn fbmSimplex3D(p: vec3f, numOctaves: i32) -> f32 {
    var sum: f32 = 0.0;
    var amp: f32 = 1.0;
    var freq: f32 = 1.0;
    var maxAmp: f32 = 0.0;
    
    for (var i: i32 = 0; i < 3; i = i + 1) {
        if (i >= numOctaves) { break; }
        
        var n = simplex3D(p * freq);
        
        sum = sum + n * amp;
        maxAmp = maxAmp + amp;
        freq = freq * 2.0;
        amp = amp * 0.5;
    }
    
    return sum / maxAmp;
}

// ============================================================================
// 3D Curl Noise
// curl(F) = (dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy)
// ============================================================================

fn curlNoise3D(p: vec3f, numOctaves: i32) -> vec3f {
    let eps: f32 = 1.0;
    
    // We need 3 independent scalar fields to compute curl of a vector field
    // Use offset positions to create decorrelated fields
    let a = (sin(u.time * 6.28318) * (u.speed) + 1.0) / u.octaves;
    let b = (cos(u.time * 6.28318) * (u.speed) + 1.0) / u.octaves;

    let offset1 = vec3f(a, b, 0.0);
    let offset2 = vec3f(31.416 - a, 47.853 - b, 12.793);
    let offset3 = vec3f(93.719 - b, 61.248 - a, 73.561);
    
    // Sample Fx derivatives
    let Fx_py = fbmSimplex3D(p + vec3f(0.0, eps, 0.0) - offset1, numOctaves);
    let Fx_ny = fbmSimplex3D(p - vec3f(0.0, eps, 0.0) + offset1, numOctaves);
    let Fx_pz = fbmSimplex3D(p + vec3f(0.0, 0.0, eps) - offset1, numOctaves);
    let Fx_nz = fbmSimplex3D(p - vec3f(0.0, 0.0, eps) + offset1, numOctaves);
    
    // Sample Fy derivatives
    let Fy_px = fbmSimplex3D(p + vec3f(eps, 0.0, 0.0) - offset2, numOctaves);
    let Fy_nx = fbmSimplex3D(p - vec3f(eps, 0.0, 0.0) + offset2, numOctaves);
    let Fy_pz = fbmSimplex3D(p + vec3f(0.0, 0.0, eps) - offset2, numOctaves);
    let Fy_nz = fbmSimplex3D(p - vec3f(0.0, 0.0, eps) + offset2, numOctaves);
    
    // Sample Fz derivatives
    let Fz_px = fbmSimplex3D(p + vec3f(eps, 0.0, 0.0) - offset3, numOctaves);
    let Fz_nx = fbmSimplex3D(p - vec3f(eps, 0.0, 0.0) + offset3, numOctaves);
    let Fz_py = fbmSimplex3D(p + vec3f(0.0, eps, 0.0) - offset3, numOctaves);
    let Fz_ny = fbmSimplex3D(p - vec3f(0.0, eps, 0.0) + offset3, numOctaves);
    
    // Compute partial derivatives
    let dFx_dy = (Fx_py - Fx_ny) / (2.0 * eps);
    let dFx_dz = (Fx_pz - Fx_nz) / (2.0 * eps);
    let dFy_dx = (Fy_px - Fy_nx) / (2.0 * eps);
    let dFy_dz = (Fy_pz - Fy_nz) / (2.0 * eps);
    let dFz_dx = (Fz_px - Fz_nx) / (2.0 * eps);
    let dFz_dy = (Fz_py - Fz_ny) / (2.0 * eps);
    
    // curl = (dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy)
    return vec3f(
        dFz_dy - dFy_dz,
        dFx_dz - dFz_dx,
        dFy_dx - dFx_dy
    );
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let uv = fragCoord.xy / u.resolution;
    let aspect = u.resolution.x / u.resolution.y;
    
    // Center and scale coordinates
    let centered = (uv - 0.5) * vec2f(aspect, 1.0);
    let p = vec3f(centered * u.scale, 0.5);
    
    // Clamp octaves to valid range
    let oct = clamp(i32(u.octaves), 1, 3);
    
    // Compute 3D curl noise
    var curl = curlNoise3D(p, oct);
    
    // Apply intensity
    curl *= u.intensity;
    
    // Normalize curl to approximately [-1, 1] range then to [0, 1] for display
    let curlNorm = curl * 0.5 + 0.5;
    
    var color: vec3f;
    let outputInt = i32(u.outputMode);
    
    if (outputInt == 0) {
        // flowX: curl.x component
        color = vec3f(curlNorm.x);
    } else if (outputInt == 1) {
        // flowY: curl.y component
        color = vec3f(curlNorm.y);
    } else if (outputInt == 2) {
        // flowZ: curl.z component
        color = vec3f(curlNorm.z);
    } else if (outputInt == 3) {
        // full: all three components as RGB
        color = curlNorm;
    } else {
        // magnitude: length of curl vector
        let curlCentered = curlNorm * 2.0 - 1.0; // Back to [-1, 1]
        let mag = length(curlCentered);
        color = vec3f(mag);
    }

    if (u.ridges > 0.5) {
        color = 1.0 - abs(color * 2.0 - 1.0);
    }
    
    return vec4f(color, 1.0);
}
