// Tunnel shader.
// Builds a perspective tunnel with noise-driven offsets for motion depth.
// Ported from GLSL to WGSL

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;

struct Uniforms {
    time: f32,
    seed: i32,
    aspectLens: i32,
    distortionType: i32,
    speed: f32,
    rotation: f32,
    center: f32,
    scale: f32,
    flip: i32,
}

@group(0) @binding(2) var<uniform> u : Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn getAspectRatio() -> f32 {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    return dims.x / dims.y;
}

fn mapRange(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn smod_scalar(v: f32, m: f32) -> f32 {
    return m * (0.75 - abs(fract(v) - 0.5) - 0.25);
}

fn smod_vec2(v: vec2<f32>, m: f32) -> vec2<f32> {
    return m * (0.75 - abs(fract(v) - 0.5) - 0.25);
}

fn shape(uv: vec2<f32>, sides: i32) -> f32 {
    let a = atan2(uv.x, uv.y) + PI;
    let r = TAU / f32(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(uv);
}

fn flipMirror(uv_in: vec2<f32>, flip: i32) -> vec2<f32> {
    var uv = uv_in;
    
    if (flip == 1) {
        // flip both
        uv.x = 1.0 - uv.x;
        uv.y = 1.0 - uv.y;
    } else if (flip == 2) {
        // flip h
        uv.x = 1.0 - uv.x;
    } else if (flip == 3) {
        // flip v
        uv.y = 1.0 - uv.y;
    } else if (flip == 11) {
        // mirror lr
        if (uv.x > 0.5) {
            uv.x = 1.0 - uv.x;
        }
    } else if (flip == 12) {
        // mirror rl
        if (uv.x < 0.5) {
            uv.x = 1.0 - uv.x;
        }
    } else if (flip == 13) {
        // mirror ud
        if (uv.y > 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (flip == 14) {
        // mirror du
        if (uv.y < 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (flip == 15) {
        // mirror lr ud
        if (uv.x > 0.5) {
            uv.x = 1.0 - uv.x;
        }
        if (uv.y > 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (flip == 16) {
        // mirror lr du
        if (uv.x > 0.5) {
            uv.x = 1.0 - uv.x;
        }
        if (uv.y < 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (flip == 17) {
        // mirror rl ud
        if (uv.x < 0.5) {
            uv.x = 1.0 - uv.x;
        }
        if (uv.y > 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (flip == 18) {
        // mirror rl du
        if (uv.x < 0.5) {
            uv.x = 1.0 - uv.x;
        }
        if (uv.y < 0.5) {
            uv.y = 1.0 - uv.y;
        }
    }
    
    return uv;
}

fn tunnel(uv_in: vec2<f32>, fragCoord: vec2<f32>) -> vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let aspectRatio = dims.x / dims.y;
    
    var uv = uv_in;
    var uv2 = fragCoord / dims; // shape coordinates
    
    if (u.aspectLens != 0) {
        uv.x *= aspectRatio;
        uv = uv - vec2<f32>(0.5 * aspectRatio, 0.5);
        uv2 = vec2<f32>(uv2.x * aspectRatio * 2.0 - aspectRatio, uv2.y * 2.0 - 1.0);
    } else {
        uv = uv - 0.5;
        uv2 = uv2 * 2.0 - 1.0;
    }
    
    let a = atan2(uv.y, uv.x);
    var r: f32 = 0.0;
    
    if (u.distortionType == 0) {
        // circle
        r = length(uv);
    } else if (u.distortionType == 1) {
        // triangle
        r = shape(uv2, 3);
    } else if (u.distortionType == 2) {
        // rounded square
        let uv8 = uv * uv * uv * uv * uv * uv * uv * uv;
        r = pow(uv8.x + uv8.y, 1.0 / 8.0);
    } else if (u.distortionType == 3) {
        // square
        r = shape(uv2, 4);
    } else if (u.distortionType == 4) {
        // hexagon
        r = shape(uv2, 6);
    } else if (u.distortionType == 5) {
        // octagon
        r = shape(uv2, 8);
    }
    
    r = r - u.scale * 0.075;
    
    let coords = smod_vec2(vec2<f32>(0.3 / r + u.time * u.speed, a / PI + u.time * -u.rotation), 1.0);
    
    // Sample texture - note: WGSL doesn't have textureGrad, using regular sample
    var color = textureSample(inputTex, samp, coords);
    
    // center
    let c = clamp(r * 2.0, 0.0, 1.0);
    if (u.center < 0.0) {
        color = vec4<f32>(mix(color.rgb, color.rgb * c, -u.center * 0.2), max(color.a, (1.0 - c) * mapRange(u.center, -5.0, 0.0, 1.0, 0.0)));
    } else if (u.center > 0.0) {
        color = vec4<f32>(mix(color.rgb, color.rgb + (1.0 - c), u.center * 0.2), max(color.a, (1.0 - c) * mapRange(u.center, -5.0, 0.0, 1.0, 0.0)));
    }
    
    return color;
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    var uv = fragCoord.xy / dims;

    uv = flipMirror(uv, u.flip);
    
    let color = tunnel(uv, fragCoord.xy);
    
    return color;
}
