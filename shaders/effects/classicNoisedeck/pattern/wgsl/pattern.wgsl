/*
 * WGSL pattern generator shader.
 * Creates kaleidoscopic lattices and looped repeats using deterministic PRNG so geometry stays phase-aligned on reload.
 * UI loop controls are converted to normalized angles before use to avoid floating-point drift in long performances.
 */

struct Uniforms {
    data : array<vec4<f32>, 5>,
};
@group(0) @binding(0) var<uniform> uniforms : Uniforms;

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn glsl_mod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

fn glsl_mod_vec2(x: vec2<f32>, y: vec2<f32>) -> vec2<f32> {
    return x - y * floor(x / y);
}

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn pcg(v_in: vec3<u32>) -> vec3<u32> {
    var v = v_in;
    v = v * 1664525u + 1013904223u;

    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;

    v ^= v >> vec3<u32>(16u);

    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;

    return v;
}

fn prng(p: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(pcg(bitcast<vec3<u32>>(floor(p)))) / f32(0xffffffffu);
}

fn rotate2D(st_in: vec2<f32>, rotIn: f32, aspectRatio: f32) -> vec2<f32> {
    var st = st_in;
    let rot = map(rotIn, 0.0, 360.0, 0.0, 2.0);
    let angle = rot * PI;
    st -= vec2<f32>(aspectRatio * 0.5, 0.5);
    let c = cos(angle);
    let s = sin(angle);
    let mat = mat2x2<f32>(c, -s, s, c);
    st = mat * st;
    st += vec2<f32>(aspectRatio * 0.5, 0.5);
    return st;
}

fn skew(st_in: vec2<f32>, rotation: f32, skewAmt: f32, aspectRatio: f32) -> vec2<f32> {
    var st = rotate2D(st_in, rotation, aspectRatio);
    let x = map(skewAmt, -100.0, 100.0, -1.0, 1.0);
    var uv = st;
    uv.x += (st.y * x);
    return uv;
}

fn applyScale(st_in: vec2<f32>, freq: f32, aspectRatio: f32) -> vec2<f32> {
    var st = st_in;
    st -= vec2<f32>(aspectRatio * 0.5, 0.5);
    st *= freq;
    st += vec2<f32>(aspectRatio * 0.5, 0.5);
    st.x -= 0.5 * aspectRatio;
    return st;
}

fn animate(uv_in: vec2<f32>, anim: i32, freq: f32, speed: f32, time: f32, aspectRatio: f32) -> vec2<f32> {
    var uv = uv_in;
    let factor = speed / freq;

    if (anim == 1) {
        uv.y -= time * factor * aspectRatio;
    } else if (anim == 2) {
        uv.x += time * factor;
    } else if (anim == 3) {
        uv.x -= time * factor;
    } else if (anim == 4) {
        uv.y -= time * factor;
    } else if (anim == 5) {
        uv.y += time * factor;
    } else if (anim == 6) {
        uv = rotate2D(uv, -time * speed * 360.0, aspectRatio); 
    } else if (anim == 7) {
        uv = rotate2D(uv, time * speed * 360.0, aspectRatio);
    }
    return uv;
}

fn checkers(st_in: vec2<f32>, aspectRatio: f32) -> f32 {
    var st = st_in;
    st.x -= 0.5 * aspectRatio;
    st = fract(st) - 0.5;
    let d = step(st.x * st.y, 0.0);
    return d;
}

fn waves(st_in: vec2<f32>, lineWidth: f32) -> f32 {
    var st = st_in;
    st.y += cos(st.x * PI) * 0.5;
    return step(map(lineWidth, 1.0, 100.0, 0.001, 0.8), 1.0 - smoothstep(0.0, 1.0, abs(sin(st.y * PI))));
}

fn zigzag(st_in: vec2<f32>, freq: f32, lineWidth: f32) -> f32 {
    var st = fract(st_in);
    st.x = abs(st.x - 0.5);

    let width = map(lineWidth, 1.0, 100.0, 0.02, 0.2);
    let line = step(0.5, glsl_mod(st.x * 2.0, 2.0));
    st.y += (1.0 - 2.0 * line) * (0.25 - st.x);

    let dist = abs(st.y - 0.6) / clamp(width * freq, 0.0, 1.25);
    let alpha = 1.0 - smoothstep(0.5, 0.0, dist);
    return mix(0.0, 0.75, alpha);
}

fn stripes(st: vec2<f32>, lineWidth: f32) -> f32 {
    return step(map(lineWidth, 1.0, 100.0, 0.05, 0.925), fract(st.y));
}

fn rings(st_in: vec2<f32>, freq: f32, rotation: f32, skewAmt: f32, aspectRatio: f32, time: f32, speed: f32, lineWidth: f32) -> f32 {
    let st = skew(st_in, rotation, skewAmt, aspectRatio);
    let dist = length(st - vec2<f32>(0.5 * aspectRatio, 0.5));
    return cos((dist - (time / freq * speed)) * freq * TAU) - map(lineWidth, 1.0, 100.0, -1.0, 0.4);
}

fn dots(st: vec2<f32>) -> f32 {
    return length(fract(st) - 0.5) + 0.05;
}

fn shape(st_in: vec2<f32>, sides: i32) -> f32 {
    let st = st_in * 2.0 - 1.0;
    let a = atan2(st.x, st.y) + PI;
    let r = TAU / f32(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(st);
}

fn squares(st: vec2<f32>) -> f32 {
    return shape(fract(st), 4) - 0.2;
}

fn hexagons(st: vec2<f32>) -> f32 {
    return shape(fract(st), 6) - 0.3;
}

fn hearts(st_in: vec2<f32>, aspectRatio: f32, lineWidth: f32) -> f32 {
    let pulse = 1.0;
    var st = glsl_mod_vec2(st_in, vec2<f32>(aspectRatio, 1.0));
    st -= vec2<f32>(0.5 * aspectRatio, 0.65);
    
    let r = length(st) * 8.0;
    st = normalize(st);
    return r - ((st.y * pow(abs(st.x), 0.75) - 0.25) / (st.y + 1.5) - (2.0) * st.y + 1.26 + pulse) - map(lineWidth, 1.0, 100.0, -0.75, -0.25);
}

fn grid(st_in: vec2<f32>, res: f32) -> f32 {
    return 1.0 - (shape(fract(st_in), 4) - 0.15);
}

fn truchet(st: vec2<f32>, truchetType: i32, seed: i32, time: f32, speed: f32, lineWidth: f32, scale: f32) -> f32 {
    var uv = fract(st) - 0.5;
    let r1 = prng(vec3<f32>(floor(st) + f32(seed) * 1000.0, time * speed));
    // animate only certain tiles
    if (r1.x < 0.5 && r1.y > fract(time * r1.z * speed)) {
        uv.x *= -1.0;
    }

    var soft: f32;
    var dist: f32;
    var mask: f32;
    if (truchetType == 0) {
        dist = abs(abs(uv.x + uv.y) - 0.5);
        dist = dist - map(lineWidth, 1.0, 100.0, 0.1, 0.4);
        soft = 0.01 * scale * fwidth(dist);
        mask = 1.0 - smoothstep(soft, -soft, dist);
    } else {
        let cuv = uv - 0.5 * sign(uv.x + uv.y + 0.001);
        dist = length(cuv);
        dist = abs(dist - 0.5) - map(lineWidth, 1.0, 100.0, 0.05, 0.175);
        soft = 0.01 * scale * fwidth(dist);
        mask = 1.0 - smoothstep(soft, -soft, dist);
    }

    return mask;
} 

fn generate(st_in: vec2<f32>, ptype: i32, freq: f32, animation: i32, speed: f32, time: f32, aspectRatio: f32, rotation: f32, skewAmt: f32, lineWidth: f32, seed: i32, scale: f32) -> f32 {
    var st = st_in;
    let st2 = st;
    
    if (animation == 1) {
        st = skew(st, rotation, skewAmt, aspectRatio);
        st = animate(st, animation, freq, speed, time, aspectRatio);
        st = applyScale(st, freq, aspectRatio);
    } else {
        st = animate(st, animation, freq, speed, time, aspectRatio);
        st = applyScale(st, freq, aspectRatio);
        st = skew(st, rotation, skewAmt, aspectRatio);
    }

    var d: f32 = 0.0;
    if (ptype == 0) {
        d = checkers(st, aspectRatio);
    } else if (ptype == 1) {
        d = dots(st);
    } else if (ptype == 2) {
        d = grid(st, 0.1);
    } else if (ptype == 3) {
        d = hearts(st, aspectRatio, lineWidth);
    } else if (ptype == 4) {
        d = hexagons(st); 
    } else if (ptype == 5) {
        d = rings(st2, freq, rotation, skewAmt, aspectRatio, time, speed, lineWidth);  
    } else if (ptype == 6) {
        d = squares(st);
    } else if (ptype == 7) {
        d = stripes(st, lineWidth);
    } else if (ptype == 8) {
        d = waves(st, lineWidth);
    } else if (ptype == 9) {
        d = zigzag(st, freq, lineWidth);
    } else if (ptype == 10) {
        d = truchet(st, 0, seed, time, speed, lineWidth, scale);
    } else if (ptype == 11) {
        d = truchet(st, 1, seed, time, speed, lineWidth, scale);
    }
    return d;
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let resolution: vec2<f32> = uniforms.data[0].xy;
    let time: f32 = uniforms.data[0].z;
    let seed: i32 = i32(uniforms.data[0].w);
    
    let patternType: i32 = i32(uniforms.data[1].x);
    let scale: f32 = uniforms.data[1].y;
    let skewAmt: f32 = uniforms.data[1].z;
    let rotation: f32 = uniforms.data[1].w;
    
    let lineWidth: f32 = uniforms.data[2].x;
    let animation: i32 = i32(uniforms.data[2].y);
    let speed: f32 = uniforms.data[2].z;
    let sharpness: f32 = uniforms.data[2].w;
    
    let color1: vec3<f32> = uniforms.data[3].xyz;
    let color2: vec3<f32> = uniforms.data[4].xyz;

    let aspectRatio: f32 = resolution.x / resolution.y;
    var st: vec2<f32> = pos.xy / resolution.y;

    let freq: f32 = map(scale, 1.0, 100.0, 40.0, 1.0);
    var d: f32 = generate(st, patternType, freq, animation, speed, time, aspectRatio, rotation, skewAmt, lineWidth, seed, scale);

    let width: f32 = map(lineWidth, 1.0, 100.0, 0.2, 0.48);
    if (patternType == 1 || patternType == 3 || patternType == 4 || patternType == 5 || patternType == 6) {
        let soft: f32 = 0.5 - (sharpness * 0.005) + fwidth(d);
        d = smoothstep(width - soft, width + soft, d);
    } else {
        let soft: f32 = 0.01 * scale * fwidth(d);
        d = smoothstep(width - soft, width + soft, d);
    }

    var color: vec4<f32> = vec4<f32>(0.0, 0.0, 1.0, 1.0);
    color = vec4<f32>(mix(color1, color2, d), 1.0);

    return color;
}
