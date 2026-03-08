// Vaseline downsample pass - same as bloom, averages pixels into smaller grid with boost

struct Params {
    resolution: vec2f,
    _pad0: vec2f,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
// inputSampler removed - not used (textureLoad only)
@group(0) @binding(1) var<uniform> params: Params;

const BOOST: f32 = 4.0;
const DOWNSAMPLE_SIZE: vec2i = vec2i(64, 64);

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let downCoord = vec2i(fragCoord.xy);
    let downSize = DOWNSAMPLE_SIZE;
    let fullSize = vec2i(params.resolution);
    
    if (downCoord.x >= downSize.x || downCoord.y >= downSize.y) {
        return vec4f(0.0);
    }
    
    // Calculate kernel size
    let kernelWidth = max((fullSize.x + downSize.x - 1) / downSize.x, 1);
    let kernelHeight = max((fullSize.y + downSize.y - 1) / downSize.y, 1);
    
    let originX = downCoord.x * kernelWidth;
    let originY = downCoord.y * kernelHeight;
    
    var accum = vec3f(0.0);
    var sampleCount: f32 = 0.0;
    
    for (var ky = 0; ky < kernelHeight; ky++) {
        let sampleY = originY + ky;
        if (sampleY >= fullSize.y) { break; }
        
        for (var kx = 0; kx < kernelWidth; kx++) {
            let sampleX = originX + kx;
            if (sampleX >= fullSize.x) { break; }
            
            let texel = textureLoad(inputTex, vec2i(sampleX, sampleY), 0).rgb;
            let highlight = clamp(texel, vec3f(0.0), vec3f(1.0));
            accum += highlight;
            sampleCount += 1.0;
        }
    }
    
    if (sampleCount <= 0.0) {
        return vec4f(0.0);
    }
    
    let avg = accum / sampleCount;
    let boosted = clamp(avg * BOOST, vec3f(0.0), vec3f(1.0));
    
    return vec4f(boosted, 1.0);
}
