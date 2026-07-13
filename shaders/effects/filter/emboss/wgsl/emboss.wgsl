/*
 * Emboss relief with two explicit visual contracts. This is the mathematical
 * match of emboss.glsl; see that file and help.md for the derivation.
 */

// STYLE is a runtime-injected module-scope const (injectDefines); Dawn/naga
// constant-fold the style dispatch so only the active path survives compilation.
struct Uniforms {
    amount: f32,
    angle: f32,
    height: f32,
    colorAmount: f32,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
    renderScale: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const LUMA = vec3<f32>(0.2126, 0.7152, 0.0722);

// Tile-space sample: globalUV is a UV against the full (possibly tiled)
// output canvas; map it back into this pass's local input texture using
// fullResolution/tileOffset, matching emboss.glsl's sampleGlobal().
fn sampleGlobal(globalUV: vec2<f32>) -> vec3<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    var fullDims: vec2<f32> = texSize;
    if (uniforms.fullResolution.x > 0.0) { fullDims = uniforms.fullResolution; }
    let localUV = (globalUV * fullDims - uniforms.tileOffset) / texSize;
    return textureSample(inputTex, inputSampler, localUV).rgb;
}

fn colorDefaultEmboss(uv: vec2<f32>, texelSize: vec2<f32>) -> vec3<f32> {
    let kernel = array<f32, 9>(-2.0, -1.0, 0.0, -1.0, 1.0, 1.0, 0.0, 1.0, 2.0);

    // COLOR_DEFAULT_EXACT_BEGIN
    // Copied from the pre-angle/height shader: literal offsets and arithmetic
    // order intentionally stay intact so defaults never depend on trig folding.
    let offsets = array<vec2<f32>, 9>(
        vec2<f32>(-texelSize.x, -texelSize.y),
        vec2<f32>(0.0, -texelSize.y),
        vec2<f32>(texelSize.x, -texelSize.y),
        vec2<f32>(-texelSize.x, 0.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(texelSize.x, 0.0),
        vec2<f32>(-texelSize.x, texelSize.y),
        vec2<f32>(0.0, texelSize.y),
        vec2<f32>(texelSize.x, texelSize.y)
    );
    let texSize = vec2<f32>(textureDimensions(inputTex));
    var fullDims: vec2<f32> = texSize;
    if (uniforms.fullResolution.x > 0.0) { fullDims = uniforms.fullResolution; }

    var conv = vec3<f32>(0.0);
    for (var i = 0; i < 9; i = i + 1) {
        let g = uv + offsets[i] * uniforms.amount * uniforms.renderScale;
        let sample = textureSample(inputTex, inputSampler, (g * fullDims - uniforms.tileOffset) / texSize).rgb;
        conv = conv + sample * kernel[i];
    }
    // COLOR_DEFAULT_EXACT_END
    return conv;
}

fn colorGeneralEmboss(uv: vec2<f32>, texelSize: vec2<f32>) -> vec3<f32> {
    let kernel = array<f32, 9>(-2.0, -1.0, 0.0, -1.0, 1.0, 1.0, 0.0, 1.0, 2.0);
    let baseOffsetsPx = array<vec2<f32>, 9>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(0.0, -1.0), vec2<f32>(1.0, -1.0),
        vec2<f32>(-1.0,  0.0), vec2<f32>(0.0,  0.0), vec2<f32>(1.0,  0.0),
        vec2<f32>(-1.0,  1.0), vec2<f32>(0.0,  1.0), vec2<f32>(1.0,  1.0)
    );
    let theta = radians(uniforms.angle - 135.0);
    let ct = cos(theta);
    let st = sin(theta);

    let texSize = vec2<f32>(textureDimensions(inputTex));
    var fullDims: vec2<f32> = texSize;
    if (uniforms.fullResolution.x > 0.0) { fullDims = uniforms.fullResolution; }

    var conv = vec3<f32>(0.0);
    for (var i = 0; i < 9; i = i + 1) {
        let basePx = baseOffsetsPx[i];
        let rotatedPx = vec2<f32>(ct * basePx.x + st * basePx.y, -st * basePx.x + ct * basePx.y) * uniforms.height;
        let offsetUV = rotatedPx * texelSize * uniforms.amount * uniforms.renderScale;
        let g = uv + offsetUV;
        let sample = textureSample(inputTex, inputSampler, (g * fullDims - uniforms.tileOffset) / texSize).rgb;
        conv = conv + sample * kernel[i];
    }
    return conv;
}

fn grayEmboss(uv: vec2<f32>, centerRGB: vec3<f32>) -> vec3<f32> {
    let theta = radians(uniforms.angle);
    // This fixed sample delta matches GLSL because it is not position-derived.
    let direction = vec2<f32>(cos(theta), sin(theta));
    let offsetUV = direction * (uniforms.height * uniforms.renderScale) / uniforms.fullResolution;
    let positiveLuma = dot(sampleGlobal(uv + offsetUV), LUMA);
    let negativeLuma = dot(sampleGlobal(uv - offsetUV), LUMA);
    let signedEdge = positiveLuma - negativeLuma;
    let edgeMagnitude = abs(signedEdge);
    let relief = 0.5 + 0.5 * signedEdge;
    let centerLuma = dot(centerRGB, LUMA);
    let sourceChroma = centerRGB - vec3<f32>(centerLuma);
    let tracedColor = sourceChroma * edgeMagnitude * clamp(uniforms.colorAmount / 100.0, 0.0, 1.0);
    return vec3<f32>(relief) + tracedColor;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let globalCoord = pos.xy + uniforms.tileOffset;
    let globalUV = globalCoord / uniforms.fullResolution;
    let texelSize = 1.0 / texSize;
    let uv = pos.xy / texSize;
    let origColor = textureSample(inputTex, inputSampler, uv);
    let fullFrame = all(uniforms.tileOffset == vec2<f32>(0.0)) && all(uniforms.fullResolution == texSize);
    var colorTexelSize = 1.0 / uniforms.fullResolution;
    if (fullFrame) { colorTexelSize = texelSize; }

    var result: vec3<f32>;
    if (STYLE == 0) {
        if (uniforms.angle == 135.0 && uniforms.height == 1.0) {
            result = colorDefaultEmboss(globalUV, colorTexelSize);
        } else {
            result = colorGeneralEmboss(globalUV, colorTexelSize);
        }
    } else {
        result = grayEmboss(globalUV, origColor.rgb);
    }
    return vec4<f32>(clamp(result, vec3<f32>(0.0), vec3<f32>(1.0)), origColor.a);
}
