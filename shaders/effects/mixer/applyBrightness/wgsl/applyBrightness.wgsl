@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> mixAmt : f32;

fn map_range(value : f32, inMin : f32, inMax : f32, outMin : f32, outMax : f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn rgb2hsv(c : vec3<f32>) -> vec3<f32> {
    let K = vec4<f32>(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    var p : vec4<f32>;
    if (c.b > c.g) {
        p = vec4<f32>(c.bg, K.wz);
    } else {
        p = vec4<f32>(c.gb, K.xy);
    }
    var q : vec4<f32>;
    if (p.x > c.r) {
        q = vec4<f32>(p.xyw, c.r);
    } else {
        q = vec4<f32>(c.r, p.yzx);
    }
    let d = q.x - min(q.w, q.y);
    let e = 1.0e-10;
    return vec3<f32>(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

fn hsv2rgb(c : vec3<f32>) -> vec3<f32> {
    let K = vec4<f32>(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    var st = position.xy / dims;
    

    let color1 = textureSample(inputTex, samp, st);
    let color2 = textureSample(tex, samp, st);

    // applyBrightness blend: hue/sat from A, value from B
    let a = rgb2hsv(color1.rgb);
    let b = rgb2hsv(color2.rgb);
    let middle = vec4<f32>(hsv2rgb(vec3<f32>(a.x, a.y, b.z)), 1.0);

    let amt = map_range(mixAmt, -100.0, 100.0, 0.0, 1.0);
    var color : vec4<f32>;
    if (amt < 0.5) {
        let factor = amt * 2.0;
        color = mix(color1, middle, factor);
    } else {
        let factor = (amt - 0.5) * 2.0;
        color = mix(middle, color2, factor);
    }

    color.a = max(color1.a, color2.a);
    return color;
}
