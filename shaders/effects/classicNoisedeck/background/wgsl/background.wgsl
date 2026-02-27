// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> backgroundType: i32;
@group(0) @binding(2) var<uniform> rotation: f32;
@group(0) @binding(3) var<uniform> alpha: f32;
@group(0) @binding(4) var<uniform> color1: vec4<f32>;
@group(0) @binding(5) var<uniform> color2: vec4<f32>;

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn rotate2D(coord: vec2<f32>, rot: f32, aspect: f32) -> vec2<f32> {
    var st: vec2<f32> = coord;
    let angle: f32 = map(rot, -180.0, 180.0, -1.0, 1.0) * 3.14159265359;
    st.x = st.x * aspect;
    st = st - vec2<f32>(aspect * 0.5, 0.5);
    let s: f32 = sin(angle);
    let c: f32 = cos(angle);
    st = mat2x2<f32>(c, -s, s, c) * st;
    st = st + vec2<f32>(aspect * 0.5, 0.5);
    st.x = st.x / aspect;
    return st;
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    var st: vec2<f32> = pos.xy / resolution;
    let aspectRatio: f32 = resolution.x / resolution.y;
    var centered: vec2<f32> = st * vec2<f32>(aspectRatio, 1.0);
    centered = centered - vec2<f32>(aspectRatio * 0.5, 0.5);

    st = rotate2D(st, rotation, aspectRatio);

    var color: vec4<f32> = color1;
    
    // Note: WGSL switch cases must be constants. 
    // If backgroundType is uniform, we might need if/else chain if the compiler doesn't support switch on uniform.
    // But usually it's fine. If not, we'll convert to if/else.
    // For safety and similarity to GLSL, I'll use if/else chain or switch.
    // WGSL switch requires integer selector.
    
    switch backgroundType {
        case 0: {
            color = color1;
        }
        case 10: {
            color = mix(color2, color1, st.y);
        }
        case 11: {
            color = mix(color1, color2, st.y);
        }
        case 20: {
            color = mix(color1, color2, st.x);
        }
        case 21: {
            color = mix(color2, color1, st.x);
        }
        case 30: {
            color = mix(color1, color2, length(centered));
        }
        case 31: {
            color = mix(color2, color1, length(centered));
        }
        default: {
            color = color1;
        }
    }

    color.a = alpha * 0.01;

    return color;
}
