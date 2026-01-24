#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float time;
uniform int shape1;
uniform float scale1;
uniform float repeat1;
uniform int shape2;
uniform float scale2;
uniform float repeat2;
uniform int shape3;
uniform float scale3;
uniform float repeat3;
uniform int blend3;
uniform float speed;

out vec4 fragColor;

float shape(int shapeIndex, vec2 p) {
	float v;
	if (shapeIndex < 1) {
		v = max(p.x, p.y);
	} else if (shapeIndex < 2) {
		v = min(p.x, p.y);
	} else {
		v = abs(p.x - p.y);
	}
	return v;
}

void main() {
	vec2 uv = (gl_FragCoord.xy - resolution * 0.5) / min(resolution.x, resolution.y);

	// Map time from 0-1 to 0-1-0 for smooth animation looping and multiply by animation speed
	float pingpong = 1.0 - abs(time * 2.0 - 1.0);
	pingpong *= speed;

	// Create repeating cells with hard edges
	// mod(uv * scale1, 2.0) creates repeating cells from 0 to 2
	// Subtracting 1.0 centers them from -1 to 1
	// abs() folds them, so you get a pattern that goes 0->1->0->1 with sharp peaks
	vec2 p = abs(mod(uv * scale1, 2.0) - 1.0);
	
	// Take the maximum of x and y at each point. Geometrically, this creates 
	// diamond/square shapes because you're getting the "outer" coordinate
	float n1 = shape(shape1, p);

	// Repeat the same fold operation but at scale2 frequency, and takes the min instead. 
	// This creates a finer pattern with inverse geometry (taking the "inner" coordinate 
	// creates different shapes).
	p = abs(mod(p * scale2, 2.0) - 1.0);
	float n2 = shape(shape2, p);

	// Multiply each pattern by different amounts (like 3 and 5) and add them together. 
	// The fract() wraps values back to 0-1, creating interference patterns. Using 
	// different multipliers (like 3 and 5) creates interesting beats and moiré effects.
	float val = fract(n1 * repeat1 + n2 * repeat2);
	
	// Repeat again with scale3 frequency. Taking abs(p.x - p.y) creates diagonal patterns
	p = abs(mod(p * scale3, 2.0) - 1.0);
	float n3 = shape(shape3, p);

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

	fragColor = vec4(vec3(val), 1.0);
}
