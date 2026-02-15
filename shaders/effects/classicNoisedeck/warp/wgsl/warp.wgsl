/*
 * Warp distortion shader.
 * Combines pinch, bulge, ripple, and noise-driven offsets to bend the input feed.
 */

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;

// Uniform struct ordered to match runtime uniform packing
struct Uniforms {
    time: f32,           // global
    deltaTime: f32,      // global
    frame: i32,          // global
    _pad0: f32,          // padding for alignment before vec2
    resolution: vec2f,   // global (8-byte aligned)
    aspect: f32,         // global
    // effect params from definition order:
    distortionType: i32,
    flip: i32,
    scale: f32,
    rotateAmt: f32,
    strength: f32,
    seed: i32,
    wrap: i32,
    center: f32,
    aspectLens: i32,
    speed: i32,
    rotation: i32,
}

@group(0) @binding(2) var<uniform> u: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn getAspectRatio() -> f32 {
    return u.resolution.x / u.resolution.y;
}

fn mapVal(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

// PCG PRNG
fn pcg3(v_in: vec3u) -> vec3u {
    var v = v_in * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> vec3u(16u);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

fn prng(p: vec3f) -> vec3f {
    var pp = p;
    if (pp.x < 0.0) { pp.x = -pp.x * 2.0 + 1.0; } else { pp.x = pp.x * 2.0; }
    if (pp.y < 0.0) { pp.y = -pp.y * 2.0 + 1.0; } else { pp.y = pp.y * 2.0; }
    if (pp.z < 0.0) { pp.z = -pp.z * 2.0 + 1.0; } else { pp.z = pp.z * 2.0; }
    return vec3f(pcg3(vec3u(pp))) / f32(0xffffffffu);
}

fn rotate2D(uv_in: vec2f, rot: f32) -> vec2f {
    let aspectRatio = getAspectRatio();
    var uv = uv_in;
    uv.x *= aspectRatio;
    let angle = rot * PI;
    uv -= vec2f(0.5 * aspectRatio, 0.5);
    let c = cos(angle);
    let s = sin(angle);
    uv = vec2f(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
    uv += vec2f(0.5 * aspectRatio, 0.5);
    uv.x /= aspectRatio;
    return uv;
}

fn smootherstep(x: f32) -> f32 {
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

fn smoothlerp(x: f32, a: f32, b: f32) -> f32 {
    return a + smootherstep(x) * (b - a);
}

fn grid(st: vec2f, cell: vec2f) -> f32 {
    let angle = prng(vec3f(cell, 1.0)).r * TAU + u.time * TAU * f32(u.speed);
    let gradient = vec2f(cos(angle), sin(angle));
    let dist = st - cell;
    return dot(gradient, dist);
}

fn perlinNoise(st: vec2f, noiseScale: vec2f) -> f32 {
    let scaled = st * noiseScale;
    let cell = floor(scaled);    
    let tl = grid(scaled, cell);
    let tr = grid(scaled, vec2f(cell.x + 1.0, cell.y));
    let bl = grid(scaled, vec2f(cell.x, cell.y + 1.0));
    let br = grid(scaled, cell + 1.0);    
    let upper = smoothlerp(scaled.x - cell.x, tl, tr);
    let lower = smoothlerp(scaled.x - cell.x, bl, br);
    let val = smoothlerp(scaled.y - cell.y, upper, lower);    
    return val * 0.5 + 0.5;
}

fn pinch(uv_in: vec2f) -> vec2f {
    let aspectRatio = getAspectRatio();
    let intensity = u.strength * 0.01;
    var uv = uv_in - 0.5;

    if (u.aspectLens != 0) {
        uv.x *= aspectRatio;
    }

    let r = length(uv);
    let effect = pow(r, 1.0 - intensity);
    uv = normalize(uv) * effect;

    if (u.aspectLens != 0) {
        uv.x /= aspectRatio;
    }

    return uv + 0.5;
}

fn bulge(uv_in: vec2f) -> vec2f {
    let aspectRatio = getAspectRatio();
    let intensity = u.strength * -0.01;
    var uv = uv_in - 0.5;

    if (u.aspectLens != 0) {
        uv.x *= aspectRatio;
    }

    let r = length(uv);
    let effect = pow(r, 1.0 - intensity);
    uv = normalize(uv) * effect;

    if (u.aspectLens != 0) {
        uv.x /= aspectRatio;
    }

    return uv + 0.5;
}

fn spiral(uv_in: vec2f, direction: f32) -> vec2f {
    let aspectRatio = getAspectRatio();
    var uv = uv_in - 0.5;

    if (u.aspectLens != 0) {
        uv.x *= aspectRatio;
    }

    let r = length(uv);
    var a = atan2(uv.y, uv.x);
    let spiralAmt = (u.strength * 0.05) * r * direction;
    a += spiralAmt - (u.time * TAU * f32(u.rotation) * direction);

    uv = vec2f(cos(a), sin(a)) * r;

    if (u.aspectLens != 0) {
        uv.x /= aspectRatio;
    }

    return uv + 0.5;
}

fn smod(v: f32, m: f32) -> f32 {
    return m * (0.75 - abs(fract(v) - 0.5) - 0.25);
}

fn smod2(v: vec2f, m: f32) -> vec2f {
    return m * (0.75 - abs(fract(v) - 0.5) - 0.25);
}

fn polar(uv_in: vec2f) -> vec2f {
    let aspectRatio = getAspectRatio();
    var uv = uv_in;
    if (u.aspectLens != 0) {
        uv.x *= aspectRatio;
        uv -= vec2f(0.5 * aspectRatio, 0.5);
    } else {
        uv -= 0.5;
    }

    var coord = vec2f(atan2(uv.y, uv.x)/TAU + 0.5, length(uv) - u.scale * 0.075);
    coord.x = smod(coord.x + u.time * f32(-u.rotation), 1.0);
    coord.y = smod(coord.y + u.time * f32(u.speed), 1.0);
    return coord;
}

fn vortex(uv_in: vec2f) -> vec2f {
    let aspectRatio = getAspectRatio();
    var uv = uv_in;
    if (u.aspectLens != 0) {
        uv.x *= aspectRatio;
        uv -= vec2f(0.5 * aspectRatio, 0.5);
    } else {
        uv -= 0.5;
    }

    let r2 = dot(uv, uv) - u.scale * 0.01;
    uv = uv / r2;
    uv.x = smod(uv.x + u.time * f32(-u.rotation), 1.0);
    uv.y = smod(uv.y + u.time * f32(u.speed), 1.0);
    return uv;
}

fn waves(uv_in: vec2f) -> vec2f {
    var uv = uv_in;
    uv.y += sin(uv.x * u.scale * 10.0 + u.time * TAU * f32(u.speed)) * (u.strength * 0.001);
    return uv;
}

fn perlinWarp(uv_in: vec2f) -> vec2f {
    let aspectRatio = getAspectRatio();
    var uv = uv_in;
    uv.x += (perlinNoise(uv * vec2f(aspectRatio, 1.0) + f32(u.seed), vec2f(abs(u.scale * 3.0))) - 0.5) * u.strength * 0.01;
    uv.y += (perlinNoise(uv * vec2f(aspectRatio, 1.0) + f32(u.seed) + 10.0, vec2f(abs(u.scale * 3.0))) - 0.5) * u.strength * 0.01;
    return uv;
}

fn flipMirror(uv_in: vec2f) -> vec2f {
    var uv = uv_in;
    if (u.flip == 1) {
        uv.x = 1.0 - uv.x;
        uv.y = 1.0 - uv.y;
    } else if (u.flip == 2) {
        uv.x = 1.0 - uv.x;
    } else if (u.flip == 3) {
        uv.y = 1.0 - uv.y;
    } else if (u.flip == 11) {
        if (uv.x > 0.5) { uv.x = 1.0 - uv.x; }
    } else if (u.flip == 12) {
        if (uv.x < 0.5) { uv.x = 1.0 - uv.x; }
    } else if (u.flip == 13) {
        if (uv.y > 0.5) { uv.y = 1.0 - uv.y; }
    } else if (u.flip == 14) {
        if (uv.y < 0.5) { uv.y = 1.0 - uv.y; }
    } else if (u.flip == 15) {
        if (uv.x > 0.5) { uv.x = 1.0 - uv.x; }
        if (uv.y > 0.5) { uv.y = 1.0 - uv.y; }
    } else if (u.flip == 16) {
        if (uv.x > 0.5) { uv.x = 1.0 - uv.x; }
        if (uv.y < 0.5) { uv.y = 1.0 - uv.y; }
    } else if (u.flip == 17) {
        if (uv.x < 0.5) { uv.x = 1.0 - uv.x; }
        if (uv.y > 0.5) { uv.y = 1.0 - uv.y; }
    } else if (u.flip == 18) {
        if (uv.x < 0.5) { uv.x = 1.0 - uv.x; }
        if (uv.y < 0.5) { uv.y = 1.0 - uv.y; }
    }
    return uv;
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let aspectRatio = getAspectRatio();
    var uv = fragCoord.xy / u.resolution;

    uv = rotate2D(uv, u.rotateAmt / 180.0);
    uv = flipMirror(uv);

    if (u.distortionType == 0) {
        uv = polar(uv);
    } else if (u.distortionType == 1) {
        uv = vortex(uv);
    } else if (u.distortionType == 2) {
        uv = waves(uv);
    } else if (u.distortionType == 10) {
        uv = perlinWarp(uv);
    } else if (u.distortionType == 20) {
        uv = pinch(uv);
    } else if (u.distortionType == 21) {
        uv = bulge(uv);
    } else if (u.distortionType == 30) {
        uv = spiral(uv, 1.0);
    } else if (u.distortionType == 31) {
        uv = spiral(uv, -1.0);
    }

    if (u.wrap == 1) {
        // repeat
        uv = uv % vec2f(1.0);
    } else if (u.wrap == 2) {
        // clamp
        uv = clamp(uv, vec2f(0.0), vec2f(1.0));
    }
    // wrap == 0 is mirror (default - just use raw coords)

    uv = rotate2D(uv, -u.rotateAmt / 180.0);

    var color = textureSample(inputTex, samp, uv);

    // apply center brightening/darkening for polar or vortex
    if (u.distortionType == 0 || u.distortionType == 1) {
        let centerUV = fragCoord.xy / u.resolution.y;
        var centerMask = length(centerUV - vec2f(0.5 * aspectRatio, 0.5)) * 2.0;
        centerMask = clamp(pow(centerMask, abs(u.center) * 0.25), 0.0, 1.0);

        if (u.center < 0.0) {
            color = vec4f(color.rgb * centerMask, color.a);
        } else if (u.center > 0.0) {
            color = vec4f(clamp(color.rgb + 1.0 - centerMask, vec3f(0.0), vec3f(1.0)), color.a);
        }
    }

    return color;
}
