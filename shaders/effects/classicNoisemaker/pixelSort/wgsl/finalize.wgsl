// Pixel Sort Pass 3: Rotate back and blend with original
// Fragment shader version for WebGPU render pipeline

const PI : f32 = 3.141592653589793;

@group(0) @binding(0) var inputTex : texture_2d<f32>;  // sorted
@group(0) @binding(1) var input_sampler : sampler;
@group(0) @binding(2) var original_texture : texture_2d<f32>;  // original
@group(0) @binding(3) var original_sampler : sampler;
@group(0) @binding(4) var<uniform> resolution : vec2<f32>;
@group(0) @binding(5) var<uniform> angled : f32;
@group(0) @binding(6) var<uniform> darkest : f32;

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) uv : vec2<f32>,
};

@fragment
fn main(input : VertexOutput) -> @location(0) vec4<f32> {
    let texSize : vec2<f32> = vec2<f32>(textureDimensions(inputTex));
    let center : vec2<f32> = texSize * 0.5;
    let pixelCoord : vec2<f32> = input.uv * resolution - center;
    
    let angle : f32 = angled;
    let rad : f32 = angle * PI / 180.0;
    let c : f32 = cos(rad);
    let s : f32 = sin(rad);
    
    // Inverse Rotate
    var srcCoord : vec2<f32>;
    srcCoord.x = c * pixelCoord.x - s * pixelCoord.y;
    srcCoord.y = s * pixelCoord.x + c * pixelCoord.y;
    
    srcCoord = srcCoord + center;
    
    let originalColor : vec4<f32> = textureSample(original_texture, original_sampler, input.uv);
    
    // Sample texture unconditionally (WebGPU requires uniform control flow for textureSample)
    let uvCoord : vec2<f32> = clamp(srcCoord / texSize, vec2<f32>(0.0), vec2<f32>(1.0));
    let sampledSorted : vec4<f32> = textureSample(inputTex, input_sampler, uvCoord);
    
    // Check bounds and select appropriate color
    let inBounds : bool = srcCoord.x >= 0.0 && srcCoord.x < texSize.x && 
                          srcCoord.y >= 0.0 && srcCoord.y < texSize.y;
    let sortedColor : vec4<f32> = select(originalColor, sampledSorted, inBounds);
    
    var working_source : vec4<f32> = originalColor;
    var working_sorted : vec4<f32> = sortedColor;
    
    if (darkest != 0.0) {
        working_source = vec4<f32>(1.0) - working_source;
        working_sorted = vec4<f32>(1.0) - working_sorted;
    }
    
    var blended : vec4<f32> = max(working_source, working_sorted);
    blended = clamp(blended, vec4<f32>(0.0), vec4<f32>(1.0));
    blended.a = working_source.a;
    
    if (darkest != 0.0) {
        blended = vec4<f32>(1.0) - blended;
        blended.a = originalColor.a;
    } else {
        blended.a = originalColor.a;
    }
    
    return blended;
}
