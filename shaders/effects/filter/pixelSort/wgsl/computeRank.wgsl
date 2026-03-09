// GPGPU Pass 3: Compute rank for each pixel (optimized)
// Input: luminance texture (R = luminance)
// Output: R = rank (normalized), G = luminance, B = original x, A = 1
// Uses sparse sampling for O(1) approximate rank instead of O(n) exact rank

@group(0) @binding(0) var lumTex : texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) uv : vec2<f32>,
};

@fragment
fn main(input : VertexOutput) -> @location(0) vec4<f32> {
    let coord : vec2<i32> = vec2<i32>(input.position.xy);
    let size : vec2<i32> = vec2<i32>(textureDimensions(lumTex));
    let x : i32 = coord.x;
    let y : i32 = coord.y;
    let width : i32 = size.x;
    
    let myLum : f32 = textureLoad(lumTex, coord, 0).r;
    
    // Use sparse sampling - sample a fixed number of points across the row
    // This gives O(1) approximate rank instead of O(n) exact rank
    const NUM_SAMPLES : i32 = 32;
    var brighterCount : i32 = 0;
    
    for (var s : i32 = 0; s < NUM_SAMPLES; s = s + 1) {
        // Sample evenly across the row
        let sampleX : i32 = (s * width) / NUM_SAMPLES;
        if (sampleX == x) {
            continue;
        }
        
        let otherLum : f32 = textureLoad(lumTex, vec2<i32>(sampleX, y), 0).r;
        if (otherLum > myLum || (otherLum == myLum && sampleX < x)) {
            brighterCount = brighterCount + 1;
        }
    }
    
    // Estimate rank based on samples
    let estimatedRank : f32 = f32(brighterCount) / f32(NUM_SAMPLES);
    
    // Output: rank (normalized), luminance, original x (normalized)
    return vec4<f32>(estimatedRank, myLum, f32(x) / f32(width - 1), 1.0);
}
