/*
 * 3D Reaction-Diffusion simulation shader (WGSL)
 * Implements Gray-Scott model in 3D with 6-neighbor Laplacian
 * Self-initializing: detects empty buffer and seeds on first frame
 */

@group(0) @binding(0) var<uniform> volumeSize: i32;
@group(0) @binding(1) var<uniform> seed: i32;
@group(0) @binding(2) var<uniform> feed: f32;
@group(0) @binding(3) var<uniform> kill: f32;
@group(0) @binding(4) var<uniform> rate1: f32;
@group(0) @binding(5) var<uniform> rate2: f32;
@group(0) @binding(6) var<uniform> speed: f32;
@group(0) @binding(7) var<uniform> weight: f32;
@group(0) @binding(8) var stateTex: texture_2d<f32>;
@group(0) @binding(9) var seedTex: texture_2d<f32>;  // 3D input volume atlas (inputTex3d)
@group(0) @binding(10) var<uniform> iterations: i32;
@group(0) @binding(11) var<uniform> colorMode: i32;
@group(0) @binding(12) var<uniform> resetState: i32;

// Hash for initialization
fn hash3(p: vec3<f32>, s: f32) -> f32 {
    var pp = p + s * 0.1;
    pp = fract(pp * vec3<f32>(0.1031, 0.1030, 0.0973));
    pp = pp + dot(pp, pp.yxz + 33.33);
    return fract((pp.x + pp.y) * pp.z);
}

// Helper to convert 3D voxel coords to 2D atlas texel coords with wrapping
fn atlasTexel(p: vec3<i32>, volSize: i32) -> vec2<i32> {
    // Wrap coordinates for periodic boundary
    let wrapped = vec3<i32>(
        (p.x + volSize) % volSize,
        (p.y + volSize) % volSize,
        (p.z + volSize) % volSize
    );
    return vec2<i32>(wrapped.x, wrapped.y + wrapped.z * volSize);
}

// Sample state at voxel coordinate with wrapping
fn sampleState(voxel: vec3<i32>, volSize: i32) -> vec4<f32> {
    return textureLoad(stateTex, atlasTexel(voxel, volSize), 0);
}

// Sample seed texture at voxel coordinate (for inputTex3d seeding)
fn sampleSeed(voxel: vec3<i32>, volSize: i32) -> vec4<f32> {
    return textureLoad(seedTex, atlasTexel(voxel, volSize), 0);
}

// 3D Laplacian using 6-neighbor stencil
// Standard discrete Laplacian for uniform 3D grid
fn laplacian3D(voxel: vec3<i32>, volSize: i32) -> vec2<f32> {
    let center = sampleState(voxel, volSize);
    
    // 6-neighbor stencil (face-adjacent neighbors)
    let xp = sampleState(voxel + vec3<i32>(1, 0, 0), volSize);
    let xn = sampleState(voxel + vec3<i32>(-1, 0, 0), volSize);
    let yp = sampleState(voxel + vec3<i32>(0, 1, 0), volSize);
    let yn = sampleState(voxel + vec3<i32>(0, -1, 0), volSize);
    let zp = sampleState(voxel + vec3<i32>(0, 0, 1), volSize);
    let zn = sampleState(voxel + vec3<i32>(0, 0, -1), volSize);
    
    // Standard discrete 3D Laplacian: sum of neighbors - 6 * center
    // This is the proper second-order finite difference in 3D
    let neighborSum = xp.rg + xn.rg + yp.rg + yn.rg + zp.rg + zn.rg;
    let lap = neighborSum - 6.0 * center.rg;
    
    return lap;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let volSize = volumeSize;
    let volSizeF = f32(volSize);
    
    // Decode voxel position from atlas
    let pixelCoord = vec2<i32>(position.xy);
    let x = pixelCoord.x;
    let y = pixelCoord.y % volSize;
    let z = pixelCoord.y / volSize;
    let voxel = vec3<i32>(x, y, z);
    
    // Bounds check
    if (x >= volSize || y >= volSize || z >= volSize) {
        return vec4<f32>(0.0);
    }
    
    // Current state
    let state = sampleState(voxel, volSize);
    var a = state.r;  // Chemical A concentration
    var b = state.g;  // Chemical B concentration
    
    // Self-initialization: detect empty buffer (first frame) or reset requested
    let bufferIsEmpty = (state.r == 0.0 && state.g == 0.0 && state.b == 0.0 && state.a == 0.0);
    
    if (bufferIsEmpty || resetState != 0) {
        a = 1.0;
        b = 0.0;

        if (resetState != 0) {
            // Reset behavior: reseed a 4x4x4 cube at the center of the volume.
            // For even sizes, this is indices [N/2-2 .. N/2+1] (inclusive).
            let start: i32 = max(0, (volSize / 2) - 2);
            let end: i32 = min(volSize - 1, start + 3);
            let inCenterCube = (x >= start && x <= end && y >= start && y <= end && z >= start && z <= end);
            if (inCenterCube) { b = 1.0; }
        } else {
            // First-frame init: if we have input from seedTex (inputTex3d), use it.
            let seedVal = sampleSeed(voxel, volSize);
            let hasSeedInput = (seedVal.r > 0.0 || seedVal.g > 0.0 || seedVal.b > 0.0);

            if (hasSeedInput) {
                let lum = 0.299 * seedVal.r + 0.587 * seedVal.g + 0.114 * seedVal.b;
                if (lum > 0.5) {
                    b = 1.0;
                }
            } else {
                // Fallback: sparse random seeding of B
                let p = vec3<f32>(f32(x), f32(y), f32(z));
                if (hash3(p, f32(seed)) > 0.97) {
                    b = 1.0;
                }
            }
        }

        return vec4<f32>(a, b, 0.0, 1.0);
    }
    
    // Compute Laplacian for diffusion
    let lap = laplacian3D(voxel, volSize);
    
    // Gray-Scott parameters (scaled from UI values)
    // Note: Laplacian in 3D is 6x larger than normalized form,
    // so we scale diffusion rates down by 6 to maintain stability
    let f = feed * 0.001;        // Feed rate
    let k = kill * 0.001;        // Kill rate
    let r1 = rate1 * 0.01 / 6.0;   // Diffusion rate A (scaled for 3D)
    let r2 = rate2 * 0.01 / 6.0;   // Diffusion rate B (scaled for 3D)
    // This pass is executed `iterations` times per frame (pipeline repeat).
    // Scale timestep per-iteration so "speed" behaves like a per-frame control.
    let iterF = max(1.0, f32(iterations));
    let s = (speed * 0.01) / iterF;
    
    // Gray-Scott reaction-diffusion equations
    var newA = clamp(a + (r1 * lap.x - a * b * b + f * (1.0 - a)) * s, 0.0, 1.0);
    var newB = clamp(b + (r2 * lap.y + a * b * b - (k + f) * b) * s, 0.0, 1.0);
    
    // Apply input weight blending from seedTex (inputTex3d)
    if (weight > 0.0) {
        let seedVal = sampleSeed(voxel, volSize);
        let seedLum = 0.299 * seedVal.r + 0.587 * seedVal.g + 0.114 * seedVal.b;
        // Seed influences chemical B (the visible one)
        newB = mix(newB, seedLum, weight * 0.01);
    }
    
    // `render3d` treats the red channel as the density/SDF field.
    // For Gray-Scott, chemical B is typically the visible concentration.
    let density = newB;
    var outRgb: vec3<f32>;
    if (colorMode == 0) {
        outRgb = vec3<f32>(density);
    } else {
        outRgb = vec3<f32>(density, newA, 1.0 - density);
    }

    return vec4<f32>(outRgb, 1.0);
}
