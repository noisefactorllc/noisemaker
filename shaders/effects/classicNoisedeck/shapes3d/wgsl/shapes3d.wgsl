/*
 * WGSL 3D shapes shader.
 * Implements raymarched primitives with lighting and orbit controls matching the GLSL reference.
 * Depth and shading calculations are normalized to the camera orbit parameters to avoid clipping when animated.
 */

struct Uniforms {
    // Contiguous vec4 packing:
    // 0: resolution.xy, time, (unused)
    // 1: shapeA, shapeB, shapeAScale, shapeBScale
    // 2: shapeAThickness, shapeBThickness, blendMode, smoothness
    // 3: spin, flip, spinSpeed, flipSpeed
    // 4: repetition, animation, flythroughSpeed, spacing
    // 5: cameraDist, backgroundOpacity, colorMode, weight
    // 6: backgroundColor.xyz, paletteMode
    // 7: paletteOffset.xyz, cyclePalette
    // 8: paletteAmp.xyz, rotatePalette
    // 9: paletteFreq.xyz, repeatPalette
    // 10: palettePhase.xyz, (unused)
    data : array<vec4<f32>, 11>,
};
@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(5) var inputTex : texture_2d<f32>;

// SHAPE_A, SHAPE_B and BLEND_MODE are compile-time consts injected by the
// runtime via injectDefines (see definition.js `globals.{shapeA,shapeB,
// blendMode}.define`). Same fix as the GLSL backend — collapses the per-
// raymarch-step dispatch so Dawn constant-folds it.

var<private> resolution : vec2<f32>;
var<private> time : f32;
var<private> shapeAScale : f32;
var<private> shapeBScale : f32;
var<private> shapeAThickness : f32;
var<private> shapeBThickness : f32;
var<private> smoothness : f32;
var<private> spin : f32;
var<private> flip : f32;
var<private> spinSpeed : f32;
var<private> flipSpeed : f32;
var<private> repetition : bool;
var<private> animation : i32;
var<private> flythroughSpeed : f32;
var<private> spacing : f32;
var<private> cameraDist : f32;
var<private> backgroundColor : vec3<f32>;
var<private> backgroundOpacity : f32;
var<private> colorMode : i32;
var<private> paletteMode : i32;
var<private> paletteOffset : vec3<f32>;
var<private> paletteAmp : vec3<f32>;
var<private> paletteFreq : vec3<f32>;
var<private> palettePhase : vec3<f32>;
var<private> cyclePalette : i32;
var<private> rotatePalette : f32;
var<private> repeatPalette : f32;

const PI : f32 = 3.14159265359;
const TAU : f32 = 6.28318530718;

fn modulo(a: f32, b: f32) -> f32 {
    return a - b * floor(a / b);
}

fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;
    let c = v * s;
    let x = c * (1.0 - abs(modulo(h * 6.0, 2.0) - 1.0));
    let m = v - c;
    var rgb = vec3<f32>(0.0);
    if (0.0 <= h && h < 1.0/6.0) {
        rgb = vec3<f32>(c, x, 0.0);
    } else if (1.0/6.0 <= h && h < 2.0/6.0) {
        rgb = vec3<f32>(x, c, 0.0);
    } else if (2.0/6.0 <= h && h < 3.0/6.0) {
        rgb = vec3<f32>(0.0, c, x);
    } else if (3.0/6.0 <= h && h < 4.0/6.0) {
        rgb = vec3<f32>(0.0, x, c);
    } else if (4.0/6.0 <= h && h < 5.0/6.0) {
        rgb = vec3<f32>(x, 0.0, c);
    } else if (5.0/6.0 <= h && h < 1.0) {
        rgb = vec3<f32>(c, 0.0, x);
    }
    return rgb + vec3<f32>(m, m, m);
}

fn linearToSrgb(linear: vec3<f32>) -> vec3<f32> {
    var srgb = vec3<f32>(0.0);
    for (var i: i32 = 0; i < 3; i = i + 1) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

const fwdA = mat3x3<f32>(
    vec3<f32>(1.0, 1.0, 1.0),
    vec3<f32>(0.3963377774, -0.1055613458, -0.0894841775),
    vec3<f32>(0.2158037573, -0.0638541728, -1.2914855480)
);

const fwdB = mat3x3<f32>(
    vec3<f32>(4.0767245293, -1.2681437731, -0.0041119885),
    vec3<f32>(-3.3072168827, 2.6093323231, -0.7034763098),
    vec3<f32>(0.2307590544, -0.3411344290, 1.7068625689)
);

const invB = mat3x3<f32>(
    vec3<f32>(0.4121656120, 0.2118591070, 0.0883097947),
    vec3<f32>(0.5362752080, 0.6807189584, 0.2818474174),
    vec3<f32>(0.0514575653, 0.1074065790, 0.6302613616)
);

const invA = mat3x3<f32>(
    vec3<f32>(0.2104542553, 1.9779984951, 0.0259040371),
    vec3<f32>(0.7936177850, -2.4285922050, 0.7827717662),
    vec3<f32>(-0.0040720468, 0.4505937099, -0.8086757660)
);

fn linear_srgb_from_oklab(c: vec3<f32>) -> vec3<f32> {
    let lms = fwdA * c;
    return fwdB * (lms * lms * lms);
}

fn luminance(color: vec3<f32>) -> f32 {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

fn pal(t0: f32, paletteOffset: vec3<f32>, paletteAmp: vec3<f32>, paletteFreq: vec3<f32>, palettePhase: vec3<f32>, paletteMode: i32, repeatPalette: f32, rotatePalette: f32) -> vec3<f32> {
    var t = abs(t0);
    t = t * repeatPalette + rotatePalette * 0.01;
    var color = paletteOffset + paletteAmp * cos(TAU * (paletteFreq * t + palettePhase));
    if (paletteMode == 1) {
        color = hsv2rgb(color);
    } else if (paletteMode == 2) {
        color.g = color.g * -0.509 + 0.276;
        color.b = color.b * -0.509 + 0.198;
        color = linear_srgb_from_oklab(color);
        color = linearToSrgb(color);
    }
    return color;
}

fn rotate2D(st: vec2<f32>, rot: f32) -> vec2<f32> {
    let angle = rot * PI;
    let s = sin(angle);
    let c = cos(angle);
    return mat2x2<f32>(c, -s, s, c) * st;
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
    let h = clamp(0.5 + 0.5*(b - a)/k, 0.0, 1.0);
    return mix(b, a, h) - k*h*(1.0 - h);
}

fn ssub(a: f32, b: f32, k: f32) -> f32 {
    let h = clamp(0.5 - 0.5*(b + a)/k, 0.0, 1.0);
    return mix(b, -a, h) + k*h*(1.0 - h);
}

fn smax(a: f32, b: f32, k: f32) -> f32 {
    let h = clamp(0.5 - 0.5*(b - a)/k, 0.0, 1.0);
    return mix(b, a, h) + k*h*(1.0 - h);
}

fn shape3dA(p: vec3<f32>, origin: vec3<f32>, scale: f32, thickness: f32) -> f32 {
    var d: f32 = 0.0;
    var s = scale * 0.25;
    var q = p;
    if (SHAPE_A == 20) {
        d = length(p - origin) - s;
    } else if (SHAPE_A == 30) {
        q = vec3<f32>(length(p.xy) - s, p.z, 0.0);
        d = length(q.xy) - 0.2;
    } else if (SHAPE_A == 31) {
        q = vec3<f32>(length(p.xz) - s, p.y, 0.0);
        d = length(q.xy) - 0.2;
    } else if (SHAPE_A == 10) {
        s = s * 0.75;
        q = p - clamp(p, vec3<f32>(-s), vec3<f32>(s));
        d = length(q) - 0.01;
    } else if (SHAPE_A == 40) {
        s = s * 0.75;
        d = length(p.xz) - s;
    } else if (SHAPE_A == 50) {
        s = s * 0.75;
        d = max(length(p - clamp(p, vec3<f32>(-s), vec3<f32>(s))), length(p.xy) - s);
    } else if (SHAPE_A == 60) {
        q = p;
        q.y = q.y - clamp(q.y, -scale * 0.5, scale * 0.5);
        d = length(q) - s * 0.5;
    } else if (SHAPE_A == 70) {
        q = p;
        q.x = q.x - clamp(q.x, -scale * 0.5, scale * 0.5);
        d = length(q) - s * 0.5;
    } else if (SHAPE_A == 80) {
        q = abs(p);
        return (q.x + q.y + q.z - s) * 0.57735027;
    }
    d = abs(d) - (thickness * 0.01);
    return d;
}

fn shape3dB(p: vec3<f32>, origin: vec3<f32>, scale: f32, thickness: f32) -> f32 {
    var d: f32 = 0.0;
    var s = scale * 0.25;
    var q = p;
    if (SHAPE_B == 20) {
        d = length(p - origin) - s;
    } else if (SHAPE_B == 30) {
        q = vec3<f32>(length(p.xy) - s, p.z, 0.0);
        d = length(q.xy) - 0.2;
    } else if (SHAPE_B == 31) {
        q = vec3<f32>(length(p.xz) - s, p.y, 0.0);
        d = length(q.xy) - 0.2;
    } else if (SHAPE_B == 10) {
        s = s * 0.75;
        q = p - clamp(p, vec3<f32>(-s), vec3<f32>(s));
        d = length(q) - 0.01;
    } else if (SHAPE_B == 40) {
        s = s * 0.75;
        d = length(p.xz) - s;
    } else if (SHAPE_B == 50) {
        s = s * 0.75;
        d = max(length(p - clamp(p, vec3<f32>(-s), vec3<f32>(s))), length(p.xy) - s);
    } else if (SHAPE_B == 60) {
        q = p;
        q.y = q.y - clamp(q.y, -scale * 0.5, scale * 0.5);
        d = length(q) - s * 0.5;
    } else if (SHAPE_B == 70) {
        q = p;
        q.x = q.x - clamp(q.x, -scale * 0.5, scale * 0.5);
        d = length(q) - s * 0.5;
    } else if (SHAPE_B == 80) {
        q = abs(p);
        return (q.x + q.y + q.z - s) * 0.57735027;
    }
    d = abs(d) - (thickness * 0.01);
    return d;
}

fn blend(shape1: f32, shape2: f32, smoothness: f32) -> f32 {
    var d: f32 = 0.0;
    if (BLEND_MODE == 10) {
        d = smin(shape1, shape2, smoothness * 0.02);
    } else if (BLEND_MODE == 20) {
        d = smax(shape1, shape2, smoothness * 0.01);
    } else if (BLEND_MODE == 25) {
        d = ssub(shape1, shape2, smoothness * 0.02);
    } else if (BLEND_MODE == 26) {
        d = ssub(-shape1, shape2, smoothness * 0.02);
    } else if (BLEND_MODE == 30) {
        d = min(shape1, shape2);
    } else if (BLEND_MODE == 40) {
        d = max(shape1, shape2);
    } else if (BLEND_MODE == 50) {
        d = max(-shape1, shape2);
    } else if (BLEND_MODE == 51) {
        d = max(shape1, -shape2);
    } else {
        d = shape1;
    }
    return d;
}

fn applyTransform(p0: vec3<f32>) -> vec3<f32> {
    var p = p0;
    if (repetition && animation != 0 && flythroughSpeed != 0.0) {
        p.z = p.z + time * flythroughSpeed;
    }
    var rotXZ = rotate2D(p.xz, spin / 180.0);
    p.x = rotXZ.x;
    p.z = rotXZ.y;
    var rotYZ = rotate2D(p.yz, flip / 180.0);
    p.y = rotYZ.x;
    p.z = rotYZ.y;
    if (repetition && animation == 1) {
        p = p - spacing * round(p / spacing);
    }
    rotXZ = rotate2D(p.xz, time * (spinSpeed * 0.1));
    p.x = rotXZ.x;
    p.z = rotXZ.y;
    rotYZ = rotate2D(p.yz, time * (flipSpeed * 0.1));
    p.y = rotYZ.x;
    p.z = rotYZ.y;
    if (repetition && animation == 0) {
        p = p - spacing * round(p / spacing);
    }
    return p;
}

fn getDist(p0: vec3<f32>) -> f32 {
    let p = applyTransform(p0);
    let shape1 = shape3dA(p, vec3<f32>(0.0, 0.0, 0.0), 1.0 + shapeAScale * 0.1, shapeAThickness);
    let shape2 = shape3dB(p, vec3<f32>(0.0, 0.0, 0.0), 1.0 + shapeBScale * 0.1, shapeBThickness);
    return blend(shape1, shape2, smoothness);
}

fn getNormal(p: vec3<f32>) -> vec3<f32> {
    let epsilon = 0.01;
    let d = getDist(p);
    let dx = getDist(p + vec3<f32>(epsilon, 0.0, 0.0)) - d;
    let dy = getDist(p + vec3<f32>(0.0, epsilon, 0.0)) - d;
    let dz = getDist(p + vec3<f32>(0.0, 0.0, epsilon)) - d;
    return normalize(vec3<f32>(dx, dy, dz));
}

fn rayMarch(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> f32 {
    var d = 0.0;
    let maxSteps = 100;
    let maxDist = 200.0;
    let minDist = 0.01;
    for (var i: i32 = 0; i < maxSteps; i = i + 1) {
        let p = rayOrigin + rayDirection * d;
        let dist = getDist(p);
        d = d + dist;
        if (d > maxDist || dist < minDist) {
            break;
        }
    }
    return d;
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    resolution = uniforms.data[0].xy;
    time = uniforms.data[0].z;

    // uniforms.data[1].x was shapeA — now compile-time SHAPE_A
    // uniforms.data[1].y was shapeB — now compile-time SHAPE_B
    shapeAScale = uniforms.data[1].z;
    shapeBScale = uniforms.data[1].w;

    shapeAThickness = uniforms.data[2].x;
    shapeBThickness = uniforms.data[2].y;
    // uniforms.data[2].z was blendMode — now compile-time BLEND_MODE
    smoothness = uniforms.data[2].w;

    spin = uniforms.data[3].x;
    flip = uniforms.data[3].y;
    spinSpeed = uniforms.data[3].z;
    flipSpeed = uniforms.data[3].w;

    repetition = uniforms.data[4].x > 0.5;
    animation = i32(uniforms.data[4].y);
    flythroughSpeed = uniforms.data[4].z;
    spacing = uniforms.data[4].w;

    cameraDist = uniforms.data[5].x;
    backgroundOpacity = uniforms.data[5].y;
    colorMode = i32(uniforms.data[5].z);
    let weight = uniforms.data[5].w;

    backgroundColor = uniforms.data[6].xyz;
    paletteMode = i32(uniforms.data[6].w);
    paletteOffset = uniforms.data[7].xyz;
    cyclePalette = i32(uniforms.data[7].w);
    paletteAmp = uniforms.data[8].xyz;
    rotatePalette = uniforms.data[8].w;
    paletteFreq = uniforms.data[9].xyz;
    repeatPalette = uniforms.data[9].w;
    palettePhase = uniforms.data[10].xyz;

    var color = vec4<f32>(1.0, 1.0, 1.0, 1.0);
    var st = (pos.xy - 0.5 * resolution) / resolution.y;

    let rayOrigin = vec3<f32>(0.0, 0.0, -cameraDist);
    let rayDirection = normalize(vec3<f32>(st, 1.0));
    let d = rayMarch(rayOrigin, rayDirection);

    var p = rayOrigin + rayDirection * d;
    let lightPosition = vec3<f32>(-5.0, 5.0, -5.0);
    let lightVector = normalize(lightPosition - p);
    var normal = getNormal(p);
    var diffuse = clamp(dot(normal, lightVector), 0.0, 1.0);

    if (weight > 0.0) {
        var tp = applyTransform(p);
        tp = tp * 0.5 + vec3<f32>(0.5);
        var colorXY = vec3<f32>(0.0);
        var colorXZ = vec3<f32>(0.0);
        var colorYZ = vec3<f32>(0.0);
        colorXY = textureSample(inputTex, samp, tp.xy).rgb;
        colorXZ = textureSample(inputTex, samp, tp.xz).rgb;
        colorYZ = textureSample(inputTex, samp, tp.yz).rgb;
        normal = abs(normal);
        color = vec4<f32>(colorXY * normal.z + colorXZ * normal.y + colorYZ * normal.x, color.a);
    }

    if (colorMode == 0) {
        color = vec4<f32>(color.rgb * vec3<f32>(1.0 - clamp(d * 0.035, 0.0, 1.0)), color.a);
    } else if (colorMode == 1) {
        color = vec4<f32>(color.rgb * (vec3<f32>(diffuse * 1.5) + vec3<f32>(0.5)), color.a);
    } else if (colorMode == 10) {
        color = vec4<f32>(color.rgb * (vec3<f32>(diffuse * 1.5) + vec3<f32>(0.5)), color.a);
        var lum = luminance(color.rgb);
        if (cyclePalette == -1) {
            lum = lum + time;
        } else if (cyclePalette == 1) {
            lum = lum - time;
        }
        color = vec4<f32>(color.rgb * pal(lum, paletteOffset, paletteAmp, paletteFreq, palettePhase, paletteMode, repeatPalette, rotatePalette), color.a);
    }

    let fogDist = clamp(d / 200.0, 0.0, 1.0);
    let bkg = vec4<f32>(backgroundColor, backgroundOpacity * 0.01);
    if (repetition) {
        color = mix(color, bkg, fogDist);
    } else {
        color = mix(color, bkg, floor(fogDist));
    }

    let st2 = pos.xy / resolution;

    return color;
}
