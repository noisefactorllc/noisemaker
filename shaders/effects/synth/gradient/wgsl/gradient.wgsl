// WGSL version – WebGPU

/*
 * Gradient generator shader.
 * Renders linear, radial, conic, and four corners gradients with rotation and repeat.
 */

@group(0) @binding(0) var<uniform> resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> gradientType: i32;
@group(0) @binding(2) var<uniform> rotation: f32;
@group(0) @binding(3) var<uniform> repeatCount: i32;
@group(0) @binding(4) var<uniform> color1: vec3<f32>;
@group(0) @binding(5) var<uniform> color2: vec3<f32>;
@group(0) @binding(6) var<uniform> color3: vec3<f32>;
@group(0) @binding(7) var<uniform> color4: vec3<f32>;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn rotate2D(st: vec2<f32>, angle: f32) -> vec2<f32> {
    let aspectRatio = resolution.x / resolution.y;
    var coord = st;
    coord.x = coord.x * aspectRatio;
    coord = coord - vec2<f32>(aspectRatio * 0.5, 0.5);
    let c = cos(angle);
    let s = sin(angle);
    coord = mat2x2<f32>(c, -s, s, c) * coord;
    coord = coord + vec2<f32>(aspectRatio * 0.5, 0.5);
    coord.x = coord.x / aspectRatio;
    return coord;
}

// Blend 4 colors based on a 0-1 parameter t, cycling through all 4
fn blend4Colors(t_in: f32) -> vec3<f32> {
    let t = fract(t_in); // Ensure t is in [0, 1]
    let segment = t * 4.0;
    let idx = i32(floor(segment));
    let localT = fract(segment);
    
    switch idx {
        case 0: {
            return mix(color1, color2, localT);
        }
        case 1: {
            return mix(color2, color3, localT);
        }
        case 2: {
            return mix(color3, color4, localT);
        }
        default: {
            return mix(color4, color1, localT);
        }
    }
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let st = pos.xy / resolution;
    let aspectRatio = resolution.x / resolution.y;
    
    // Convert rotation from degrees to radians
    let angle = -rotation * PI / 180.0;
    
    // Apply rotation for linear and conic gradients
    let rotatedSt = rotate2D(st, angle);
    
    // Centered coordinates for radial and conic
    var centered = st - 0.5;
    centered.x = centered.x * aspectRatio;
    
    // Rotated centered for conic
    let c = cos(angle);
    let s = sin(angle);
    let rotatedCentered = mat2x2<f32>(c, -s, s, c) * centered;
    
    var color: vec3<f32>;
    var t: f32;
    
    switch gradientType {
        case 0: {
            // Linear gradient along rotated y-axis
            t = rotatedSt.y;
            t = fract(t * f32(repeatCount));
            color = blend4Colors(t);
        }
        case 1: {
            // Radial gradient from center
            // Apply rotation to the radial gradient by rotating the sample point
            let rotatedPoint = mat2x2<f32>(c, -s, s, c) * centered;
            let dist = length(rotatedPoint) * 2.0;
            
            t = dist;
            t = fract(t * f32(repeatCount));
            color = blend4Colors(t);
        }
        case 2: {
            // Conic/angular gradient
            let a = atan2(rotatedCentered.y, rotatedCentered.x);
            t = (a + PI) / TAU; // Map from [-PI, PI] to [0, 1]
            t = fract(t * f32(repeatCount));
            color = blend4Colors(t);
        }
        case 3: {
            // Four corners - bilinear interpolation
            // Apply rotation to the sampling coordinates
            var cornerSt = rotate2D(st, angle);
            
            // Bilinear interpolation between 4 corner colors
            let top = mix(color1, color2, cornerSt.x);
            let bottom = mix(color4, color3, cornerSt.x);
            color = mix(bottom, top, cornerSt.y);
        }
        default: {
            color = color1;
        }
    }
    
    return vec4<f32>(color, 1.0);
}
