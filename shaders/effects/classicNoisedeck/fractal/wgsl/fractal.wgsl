/*
 * WGSL fractal explorer shader.
 * Matches the GLSL fractal math, including smooth coloring and bailout logic, for cross-backend parity.
 * Normalization of zoom and offset inputs keeps the complex plane mapping consistent between WebGL and WebGPU.
 */

struct Uniforms {
    // Contiguous vec4 packing for easier uniform buffer mapping:
    // 0: resolution.xy, time, (unused)
    // 1: fractalType, symmetry, offsetX, offsetY
    // 2: centerX, centerY, zoomAmt, speed
    // 3: rotation, iterations, mode, colorMode
    // 4: paletteMode, cyclePalette, rotatePalette, repeatPalette
    // 5: paletteOffset.xyz, hueRange
    // 6: paletteAmp.xyz, levels
    // 7: paletteFreq.xyz, backgroundOpacity
    // 8: palettePhase.xyz, cutoff
    // 9: backgroundColor.xyz, (unused)
    data: array<vec4<f32>, 10>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn modulo(a: f32, b: f32) -> f32 {
    return a - b * floor(a / b);
}

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn rotate2D(st0: vec2<f32>, rot: f32, aspect: f32) -> vec2<f32> {
    var st = st0;
    let r = map(rot, 0.0, 360.0, 0.0, 2.0);
    let angle = r * PI;
    st = st - vec2<f32>(0.5 * aspect, 0.5);
    let s = sin(angle);
    let c = cos(angle);
    st = mat2x2<f32>(c, s, -s, c) * st;
    st = st + vec2<f32>(0.5 * aspect, 0.5);
    return st;
}

fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;
    let c = v * s;
    let x = c * (1.0 - abs(modulo(h * 6.0, 2.0) - 1.0));
    let m = v - c;
    var rgb = vec3<f32>(0.0, 0.0, 0.0);
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
    var srgb = vec3<f32>(0.0, 0.0, 0.0);
    for (var i: i32 = 0; i < 3; i = i + 1) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

// oklab transform and inverse - Public Domain/MIT License
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

fn oklab_from_linear_srgb(c: vec3<f32>) -> vec3<f32> {
    let lms = invB * c;
    return invA * (sign(lms) * pow(abs(lms), vec3<f32>(0.3333333333333)));
}

fn linear_srgb_from_oklab(c: vec3<f32>) -> vec3<f32> {
    let lms = fwdA * c;
    return fwdB * (lms * lms * lms);
}
// end oklab

fn pal(t0: f32, paletteOffset: vec3<f32>, paletteAmp: vec3<f32>, paletteFreq: vec3<f32>, palettePhase: vec3<f32>, paletteMode: i32) -> vec3<f32> {
    let color = paletteOffset + paletteAmp * cos(TAU * (paletteFreq * t0 + palettePhase));
    var col = color;
    if (paletteMode == 1) {
        col = hsv2rgb(col);
    } else if (paletteMode == 2) {
        col.g = col.g * -0.509 + 0.276;
        col.b = col.b * -0.509 + 0.198;
        col = linear_srgb_from_oklab(col);
        col = linearToSrgb(col);
    }
    return col;
}

fn fx(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(pow(z.x, 3.0) - 3.0 * z.x * pow(z.y, 2.0) - 1.0, 3.0 * pow(z.x, 2.0) * z.y - pow(z.y, 3.0));
}

fn fpx(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(3.0 * pow(z.x, 2.0) - 3.0 * pow(z.y, 2.0), 6.0 * z.x * z.y);
}

fn divide(z1: vec2<f32>, z2: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(
        (z1.x * z2.x + z1.y * z2.y) / (pow(z2.x, 2.0) + pow(z2.y, 2.0)),
        (z1.y * z2.x - z1.x * z2.y) / (pow(z2.x, 2.0) + pow(z2.y, 2.0))
    );
}

fn newton(st0: vec2<f32>, maxIter: i32, offsetX: f32, offsetY: f32, speed: f32, centerX: f32, centerY: f32, zoomAmt: f32, rotation: f32, time: f32, mode: i32, aspect: f32) -> f32 {
    var st = rotate2D(st0, rotation + 90.0, aspect);
    st = st - vec2<f32>(0.5 * aspect, 0.5);
    st = st * map(zoomAmt, 0.0, 130.0, 1.0, 0.01);
    let s = map(speed, 0.0, 100.0, 0.0, 1.0);
    let offX = map(offsetX, -100.0, 100.0, -0.25, 0.25);
    let offY = map(offsetY, -100.0, 100.0, -0.25, 0.25);
    st.x = st.x + centerY * 0.01;
    st.y = st.y + centerX * 0.01;
    var n = st;
    var iterCount = 0.0;
    var tst = vec2<f32>(0.0, 0.0);
    for (var i: i32 = 0; i < maxIter; i = i + 1) {
        tst = divide(fx(n), fpx(n));
        tst = tst + vec2<f32>(sin(time * TAU), cos(time * TAU)) * 0.1 * s;
        tst = tst + vec2<f32>(offX, offY);
        if (length(tst) < 0.001) {
            break;
        }
        n = n - tst;
        iterCount = iterCount + 1.0;
    }
    if (mode == 0) {
        if (maxIter == 0) {
            return 0.0;
        }
        return iterCount / f32(maxIter);
    } else {
        return length(n);
    }
}

fn julia(st0: vec2<f32>, zoomAmt: f32, speed: f32, offsetX: f32, offsetY: f32, rotation: f32, centerX: f32, centerY: f32, maxIter: i32, cutoff: f32, time: f32, mode: i32, aspect: f32) -> f32 {
    let zoom = map(zoomAmt, 0.0, 100.0, 2.0, 0.5);
    let speedy = map(speed, 0.0, 100.0, 0.0, 1.0);
    let s = mix(speedy * 0.05, speedy * 0.125, speedy);
    let _offsetX = map(offsetX, -100.0, 100.0, -0.5, 0.5);
    let _offsetY = map(offsetY, -100.0, 100.0, -1.0, 1.0);
    let c = vec2<f32>(sin(time * TAU) * s + _offsetX, cos(time * TAU) * s + _offsetY);
    var st = rotate2D(st0, rotation, aspect);
    st = (st - vec2<f32>(0.5 * aspect, 0.5)) * zoom;
    var z = vec2<f32>(
        st.x + map(centerX, -100.0, 100.0, 1.0, -1.0),
        st.y + map(centerY, -100.0, 100.0, 1.0, -1.0)
    );
    var iterCount = 0;
    let iterScaled = maxIter * 2;
    for (var i: i32 = 0; i < iterScaled; i = i + 1) {
        iterCount = i;
        let x = (z.x * z.x - z.y * z.y) + c.x;
        let y = (z.y * z.x + z.x * z.y) + c.y;
        if ((x * x + y * y) > 4.0) {
            break;
        }
        z.x = x;
        z.y = y;
    }
    if ((iterScaled - iterCount) < i32(cutoff)) {
        return 1.0;
    }
    if (mode == 0) {
        if (iterScaled == 0) {
            return 0.0;
        }
        return f32(iterCount) / f32(iterScaled);
    } else {
        return length(z);
    }
}

fn mandelbrot(st0: vec2<f32>, zoomAmt: f32, speed: f32, rotation: f32, centerX: f32, centerY: f32, iter: i32, time: f32, mode: i32, aspect: f32) -> f32 {
    let zoom = map(zoomAmt, 0.0, 100.0, 2.0, 0.5);
    let speedy = map(speed, 0.0, 100.0, 0.0, 1.0);
    let s = mix(speedy * 0.05, speedy * 0.125, speedy);
    var st = rotate2D(st0, rotation, aspect);
    st.y = st.y * 2.0 - 1.0;
    st.x = st.x * 2.0 - aspect;
    var z = vec2<f32>(0.0, 0.0);
    var c = zoom * st - vec2<f32>(centerX + 50.0, centerY) * 0.01;
    z = z + vec2<f32>(sin(time * TAU), cos(time * TAU)) * s;
    var i = 0.0;
    for (i = 0.0; i < f32(iter); i = i + 1.0) {
        let m = mat2x2<f32>(z.x, z.y, -z.y, z.x);
        z = m * z + c;
        if (dot(z, z) > 16.0) {
            break;
        }
    }
    if (i == f32(iter)) {
        return 1.0;
    }
    if (mode == 0) {
        return i / f32(iter);
    } else {
        return length(z) / f32(iter);
    }
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = uniforms.data[0].xy;
    let time = uniforms.data[0].z;
    let fractalType = i32(uniforms.data[1].x);
    let symmetry = i32(uniforms.data[1].y); // unused
    let offsetX = uniforms.data[1].z;
    let offsetY = uniforms.data[1].w;
    let centerX = uniforms.data[2].x;
    let centerY = uniforms.data[2].y;
    let zoomAmt = uniforms.data[2].z;
    let speed = uniforms.data[2].w;
    let rotation = uniforms.data[3].x;
    let iterations = i32(uniforms.data[3].y);
    let mode = i32(uniforms.data[3].z);
    let colorMode = i32(uniforms.data[3].w);

    let paletteMode = i32(uniforms.data[4].x);
    let cyclePalette = i32(uniforms.data[4].y);
    let rotatePalette = uniforms.data[4].z;
    let repeatPalette = uniforms.data[4].w;
    var paletteOffset = uniforms.data[5].xyz;
    let hueRange = uniforms.data[5].w;
    var paletteAmp = uniforms.data[6].xyz;
    let levels = uniforms.data[6].w;
    var paletteFreq = uniforms.data[7].xyz;
    let backgroundOpacity = uniforms.data[7].w;
    var palettePhase = uniforms.data[8].xyz;
    let cutoff = uniforms.data[8].w;
    let backgroundColor = uniforms.data[9].xyz;
    let aspect = resolution.x / resolution.y;

    var color = vec4<f32>(0.0, 0.0, 1.0, 1.0);
    var st = pos.xy / resolution.y;
    var d = 0.0;
    if (fractalType == 0) {
        d = julia(st, zoomAmt, speed, offsetX, offsetY, rotation, centerX, centerY, iterations, cutoff, time, mode, aspect);
    } else if (fractalType == 1) {
        d = newton(st, iterations, offsetX, offsetY, speed, centerX, centerY, zoomAmt, rotation, time, mode, aspect);
    } else {
        d = mandelbrot(st, zoomAmt, speed, rotation, centerX, centerY, iterations, time, mode, aspect);
    }
    if (d == 1.0) {
        color = vec4<f32>(backgroundColor, backgroundOpacity * 0.01);
    } else {
        var dd = d;
        if (cyclePalette == -1) {
            dd = dd - time;
        } else if (cyclePalette == 1) {
            dd = dd + time;
        }
        dd = dd * repeatPalette + rotatePalette * 0.01;
        dd = fract(dd);
        if (levels > 0.0) {
            let lev = levels + 1.0;
            dd = floor(dd * lev) / lev;
        }
        if (colorMode == 0) {
            color = vec4<f32>(vec3<f32>(fract(dd)), color.a);
        } else if (colorMode == 4) {
            color = vec4<f32>(pal(dd, paletteOffset, paletteAmp, paletteFreq, palettePhase, paletteMode), color.a);
        } else if (colorMode == 6) {
            let d2 = dd * (hueRange * 0.01);
            color = vec4<f32>(hsv2rgb(vec3<f32>(d2, 1.0, 1.0)), color.a);
        }
    }
    var st2 = pos.xy / resolution;

    return color;
}
