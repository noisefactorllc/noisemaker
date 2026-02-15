/*
 * Coalesce compositing shader (WGSL fragment version).
 * Provides blend modes plus a refractive cloaking mix that cross-samples both synth inputs.
 * Mix parameters are remapped from UI ranges so the refractive offsets stay within texture bounds during layering.
 */

const PI : f32 = 3.14159265359;
const TAU : f32 = 6.28318530718;

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> blendMode : i32;
@group(0) @binding(4) var<uniform> mixAmt : f32;
@group(0) @binding(5) var<uniform> refractAAmt : f32;
@group(0) @binding(6) var<uniform> refractBAmt : f32;
@group(0) @binding(7) var<uniform> refractADir : f32;
@group(0) @binding(8) var<uniform> refractBDir : f32;

fn map_range(value : f32, inMin : f32, inMax : f32, outMin : f32, outMax : f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn blendOverlay(a : f32, b : f32) -> f32 {
    if (a < 0.5) {
        return 2.0 * a * b;
    }
    return 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
}

fn blendSoftLight(base : f32, blend : f32) -> f32 {
    if (blend < 0.5) {
        return 2.0 * base * blend + base * base * (1.0 - 2.0 * blend);
    }
    return sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend);
}

fn cloak(st : vec2<f32>) -> vec4<f32> {
    let m = map_range(mixAmt, -100.0, 100.0, 0.0, 1.0);
    let ra = map_range(refractAAmt, 0.0, 100.0, 0.0, 0.125);
    let rb = map_range(refractBAmt, 0.0, 100.0, 0.0, 0.125);

    let leftColor = textureSample(inputTex, samp, st);
    let rightColor = textureSample(tex, samp, st);

    // When the mixer is all the way to the left, we see left refracted by right
    var leftUV = st;
    let rightLen = length(rightColor.rgb);
    leftUV.x = leftUV.x + cos(rightLen * TAU) * ra;
    leftUV.y = leftUV.y + sin(rightLen * TAU) * ra;

    let leftRefracted = textureSample(inputTex, samp, fract(leftUV));

    // When the mixer is all the way to the right, we see right refracted by left
    var rightUV = st;
    let leftLen = length(leftColor.rgb);
    rightUV.x = rightUV.x + cos(leftLen * TAU) * rb;
    rightUV.y = rightUV.y + sin(leftLen * TAU) * rb;

    let rightRefracted = textureSample(tex, samp, fract(rightUV));

    // As the mixer approaches midpoint, mix the two refracted outputs using the same
    // logic as the "reflect" mode in coalesce.
    let leftReflected = min(rightRefracted * rightColor / (1.0 - leftRefracted * leftColor), vec4<f32>(1.0));
    let rightReflected = min(leftRefracted * leftColor / (1.0 - rightRefracted * rightColor), vec4<f32>(1.0));

    var left = vec4<f32>(1.0);
    var right = vec4<f32>(1.0);
    if (mixAmt < 0.0) {
        left = mix(leftRefracted, leftReflected, map_range(mixAmt, -100.0, 0.0, 0.0, 1.0));
        right = rightReflected;
    } else {
        left = leftReflected;
        right = mix(rightReflected, rightRefracted, map_range(mixAmt, 0.0, 100.0, 0.0, 1.0));
    }

    return mix(left, right, m);
}

fn hsv2rgb(hsv : vec3<f32>) -> vec3<f32> {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;
    
    let c = v * s;
    let x = c * (1.0 - abs(((h * 6.0) % 2.0) - 1.0));
    let m = v - c;

    var rgb : vec3<f32>;

    if (h < 1.0/6.0) {
        rgb = vec3<f32>(c, x, 0.0);
    } else if (h < 2.0/6.0) {
        rgb = vec3<f32>(x, c, 0.0);
    } else if (h < 3.0/6.0) {
        rgb = vec3<f32>(0.0, c, x);
    } else if (h < 4.0/6.0) {
        rgb = vec3<f32>(0.0, x, c);
    } else if (h < 5.0/6.0) {
        rgb = vec3<f32>(x, 0.0, c);
    } else {
        rgb = vec3<f32>(c, 0.0, x);
    }

    return rgb + vec3<f32>(m, m, m);
}

fn rgb2hsv(rgb : vec3<f32>) -> vec3<f32> {
    let r = rgb.r;
    let g = rgb.g;
    let b = rgb.b;
    
    let max_val = max(r, max(g, b));
    let min_val = min(r, min(g, b));
    let delta = max_val - min_val;

    var h : f32 = 0.0;
    if (delta != 0.0) {
        if (max_val == r) {
            h = (((g - b) / delta) % 6.0) / 6.0;
        } else if (max_val == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else if (max_val == b) {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }
    
    var s : f32 = 0.0;
    if (max_val != 0.0) {
        s = delta / max_val;
    }
    let v = max_val;

    return vec3<f32>(h, s, v);
}

fn vec4_eq(a : vec4<f32>, b : vec4<f32>) -> bool {
    return all(a == b);
}

fn blend_colors(color1 : vec4<f32>, color2 : vec4<f32>, mode : i32, factor_in : f32) -> vec3<f32> {
    var color : vec4<f32>;
    var middle : vec4<f32>;

    let amt = map_range(mixAmt, -100.0, 100.0, 0.0, 1.0);
    var factor = factor_in;

    var a = vec4<f32>(1.0);
    var b = vec4<f32>(1.0);
    if (mode >= 1000) {
        a = vec4<f32>(rgb2hsv(color1.rgb), color1.a);
        b = vec4<f32>(rgb2hsv(color2.rgb), color2.a);
    }

    if (mode == 0) {
        // add
        middle = min(color1 + color2, vec4<f32>(1.0));
    } else if (mode == 1) {
        // alpha
        if (mixAmt < 0.0) {
            return mix(color1,
                       color2 * vec4<f32>(1.0 - color1.a) + color1 * vec4<f32>(color1.a),
                       map_range(mixAmt, -100.0, 0.0, 0.0, 1.0)).rgb;
        } else {
            return mix(color1 * vec4<f32>(1.0 - color2.a) + color2 * vec4<f32>(color2.a),
                       color2,
                       map_range(mixAmt, 0.0, 100.0, 0.0, 1.0)).rgb;
        }
    } else if (mode == 2) {
        // color burn
        if (vec4_eq(color2, vec4<f32>(0.0))) {
            middle = color2;
        } else {
            middle = max((1.0 - ((1.0 - color1) / color2)), vec4<f32>(0.0));
        }
    } else if (mode == 3) {
        // color dodge
        if (vec4_eq(color2, vec4<f32>(1.0))) {
            middle = color2;
        } else {
            middle = min(color1 / (1.0 - color2), vec4<f32>(1.0));
        }
    } else if (mode == 4) {
        // darken
        middle = min(color1, color2);
    } else if (mode == 5) {
        // difference
        middle = abs(color1 - color2);
    } else if (mode == 6) {
        // exclusion
        middle = color1 + color2 - 2.0 * color1 * color2;
    } else if (mode == 7) {
        // glow
        if (vec4_eq(color2, vec4<f32>(1.0))) {
            middle = color2;
        } else {
            middle = min(color1 * color1 / (1.0 - color2), vec4<f32>(1.0));
        }
    } else if (mode == 8) {
        // hard light
        middle = vec4<f32>(blendOverlay(color2.r, color1.r), blendOverlay(color2.g, color1.g), blendOverlay(color2.b, color1.b), mix(color1.a, color2.a, 0.5));
    } else if (mode == 9) {
        // lighten
        middle = max(color1, color2);
    } else if (mode == 10) {
        // mix
        middle = mix(color1, color2, 0.5);
    } else if (mode == 11) {
        // multiply
        middle = color1 * color2;
    } else if (mode == 12) {
        // negation
        middle = vec4<f32>(1.0) - abs(vec4<f32>(1.0) - color1 - color2);
    } else if (mode == 13) {
        // overlay
        middle = vec4<f32>(blendOverlay(color1.r, color2.r), blendOverlay(color1.g, color2.g), blendOverlay(color1.b, color2.b), mix(color1.a, color2.a, 0.5));
    } else if (mode == 14) {
        // phoenix
        middle = min(color1, color2) - max(color1, color2) + vec4<f32>(1.0);
    } else if (mode == 15) {
        // reflect
        if (vec4_eq(color1, vec4<f32>(1.0))) {
            middle = color1;
        } else {
            middle = min(color2 * color2 / (1.0 - color1), vec4<f32>(1.0));
        }
    } else if (mode == 16) {
        // screen
        middle = 1.0 - ((1.0 - color1) * (1.0 - color2));
    } else if (mode == 17) {
        // soft light
        middle = vec4<f32>(blendSoftLight(color1.r, color2.r), blendSoftLight(color1.g, color2.g), blendSoftLight(color1.b, color2.b), mix(color1.a, color2.a, 0.5));
    } else if (mode == 18) {
        // subtract
        middle = max(color1 + color2 - 1.0, vec4<f32>(0.0));
    } else if (mode == 1000) {
        // hue a->b
        middle = vec4<f32>(hsv2rgb(vec3<f32>(b.r, a.g, a.b)), 1.0);
    } else if (mode == 1001) {
        // hue b->a
        middle = vec4<f32>(hsv2rgb(vec3<f32>(a.r, b.g, b.b)), 1.0);
    } else if (mode == 1002) {
        // saturation a->b
        middle = vec4<f32>(hsv2rgb(vec3<f32>(a.r, b.g, a.b)), 1.0);
    } else if (mode == 1003) {
        // saturation b->a
        middle = vec4<f32>(hsv2rgb(vec3<f32>(b.r, a.g, b.b)), 1.0);
    } else if (mode == 1004) {
        // brightness a->b
        middle = vec4<f32>(hsv2rgb(vec3<f32>(a.r, a.g, b.b)), 1.0);
    } else {
        // brightness b->a (mode == 1005)
        middle = vec4<f32>(hsv2rgb(vec3<f32>(b.r, b.g, a.b)), 1.0);
    }

    if (mode >= 1000) {
        middle.a = mix(color1.a, color2.a, 0.5);
    }

    if (factor == 0.5) {
        color = middle;
    } else if (factor < 0.5) {
        factor = map_range(amt, 0.0, 0.5, 0.0, 1.0);
        color = mix(color1, middle, factor);
    } else {
        factor = map_range(amt, 0.5, 1.0, 0.0, 1.0);
        color = mix(middle, color2, factor);
    }

    return color.rgb;
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    var st = position.xy / dims;

    var color = vec4<f32>(0.0, 0.0, 1.0, 1.0);

    if (blendMode == 100) {
        color = cloak(st);
    } else {
        let ra = map_range(refractAAmt, 0.0, 100.0, 0.0, 0.125);
        let rb = map_range(refractBAmt, 0.0, 100.0, 0.0, 0.125);

        let leftColor = textureSample(inputTex, samp, st);
        let rightColor = textureSample(tex, samp, st);

        // refract a->b
        var leftUV = st;
        let rightLen = length(rightColor.rgb) + refractADir / 360.0;
        leftUV.x = leftUV.x + cos(rightLen * TAU) * ra;
        leftUV.y = leftUV.y + sin(rightLen * TAU) * ra;

        // refract b->a
        var rightUV = st;
        let leftLen = length(leftColor.rgb) + refractBDir / 360.0;
        rightUV.x = rightUV.x + cos(leftLen * TAU) * rb;
        rightUV.y = rightUV.y + sin(leftLen * TAU) * rb;

        let color1 = textureSample(inputTex, samp, leftUV);
        let color2 = textureSample(tex, samp, rightUV);

        color = vec4<f32>(blend_colors(color1, color2, blendMode, mixAmt), max(color1.a, color2.a));
    }

    return color;
}
