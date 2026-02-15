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
uniform int blend;
uniform float smoothing;
uniform float speed;

out vec4 fragColor;

// Generate a geometric shape from the given coordinates 
float shape(int shapeIndex, vec2 p) {
	float v;
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

float smoothFract(float x) {
	float f = fract(x);
	float edgeWidth = smoothing * 0.01;
	if (f > 1.0 - edgeWidth) {
		return smoothstep(0.0, edgeWidth, 1.0 - f);
	}
	return f;
}

vec2 smoothFract(vec2 v) {
	return vec2(smoothFract(v.x), smoothFract(v.y));
}

vec3 smoothFract(vec3 v) {
	return vec3(smoothFract(v.x), smoothFract(v.y), smoothFract(v.z));
}

void main() {
	vec2 uv = (gl_FragCoord.xy - resolution * 0.5) / min(resolution.x, resolution.y);

	// Map time from 0-1 to 0-1-0 for smooth animation looping and multiply by animation speed
	float pingpong = 1.0 - abs(time * 2.0 - 1.0);
	pingpong *= speed;

	// Create repeating cells with hard edges
	// mod(uv * scale, 2.0) creates repeating cells from 0 to 2
	// Subtracting 1.0 centers them from -1 to 1
	// abs() folds them, so you get a pattern that goes 0->1->0->1 with sharp peaks
	float s1 = 20.1 - scale1; // Map scale so larger number = lower frequency
	vec2 p = abs(mod(uv * s1, 2.0) - 1.0);
	
	// Generate a shape/pattern for the repeated coordinates
	float n1 = shape(shape1, p);

	// Repeat the same fold operation but at a different frequency, and generate another shape
	float s2 = 10.1 - scale2; // Map scale so larger number = lower frequency
	p = abs(mod(p * s2, 2.0) - 1.0);
	float n2 = shape(shape2, p);

	// Multiply each pattern by different amounts (like 3 and 5) and add them together. 
	// The fract() wraps values back to 0-1, creating interference patterns
	float val = smoothFract(n1 * repeat1 + n2 * repeat2);
	
	// Repeat again with scale3 frequency, modifying the coordinates and creating another 
	// shape/pattern
	float s3 = 6.1 - scale3; // Map scale so larger number = lower frequency
	p = abs(mod(p * s3, 2.0) - 1.0);
	float n3 = shape(shape3, p);

	// Multiply the last pattern times another scale and combine with the previous values.
	// Add pingpong time to animate in a smooth loop
	vec3 color;
	if (blend < 1) {
		// add
		color = vec3(fract(val + n3 * repeat3 + pingpong));
	} else if (blend < 2) {
		// max
		color = vec3(max(val, smoothFract(n3 * repeat3 + pingpong)));
	} else if (blend < 3) { 
		// mix
		color = vec3(mix(val, smoothFract(n3 * repeat3 + pingpong), 0.5));
	} else {
		// rgb
		color = smoothFract(vec3(n1 * repeat1, n2 * repeat2, n3 * repeat3 + pingpong));
	}

	fragColor = vec4(color, 1.0);
}
