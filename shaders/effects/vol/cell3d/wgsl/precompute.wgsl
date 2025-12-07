// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> scale: f32;
@group(0) @binding(1) var<uniform> seed: f32;
@group(0) @binding(2) var<uniform> metric: i32;
@group(0) @binding(3) var<uniform> cellVariation: f32;
@group(0) @binding(4) var<uniform> volumeSize: i32;
@group(0) @binding(5) var<uniform> colorMode: i32;

// Volume dimensions - stored as 2D atlas
// Atlas layout: volumeSize x (volumeSize * volumeSize)

// PCG-based 3D hash for reproducible randomness
fn pcg3d(v_in: vec3<u32>) -> vec3<u32> {
    var v = v_in * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

fn hash3(p: vec3<f32>) -> vec3<f32> {
    let ps = p + seed * 0.1;
    let q = pcg3d(vec3<u32>(vec3<i32>(ps * 1000.0) + 65536));
    return vec3<f32>(q) / 4294967295.0;
}

// 3D Worley/Cell noise - returns distance to nearest cell and cell ID
fn cellNoise3D(p: vec3<f32>) -> vec2<f32> {
    let i = floor(p);
    let f = fract(p);
    
    var minDist: f32 = 10.0;
    var cellId: f32 = 0.0;
    
    // Search 3x3x3 neighborhood
    for (var z: i32 = -1; z <= 1; z = z + 1) {
        for (var y: i32 = -1; y <= 1; y = y + 1) {
            for (var x: i32 = -1; x <= 1; x = x + 1) {
                let neighbor = vec3<f32>(f32(x), f32(y), f32(z));
                let cellPos = i + neighbor;
                
                let randomOffset = hash3(cellPos);
                let jitter = cellVariation * 0.01;
                let cellPoint = neighbor + mix(vec3<f32>(0.5), randomOffset, jitter);
                
                let diff = cellPoint - f;
                
                var dist: f32;
                if (metric == 0) {
                    dist = length(diff);
                } else if (metric == 1) {
                    dist = abs(diff.x) + abs(diff.y) + abs(diff.z);
                } else {
                    dist = max(max(abs(diff.x), abs(diff.y)), abs(diff.z));
                }
                
                if (dist < minDist) {
                    minDist = dist;
                    cellId = cellPos.x * 73.0 + cellPos.y * 157.0 + cellPos.z * 311.0;
                }
            }
        }
    }
    
    return vec2<f32>(minDist, cellId);
}

// MRT output structure for volume cache and geometry buffer
struct FragOutput {
    @location(0) color: vec4<f32>,
    @location(1) geoOut: vec4<f32>,
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> FragOutput {
    // Use uniform for volume size
    let volSize = volumeSize;
    let volSizeF = f32(volSize);
    
    // Atlas is volSize x (volSize * volSize)
    // Pixel (x, y) maps to 3D coordinate (x, y % volSize, y / volSize)
    
    let pixelCoord = vec2<i32>(position.xy);
    
    let x = pixelCoord.x;
    let y = pixelCoord.y % volSize;
    let z = pixelCoord.y / volSize;
    
    // Bounds check
    if (x >= volSize || y >= volSize || z >= volSize) {
        return FragOutput(vec4<f32>(0.0), vec4<f32>(0.5, 0.5, 0.5, 0.0));
    }
    
    // Convert to normalized 3D coordinates in [-1, 1] world space (bounding box)
    // Use (volSizeF - 1.0) so texel 0 → -1.0 and texel N-1 → 1.0 exactly
    // This matches the sampling in the main shader which uses the same denominator
    var p = vec3<f32>(f32(x), f32(y), f32(z)) / (volSizeF - 1.0) * 2.0 - 1.0;
    
    // Scale for cell noise density
    let scaledP = p * scale;
    
    // Compute cell noise at this point
    let result = cellNoise3D(scaledP);
    let dist = result.x;
    let cellId = result.y;
    
    // Normalize distance based on metric
    var normalizer: f32;
    if (metric == 0) {
        normalizer = 0.866;  // Euclidean
    } else if (metric == 1) {
        normalizer = 1.5;    // Manhattan
    } else {
        normalizer = 0.6;    // Chebyshev
    }
    let normalizedDist = 1.0 - clamp(dist / normalizer, 0.0, 1.0);
    
    // Generate color from cell ID (for RGB mode)
    let h1 = fract(cellId * 0.0127);
    let h2 = fract(cellId * 0.0231);
    let h3 = fract(cellId * 0.0347);
    
    // Compute analytical gradient using finite differences
    let eps = 1.0 / volSizeF;
    let dx = cellNoise3D(scaledP + vec3<f32>(eps, 0.0, 0.0)).x;
    let dy = cellNoise3D(scaledP + vec3<f32>(0.0, eps, 0.0)).x;
    let dz = cellNoise3D(scaledP + vec3<f32>(0.0, 0.0, eps)).x;
    
    let gradient = vec3<f32>(dx - dist, dy - dist, dz - dist) / eps;
    let normal = normalize(-gradient + vec3<f32>(0.000001));
    
    // Pack output based on colorMode
    // colorMode 0 = mono (grayscale), 1 = rgb (cell colors)
    var color: vec4<f32>;
    if (colorMode == 0) {
        color = vec4<f32>(normalizedDist, normalizedDist, normalizedDist, 1.0);
    } else {
        color = vec4<f32>(normalizedDist, h1, h2, h3);
    }
    let geoOut = vec4<f32>(normal * 0.5 + 0.5, normalizedDist);
    
    return FragOutput(color, geoOut);
}
