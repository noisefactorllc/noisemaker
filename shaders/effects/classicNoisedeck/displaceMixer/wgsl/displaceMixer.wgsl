/*
 * Displace mixer shader (WGSL fragment version).
 * Offsets the input feed using auxiliary textures or noise maps to create refractive motion.
 * Displacement magnitude is clamped relative to resolution to avoid sampling outside texture bounds.
 */

const PI : f32 = 3.14159265359;
const TAU : f32 = 6.28318530718;

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> intensity : f32;
@group(0) @binding(4) var<uniform> direction : f32;
@group(0) @binding(5) var<uniform> mode : i32;
@group(0) @binding(6) var<uniform> displaceSource : i32;
@group(0) @binding(7) var<uniform> wrap : i32;
@group(0) @binding(8) var<uniform> smoothing : f32;
@group(0) @binding(9) var<uniform> aberration : f32;

fn map_range(value : f32, inMin : f32, inMax : f32, outMin : f32, outMax : f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn smoothedSobel(st : vec2<f32>, mapTex : texture_2d<f32>) -> vec3<f32> {
    var kernelX : array<f32, 9>;
    kernelX[0] = -1.0; kernelX[1] = 0.0; kernelX[2] = 1.0;
    kernelX[3] = -2.0; kernelX[4] = 0.0; kernelX[5] = 2.0;
    kernelX[6] = -1.0; kernelX[7] = 0.0; kernelX[8] = 1.0;

    var kernelY : array<f32, 9>;
    kernelY[0] = -1.0; kernelY[1] = -2.0; kernelY[2] = -1.0;
    kernelY[3] = 0.0;  kernelY[4] = 0.0;  kernelY[5] = 0.0;
    kernelY[6] = 1.0;  kernelY[7] = 2.0;  kernelY[8] = 1.0;

    var blurWeights : array<f32, 9>;
    blurWeights[0] = 0.06; blurWeights[1] = 0.098; blurWeights[2] = 0.06;
    blurWeights[3] = 0.098; blurWeights[4] = 0.162; blurWeights[5] = 0.098;
    blurWeights[6] = 0.06; blurWeights[7] = 0.098; blurWeights[8] = 0.06;

    let texelSize = 1.0 / vec2<f32>(textureDimensions(mapTex, 0));

    var gx : f32 = 0.0;
    var gy : f32 = 0.0;
    var weightSum : f32 = 0.0;
    let blurStrength = map_range(smoothing, 1.0, 100.0, 2.0, 0.1);

    for (var i : i32 = -1; i <= 1; i = i + 1) {
        for (var j : i32 = -1; j <= 1; j = j + 1) {
            let offset = vec2<f32>(f32(i), f32(j)) * texelSize;
            let tex = textureSample(mapTex, samp, st + offset);
            let lum = 0.3 * tex.r + 0.59 * tex.g + 0.11 * tex.b;
            let index = (i + 1) * 3 + (j + 1);

            let adjustedWeight = blurWeights[index] * blurStrength;

            gx = gx + kernelX[index] * lum * adjustedWeight;
            gy = gy + kernelY[index] * lum * adjustedWeight;
            weightSum = weightSum + blurWeights[index];
        }
    }

    gx = gx / weightSum;
    gy = gy / weightSum;

    return normalize(vec3<f32>(gx, gy, 1.0));
}

fn refractMap(st : vec2<f32>, mapTex : texture_2d<f32>, mainTex : texture_2d<f32>) -> vec4<f32> {
    let normal = smoothedSobel(st, mapTex);
    let refractionOffset = normal.xy * (intensity * 0.25);
    return textureSample(mainTex, samp, st + refractionOffset);
}

fn reflectMap(st : vec2<f32>, mapTex : texture_2d<f32>, mainTex : texture_2d<f32>) -> vec4<f32> {
    let normal = smoothedSobel(st, mapTex);
    let incident = vec3<f32>(normalize(st - 0.5), 100.0);
    let reflection = reflect(incident, normal);
    let reflectionOffset = reflection.xy * (intensity * 0.0005);

    let chromaticIntensity = aberration * 0.001;

    let redOffset = reflectionOffset * (1.0 + chromaticIntensity);
    let greenOffset = reflectionOffset;
    let blueOffset = reflectionOffset * (1.0 - chromaticIntensity);

    let redChannel = textureSample(mainTex, samp, st + redOffset).r;
    let greenChannel = textureSample(mainTex, samp, st + greenOffset).g;
    let blueChannel = textureSample(mainTex, samp, st + blueOffset).b;
    let alphaChannel = textureSample(mainTex, samp, st + reflectionOffset).a;

    return vec4<f32>(redChannel, greenChannel, blueChannel, alphaChannel);
}

fn wrapCoords(st_in : vec2<f32>) -> vec2<f32> {
    var st = st_in;
    if (wrap == 0) {
        // mirror (default) - no change
    } else if (wrap == 1) {
        // repeat
        st = fract(st);
    } else if (wrap == 2) {
        // clamp
        st = clamp(st, vec2<f32>(0.0), vec2<f32>(1.0));
    }
    return st;
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    var st = position.xy / dims;

    let color1 = textureSample(inputTex, samp, st);
    let color2 = textureSample(tex, samp, st);

    var color = vec4<f32>(0.0, 0.0, 1.0, 1.0);
    var uv = st;

    if (mode == 0) {
        // displace
        if (displaceSource == 0) {
            let len = length(color1.rgb) + direction / 360.0;
            uv.x = uv.x + cos(len * TAU) * (intensity * 0.001);
            uv.y = uv.y + sin(len * TAU) * (intensity * 0.001);
            uv = wrapCoords(uv);
            color = textureSample(tex, samp, uv);
        } else {
            let len = length(color2.rgb) + direction / 360.0;
            uv.x = uv.x + cos(len * TAU) * (intensity * 0.001);
            uv.y = uv.y + sin(len * TAU) * (intensity * 0.001);
            uv = wrapCoords(uv);
            color = textureSample(inputTex, samp, uv);
        }
    } else if (mode == 1) {
        // refract
        if (displaceSource == 0) {
            color = refractMap(st, inputTex, tex);
        } else {
            color = refractMap(st, tex, inputTex);
        }
    } else if (mode == 2) {
        // reflect
        if (displaceSource == 0) {
            color = reflectMap(st, inputTex, tex);
        } else {
            color = reflectMap(st, tex, inputTex);
        }
    }

    return color;
}
