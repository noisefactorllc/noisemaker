// GPGPU Pass 4: Gather sorted pixels with alignment
// Input: prepared texture (original colors), rank texture, brightest texture
// Output: Sorted row with brightest pixel aligned to its original position
// Uses approximate rank matching for efficiency

@group(0) @binding(0) var preparedTex : texture_2d<f32>;
@group(0) @binding(1) var rankTex : texture_2d<f32>;
@group(0) @binding(2) var brightestTex : texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) uv : vec2<f32>,
};

@fragment
fn main(input : VertexOutput) -> @location(0) vec4<f32> {
    let coord : vec2<i32> = vec2<i32>(input.position.xy);
    let size : vec2<i32> = vec2<i32>(textureDimensions(preparedTex));
    let x : i32 = coord.x;
    let y : i32 = coord.y;
    let width : i32 = size.x;
    
    // Get brightest x for this row
    let brightestXNorm : f32 = textureLoad(brightestTex, vec2<i32>(0, y), 0).r;
    let brightestX : i32 = i32(round(brightestXNorm * f32(width - 1)));
    
    // Python algorithm:
    // sortedIndex = (x - brightestX + width) % width
    // Output position x gets the pixel whose rank == sortedIndex
    let sortedIndex : i32 = (x - brightestX + width) % width;
    let targetRank : f32 = f32(sortedIndex) / f32(width - 1);
    
    // Use sparse sampling to find a pixel with approximately matching rank
    // Instead of exact match, find the closest match
    const NUM_SAMPLES : i32 = 64;
    var bestDiff : f32 = 2.0;
    var bestX : i32 = x;
    
    for (var s : i32 = 0; s < NUM_SAMPLES; s = s + 1) {
        let sampleX : i32 = (s * width) / NUM_SAMPLES;
        let rankData : vec4<f32> = textureLoad(rankTex, vec2<i32>(sampleX, y), 0);
        let pixelRank : f32 = rankData.r;
        
        let diff : f32 = abs(pixelRank - targetRank);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestX = sampleX;
        }
    }
    
    // Fetch the color from the best matching pixel
    let result : vec4<f32> = textureLoad(preparedTex, vec2<i32>(bestX, y), 0);
    
    return result;
}
