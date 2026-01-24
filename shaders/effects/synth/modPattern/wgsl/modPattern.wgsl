// WGSL version – WebGPU
// Pack uniforms into a struct to stay within WebGPU's 12 uniform buffer limit
struct Uniforms {
    // Slot 0: resolution.xy, time, aspect
    // Slot 1: shape1, scale1, repeat1, shape2
    // Slot 2: scale2, repeat2, shape3, scale3
    // Slot 3: repeat3, blend3, speed, (unused)
    data: array<vec4<f32>, 4>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// GLSL-compatible mod function: mod(x, y) = x - y * floor(x/y)
// WGSL % operator behaves like C's fmod, which gives different results for negative numbers
fn glsl_mod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

fn glsl_mod2(x: vec2<f32>, y: vec2<f32>) -> vec2<f32> {
    return x - y * floor(x / y);
}

fn shape(shapeIndex: i32, p: vec2<f32>) -> f32 {
	var v: f32;
	if (shapeIndex < 1) {
		v = max(p.x, p.y);
	} else if (shapeIndex < 2) {
		v = min(p.x, p.y);
	} else {
		v = abs(p.x - p.y);
	}
	return v;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
	// Unpack uniforms
	let resolution = uniforms.data[0].xy;
	let time = uniforms.data[0].z;
	
	let shape1 = i32(uniforms.data[1].x);
	let scale1 = uniforms.data[1].y;
	let repeat1 = uniforms.data[1].z;
	let shape2 = i32(uniforms.data[1].w);
	
	let scale2 = uniforms.data[2].x;
	let repeat2 = uniforms.data[2].y;
	let shape3 = i32(uniforms.data[2].z);
	let scale3 = uniforms.data[2].w;
	
	let repeat3 = uniforms.data[3].x;
	let blend3 = i32(uniforms.data[3].y);
	let speed = i32(uniforms.data[3].z);

	var res = resolution;
	if (res.x < 1.0) { res = vec2<f32>(1024.0, 1024.0); }

	// Normalized coordinates
	let uv = (position.xy - res * 0.5) / min(res.x, res.y);

	// Map time from 0-1 to 0-1-0 for smooth animation looping and multiply by animation speed
	var pingpong = 1.0 - abs(time * 2.0 - 1.0);
	pingpong = pingpong * f32(speed);

	// Create repeating cells with hard edges
	// mod(uv * scale1, 2.0) creates repeating cells from 0 to 2
	// Subtracting 1.0 centers them from -1 to 1
	// abs() folds them, so you get a pattern that goes 0->1->0->1 with sharp peaks
	var p = abs(glsl_mod2(uv * scale1, vec2<f32>(2.0)) - vec2<f32>(1.0));
	
	// Take the maximum of x and y at each point. Geometrically, this creates 
	// diamond/square shapes because you're getting the "outer" coordinate
	let n1 = shape(shape1, p);

	// Repeat the same fold operation but at scale2 frequency, and takes the min instead. 
	// This creates a finer pattern with inverse geometry (taking the "inner" coordinate 
	// creates different shapes).
	p = abs(glsl_mod2(p * scale2, vec2<f32>(2.0)) - vec2<f32>(1.0));
	let n2 = shape(shape2, p);

	// Multiply each pattern by different amounts (like 3 and 5) and add them together. 
	// The fract() wraps values back to 0-1, creating interference patterns. Using 
	// different multipliers (like 3 and 5) creates interesting beats and moiré effects.
	var val = fract(n1 * repeat1 + n2 * repeat2);
	
	// Repeat again with scale3 frequency. Taking abs(p.x - p.y) creates diagonal patterns
	p = abs(glsl_mod2(p * scale3, vec2<f32>(2.0)) - vec2<f32>(1.0));
	let n3 = shape(shape3, p);

	// Multiply the last pattern times another scale and add to the previous value. 
	// Add pingpong time to animate in a smooth loop
	if (blend3 < 1) {
		// add
		val = fract(val + n3 * repeat3 + pingpong);
	} else if (blend3 < 2) {
		// max
		val = max(val, fract(n3 * repeat3 + pingpong));
	} else { 
		// mix
		val = mix(val, fract(n3 * repeat3 + pingpong), 0.5);
	}

	return vec4<f32>(vec3<f32>(val), 1.0);
}
