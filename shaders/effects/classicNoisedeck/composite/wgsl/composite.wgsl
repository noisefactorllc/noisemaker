/*
 * Composite blend shader (WGSL fragment version).
 * Implements keyed, splash, and channel-driven blends so two synth feeds can be merged under precise color controls.
 * HSV conversions and distance checks are tuned for normalized inputs to keep greenscreen thresholds consistent between GPUs.
 */

const PI : f32 = 3.14159265359;
const TAU : f32 = 6.28318530718;

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> inputColor : vec3<f32>;
@group(0) @binding(4) var<uniform> blendMode : i32;
@group(0) @binding(5) var<uniform> range : f32;
@group(0) @binding(6) var<uniform> mixAmt : f32;

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

fn desaturate(color : vec3<f32>) -> vec3<f32> {
    var c = rgb2hsv(color);
    c.y = 0.0;
    return hsv2rgb(c);
}

fn blend_colors(color1_in : vec3<f32>, color2_in : vec3<f32>) -> vec3<f32> {
    var color = vec3<f32>(0.0);
    var color1 = color1_in;
    var color2 = color2_in;
    let cut = range * 0.01;

    if (blendMode == 0) {
        // color splash. isolate input color and desaturate others
        if (distance(inputColor, color1) > range * 0.01) {
            color1 = desaturate(color1);
        }

        if (distance(inputColor, color2) > range * 0.01) {
            color2 = desaturate(color2);
        }

        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 1) {
        // greenscreen a -> b. make color transparent
        if (distance(inputColor, color1) <= range * 0.01) {
            color = color2;
        } else {
            color = mix(color1, color2, mixAmt * 0.01);
        }
    } else if (blendMode == 2) {
        // greenscreen b-> a. make color transparent
        if (distance(inputColor, color2) <= range * 0.01) {
            color = color1;
        } else {
            color = mix(color2, color1, mixAmt * 0.01);
        }
    } else if (blendMode == 3) {
        // a -> b black
        let c = 1.0 - step(cut, desaturate(color2).r);
        color2 = mix(color1, vec3<f32>(0.0), c);
        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 4) {
        // a -> b color black
        let c = 1.0 - step(vec3<f32>(cut), color2);
        color2 = mix(color1, vec3<f32>(0.0), c);
        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 5) {
        // a -> b hue
        let c = rgb2hsv(color2).r;
        color2 = mix(color1, color2, c * cut);
        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 6) {
        // a -> b saturation
        let c = rgb2hsv(color2).g;
        color2 = mix(color1, color2, c * cut);
        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 7) {
        // a -> b value
        let c = rgb2hsv(color2).b;
        color2 = mix(color1, color2, c * cut);
        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 8) {
        // b -> a black
        let c = 1.0 - step(cut, desaturate(color1).r);
        color1 = mix(color2, vec3<f32>(0.0), c);
        color = mix(color2, color1, mixAmt * 0.01);
    } else if (blendMode == 9) {
        // b -> a color black
        let c = 1.0 - step(vec3<f32>(cut), color1);
        color1 = mix(color2, vec3<f32>(0.0), c);
        color = mix(color2, color1, mixAmt * 0.01);
    } else if (blendMode == 10) {
        // b -> a hue
        let c = rgb2hsv(color1).r;
        color1 = mix(color1, color2, c * cut);
        color = mix(color2, color1, mixAmt * 0.01);
    } else if (blendMode == 11) {
        // b -> a saturation
        let c = rgb2hsv(color1).g;
        color1 = mix(color1, color2, c * cut);
        color = mix(color2, color1, mixAmt * 0.01);
    } else if (blendMode == 12) {
        // b -> a value
        let c = rgb2hsv(color1).b;
        color1 = mix(color1, color2, c * cut);
        color = mix(color2, color1, mixAmt * 0.01);
    } else if (blendMode == 13) {
        // mix
        color2 = mix(color1, color2, cut);
        color = mix(color1, color2, mixAmt * 0.01);
    } else if (blendMode == 14) {
        // psychedelic
        let c = step(vec3<f32>(cut), mix(color1, color2, 0.5));
        color2 = mix(color1, color2, c);
        color = mix(color1, color2, mixAmt * 0.01);
    } else {
        // psychedelic 2 (blendMode == 15)
        let c1 = smoothstep(color1, vec3<f32>(cut), color2);
        let c2 = smoothstep(color2, vec3<f32>(cut), color1);
        color = mix(c1.brg, c2.gbr, mixAmt * 0.01);
    }

    return color;
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    var st = position.xy / dims;

    let color1 = textureSample(inputTex, samp, st);
    let color2 = textureSample(tex, samp, st);

    var color = vec4<f32>(0.0, 0.0, 1.0, 1.0);
    color = vec4<f32>(blend_colors(color1.rgb, color2.rgb), mix(color1.a, color2.a, mixAmt * 0.01));

    return color;
}
