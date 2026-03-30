// WGSL version – WebGPU
// Pack uniforms into a struct to stay within WebGPU's 12 uniform buffer limit
struct Uniforms {
    // Slot 0: resolution.xy, time, aspect
    // Slot 1: shape1, scale1, repeat1, shape2
    // Slot 2: scale2, repeat2, shape3, scale3
    // Slot 3: repeat3, blend, speed, smoothing
    // Slot 4: animMode
    data: array<vec4<f32>, 5>,
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

// Generate a geometric shape from the given coordinates
fn shape(shapeIndex: i32, p: vec2<f32>) -> f32 {
	var v: f32;
	if (shapeIndex < 1) {
		// plus
		v = max(p.x, p.y);
	} else if (shapeIndex < 2) {
		// square
		v = min(p.x, p.y);
	} else {
		// diamond
		v = abs(p.x - p.y);
	}
	return v;
}

fn smoothFract(x: f32) -> f32 {
	let smoothing = i32(uniforms.data[3].w);
	let f = fract(x);
	let edgeWidth = f32(smoothing) * 0.01;
	if (f > 1.0 - edgeWidth) {
		return smoothstep(0.0, edgeWidth, 1.0 - f);
	}
	return f;
}

fn smoothFract2(v: vec2<f32>) -> vec2<f32>  {
	return vec2<f32>(smoothFract(v.x), smoothFract(v.y));
}

fn smoothFract3(v: vec3<f32>) -> vec3<f32> {
	return vec3<f32>(smoothFract(v.x), smoothFract(v.y), smoothFract(v.z));
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
	let blend = i32(uniforms.data[3].y);
	let speed = i32(uniforms.data[3].z);
	let smoothing = i32(uniforms.data[3].w);
	let animMode = i32(uniforms.data[4].x);

	var res = resolution;
	if (res.x < 1.0) { res = vec2<f32>(1024.0, 1024.0); }

	// Normalized coordinates
	var uv = (position.xy - res * 0.5) / min(res.x, res.y);

	let spd = floor(f32(speed));
	let anim = time * spd;
	let TAU = 6.28318530718;

	// Create repeating cells with hard edges
	// mod(uv * scale, 2.0) creates repeating cells from 0 to 2
	// Subtracting 1.0 centers them from -1 to 1
	// abs() folds them, so you get a pattern that goes 0->1->0->1 with sharp peaks
	let s1 = 20.1 - scale1; // Map scale so larger number = lower frequency
	var p = abs(glsl_mod2(uv * s1, vec2<f32>(2.0)) - vec2<f32>(1.0));
	
	// Pan mode: per-layer directional oscillation, scaled to layer frequency
	if (animMode == 1) {
		let osc1 = sin(time * TAU * spd) * 0.03;
		p += vec2<f32>(osc1, 0.0);
	}

	// Generate a shape/pattern for the repeated coordinates
	let n1 = shape(shape1, p);

	// Phase mode: offset each layer independently
	let phase1 = select(0.0, anim, animMode == 2);
	let phase2 = select(0.0, anim, animMode == 2);
	let phase3 = select(0.0, anim, animMode == 2);

	// Repeat the same fold operation but at a different frequency, and generate another shape
	let s2 = 10.1 - scale2; // Map scale so larger number = lower frequency
	p = abs(glsl_mod2(p * s2, vec2<f32>(2.0)) - vec2<f32>(1.0));

	// Pan mode: layer 2 pans up
	if (animMode == 1) {
		let osc2 = sin(time * TAU * spd) * 0.07;
		p += vec2<f32>(0.0, osc2);
	}

	let n2 = shape(shape2, p);

	// Multiply each pattern by different amounts (like 3 and 5) and add them together.
	// The fract() wraps values back to 0-1, creating interference patterns
	var val = 0.0;
	if (blend < 1) {
		val = fract(n1 * repeat1 + phase1 + n2 * repeat2 + phase2);
	} else {
		val = smoothFract(n1 * repeat1 + phase1 + n2 * repeat2 + phase2);
	}

	// Repeat again with scale3 frequency, modifying the coordinates and creating another
	// shape/pattern
	let s3 = 6.1 - scale3; // Map scale so larger number = lower frequency
	p = abs(glsl_mod2(p * s3, vec2<f32>(2.0)) - vec2<f32>(1.0));

	// Pan mode: layer 3 pans left
	if (animMode == 1) {
		let osc3 = sin(time * TAU * spd) * 0.15;
		p += vec2<f32>(-osc3, 0.0);
	}

	let n3 = shape(shape3, p);

	// Shift mode: add time offset at the final blend stage
	let shift = select(0.0, anim, animMode == 0);

	// Combine layers with selected blend mode
	var color: vec3<f32>;
	if (blend < 1) {
		// add
		color = smoothFract3(vec3<f32>(fract(val + n3 * repeat3 + phase3 + shift)));
	} else if (blend < 2) {
		// max
		color = vec3<f32>(max(val, smoothFract(n3 * repeat3 + phase3 + shift)));
	} else if (blend < 3) {
		// mix
		color = vec3<f32>(mix(val, smoothFract(n3 * repeat3 + phase3 + shift), 0.5));
	} else {
		// rgb
		color = smoothFract3(vec3<f32>(n1 * repeat1 + phase1, n2 * repeat2 + phase2, n3 * repeat3 + phase3 + shift));
	}

	return vec4<f32>(color, 1.0);
}
