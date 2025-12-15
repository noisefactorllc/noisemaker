/*
 * 3D Cellular Automata simulation shader (WGSL)
 * Implements various 3D CA rules with Moore (26) or Von Neumann (6) neighborhoods
 * Self-initializing: detects empty buffer and seeds on first frame
 */

@group(0) @binding(0) var<uniform> volumeSize: i32;
@group(0) @binding(1) var<uniform> seed: f32;
@group(0) @binding(2) var<uniform> ruleIndex: i32;
@group(0) @binding(3) var<uniform> neighborMode: i32;
@group(0) @binding(4) var<uniform> speed: f32;
@group(0) @binding(5) var<uniform> density: f32;
@group(0) @binding(6) var<uniform> weight: f32;
@group(0) @binding(7) var<uniform> resetState: i32;
@group(0) @binding(8) var stateTex: texture_2d<f32>;
@group(0) @binding(9) var seedTex: texture_2d<f32>;  // 3D input volume atlas (inputTex3d)

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

// Count alive neighbors using Moore neighborhood (26 neighbors)
fn countMooreNeighbors(voxel: vec3<i32>, volSize: i32) -> i32 {
    var count: i32 = 0;
    for (var dz: i32 = -1; dz <= 1; dz = dz + 1) {
        for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
            for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
                if (dx == 0 && dy == 0 && dz == 0) { continue; }
                let neighbor = sampleState(voxel + vec3<i32>(dx, dy, dz), volSize);
                if (neighbor.r > 0.5) { count = count + 1; }
            }
        }
    }
    return count;
}

// Count alive neighbors using Von Neumann neighborhood (6 neighbors)
fn countVonNeumannNeighbors(voxel: vec3<i32>, volSize: i32) -> i32 {
    var count: i32 = 0;
    let xp = sampleState(voxel + vec3<i32>(1, 0, 0), volSize);
    let xn = sampleState(voxel + vec3<i32>(-1, 0, 0), volSize);
    let yp = sampleState(voxel + vec3<i32>(0, 1, 0), volSize);
    let yn = sampleState(voxel + vec3<i32>(0, -1, 0), volSize);
    let zp = sampleState(voxel + vec3<i32>(0, 0, 1), volSize);
    let zn = sampleState(voxel + vec3<i32>(0, 0, -1), volSize);
    
    if (xp.r > 0.5) { count = count + 1; }
    if (xn.r > 0.5) { count = count + 1; }
    if (yp.r > 0.5) { count = count + 1; }
    if (yn.r > 0.5) { count = count + 1; }
    if (zp.r > 0.5) { count = count + 1; }
    if (zn.r > 0.5) { count = count + 1; }
    
    return count;
}

// Check if cell should be born
fn shouldBeBorn(n: i32, rule: i32) -> bool {
    if (rule == 0) { return n == 4; }                                   // 445M
    if (rule == 1) { return n >= 6 && n <= 8; }                         // 678 678
    if (rule == 2) { return n >= 9; }                                   // Amoeba
    if (rule == 3) { return n == 4 || n == 6 || n == 8 || n == 9; }     // Builder1
    if (rule == 4) { return n == 3; }                                   // Builder2 (3D Life)
    if (rule == 5) { return n >= 13; }                                  // Clouds
    if (rule == 6) { return n == 1 || n == 3; }                         // Crystal
    if (rule == 7) { return (n >= 5 && n <= 7) || n == 12; }            // Diamoeba
    if (rule == 8) { return n >= 4 && n <= 7; }                         // Pyroclastic
    if (rule == 9) { return n == 4; }                                   // Slow Decay
    if (rule == 10) { return n >= 5 && n <= 8; }                        // Spikey
    return false;
}

// Check if cell should survive
fn shouldSurvive(n: i32, rule: i32) -> bool {
    if (rule == 0) { return n == 4; }                                    // 445M
    if (rule == 1) { return n >= 6 && n <= 8; }                          // 678 678
    if (rule == 2) { return (n >= 5 && n <= 7) || n == 12 || n == 13 || n == 15; }  // Amoeba
    if (rule == 3) { return (n >= 3 && n <= 6) || n == 9; }              // Builder1
    if (rule == 4) { return n == 2 || n == 3; }                          // Builder2 (3D Life)
    if (rule == 5) { return n >= 13; }                                   // Clouds
    if (rule == 6) { return n == 1 || n == 2 || n == 4; }                // Crystal
    if (rule == 7) { return n >= 5 && n <= 8; }                          // Diamoeba
    if (rule == 8) { return n >= 6 && n <= 8; }                          // Pyroclastic
    if (rule == 9) { return n == 3 || n == 4; }                          // Slow Decay
    if (rule == 10) { return n == 5 || n == 6 || n == 9; }               // Spikey
    return false;
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
    var alive = state.r;
    var age = state.g;
    
    // Self-initialization or reset: detect empty buffer (first frame) or reset button
    let bufferIsEmpty = (state.r == 0.0 && state.g == 0.0 && state.b == 0.0 && state.a == 0.0);
    
    if (bufferIsEmpty || resetState != 0) {
        // Check if we have input from seedTex (inputTex3d)
        let seedVal = sampleSeed(voxel, volSize);
        let hasSeedInput = (seedVal.r > 0.0 || seedVal.g > 0.0 || seedVal.b > 0.0);
        
        if (hasSeedInput) {
            // Use seed texture luminance to determine initial alive state
            let lum = 0.299 * seedVal.r + 0.587 * seedVal.g + 0.114 * seedVal.b;
            if (lum > 0.5) {
                alive = 1.0;
            } else {
                alive = 0.0;
            }
            age = 0.0;
        } else {
            // Initialize with random sparse distribution
            let p = vec3<f32>(f32(x), f32(y), f32(z));
            let h = hash3(p, seed);
            let thresh = density * 0.01;
            
            // Seed a sphere in the center plus random cells
            let center = vec3<f32>(volSizeF * 0.5);
            let dist = length(p - center);
            let radius = volSizeF * 0.15;
            
            if (h < thresh || dist < radius) {
                alive = 1.0;
                age = 0.0;
            } else {
                alive = 0.0;
                age = 0.0;
            }
        }
        
        return vec4<f32>(alive, alive, alive, 1.0);
    }
    
    // Count neighbors based on neighborhood mode
    var neighbors: i32;
    if (neighborMode == 0) {
        neighbors = countMooreNeighbors(voxel, volSize);
    } else {
        neighbors = countVonNeumannNeighbors(voxel, volSize);
    }
    
    // Apply CA rules
    var newAlive: f32 = 0.0;
    var newAge: f32 = age;
    
    if (alive > 0.5) {
        // Cell is alive - check survival
        if (shouldSurvive(neighbors, ruleIndex)) {
            newAlive = 1.0;
            newAge = min(age + 0.01, 1.0);  // Age increases while alive
        } else {
            newAlive = 0.0;
            newAge = 0.0;
        }
    } else {
        // Cell is dead - check birth
        if (shouldBeBorn(neighbors, ruleIndex)) {
            newAlive = 1.0;
            newAge = 0.0;
        } else {
            newAlive = 0.0;
            newAge = 0.0;
        }
    }
    
    // Speed control - interpolate between states
    let animSpeed = speed * 0.01;
    var finalAlive = mix(alive, newAlive, animSpeed);
    let finalAge = mix(age, newAge, animSpeed);
    
    // Apply input weight blending from seedTex (inputTex3d)
    if (weight > 0.0) {
        let seedVal = sampleSeed(voxel, volSize);
        let seedLum = 0.299 * seedVal.r + 0.587 * seedVal.g + 0.114 * seedVal.b;
        finalAlive = mix(finalAlive, seedLum, weight * 0.01);
    }
    
    return vec4<f32>(finalAlive, finalAlive, finalAlive, 1.0);
}
