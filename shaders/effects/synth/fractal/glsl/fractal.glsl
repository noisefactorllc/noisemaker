/*
 * GLSL fractal explorer shader
 * 
 * Implements multiple escape-time fractals with smooth iteration coloring:
 * - Mandelbrot (z² + c)
 * - Julia (z² + c with fixed c)
 * - Burning Ship (|Re(z)|² + |Im(z)|² + c)
 * - Tricorn/Mandelbar (conj(z)² + c)
 * - Phoenix (z² + c + p*z_prev)
 * - Newton (Newton-Raphson for z³ - 1)
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform vec2 resolution;
uniform float time;

// Fractal parameters
uniform int fractalType;
uniform float power;
uniform int iterations;
uniform float bailout;

// Transform
uniform float centerX;
uniform float centerY;
uniform float zoom;
uniform float rotation;

// Julia parameters
uniform float juliaReal;
uniform float juliaImag;
uniform bool animateJulia;
uniform float speed;

// Output
uniform int outputMode;
uniform float colorCycles;
uniform bool smoothing;
uniform bool invert;

out vec4 fragColor;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

// ============================================================================
// Complex number operations
// ============================================================================

// Complex multiplication: (a + bi)(c + di) = (ac - bd) + (ad + bc)i
vec2 cmul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// Complex division
vec2 cdiv(vec2 a, vec2 b) {
    float denom = dot(b, b);
    return vec2(
        (a.x * b.x + a.y * b.y) / denom,
        (a.y * b.x - a.x * b.y) / denom
    );
}

// Complex power (integer exponent via repeated multiplication for power = 2)
// For arbitrary power, use polar form
vec2 cpow(vec2 z, float n) {
    float r = length(z);
    float theta = atan(z.y, z.x);
    float rn = pow(r, n);
    float ntheta = n * theta;
    return vec2(rn * cos(ntheta), rn * sin(ntheta));
}

// Complex conjugate
vec2 conj(vec2 z) {
    return vec2(z.x, -z.y);
}

// ============================================================================
// Coordinate transformation
// ============================================================================

vec2 transformCoords(vec2 fragCoord) {
    float aspect = resolution.x / resolution.y;
    
    // Normalize to [-1, 1] with aspect correction
    vec2 uv = (fragCoord - 0.5 * resolution) / min(resolution.x, resolution.y);
    
    // Apply rotation
    float angle = -rotation * TAU;
    float c = cos(angle);
    float s = sin(angle);
    uv = mat2(c, -s, s, c) * uv;
    
    // Apply zoom and center
    uv = uv * (2.5 / zoom) + vec2(-centerX, centerY);
    
    return uv;
}

// ============================================================================
// Fractal iteration functions
// ============================================================================

// Mandelbrot: z = z² + c, where c = pixel position
vec4 mandelbrot(vec2 c, float pw) {
    vec2 z = vec2(0.0);
    float i = 0.0;
    
    for (int n = 0; n < 500; n++) {
        if (n >= iterations) break;
        
        z = cpow(z, pw) + c;
        
        if (dot(z, z) > bailout * bailout) break;
        i += 1.0;
    }
    
    // Smooth iteration count
    float smoothVal = i;
    if (smoothing && i < float(iterations)) {
        float log_zn = log(dot(z, z)) / 2.0;
        float nu = log(log_zn / log(2.0)) / log(pw);
        smoothVal = i + 1.0 - nu;
    }
    
    return vec4(smoothVal, length(z), atan(z.y, z.x), i);
}

// Julia: z = z² + c, where c is fixed, z starts at pixel position
vec4 julia(vec2 z0, vec2 c, float pw) {
    vec2 z = z0;
    float i = 0.0;
    
    for (int n = 0; n < 500; n++) {
        if (n >= iterations) break;
        
        z = cpow(z, pw) + c;
        
        if (dot(z, z) > bailout * bailout) break;
        i += 1.0;
    }
    
    float smoothVal = i;
    if (smoothing && i < float(iterations)) {
        float log_zn = log(dot(z, z)) / 2.0;
        float nu = log(log_zn / log(2.0)) / log(pw);
        smoothVal = i + 1.0 - nu;
    }
    
    return vec4(smoothVal, length(z), atan(z.y, z.x), i);
}

// Burning Ship: z = (|Re(z)| + i|Im(z)|)² + c
vec4 burningShip(vec2 c, float pw) {
    vec2 z = vec2(0.0);
    float i = 0.0;
    
    for (int n = 0; n < 500; n++) {
        if (n >= iterations) break;
        
        // Take absolute values before squaring
        z = abs(z);
        z = cpow(z, pw) + c;
        
        if (dot(z, z) > bailout * bailout) break;
        i += 1.0;
    }
    
    float smoothVal = i;
    if (smoothing && i < float(iterations)) {
        float log_zn = log(dot(z, z)) / 2.0;
        float nu = log(log_zn / log(2.0)) / log(pw);
        smoothVal = i + 1.0 - nu;
    }
    
    return vec4(smoothVal, length(z), atan(z.y, z.x), i);
}

// Tricorn (Mandelbar): z = conj(z)² + c
vec4 tricorn(vec2 c, float pw) {
    vec2 z = vec2(0.0);
    float i = 0.0;
    
    for (int n = 0; n < 500; n++) {
        if (n >= iterations) break;
        
        z = cpow(conj(z), pw) + c;
        
        if (dot(z, z) > bailout * bailout) break;
        i += 1.0;
    }
    
    float smoothVal = i;
    if (smoothing && i < float(iterations)) {
        float log_zn = log(dot(z, z)) / 2.0;
        float nu = log(log_zn / log(2.0)) / log(pw);
        smoothVal = i + 1.0 - nu;
    }
    
    return vec4(smoothVal, length(z), atan(z.y, z.x), i);
}

// Newton fractal for z³ - 1 = 0
// Uses Newton-Raphson iteration: z = z - f(z)/f'(z)
vec4 newton(vec2 z0) {
    vec2 z = z0;
    float i = 0.0;
    
    // The three roots of z³ - 1
    vec2 root1 = vec2(1.0, 0.0);
    vec2 root2 = vec2(-0.5, sqrt(3.0) / 2.0);
    vec2 root3 = vec2(-0.5, -sqrt(3.0) / 2.0);
    
    float tolerance = 0.0001;
    int whichRoot = -1;
    
    for (int n = 0; n < 500; n++) {
        if (n >= iterations) break;
        
        // f(z) = z³ - 1
        vec2 z2 = cmul(z, z);
        vec2 z3 = cmul(z2, z);
        vec2 fz = z3 - vec2(1.0, 0.0);
        
        // f'(z) = 3z²
        vec2 fpz = 3.0 * z2;
        
        // Newton step: z = z - f(z)/f'(z)
        z = z - cdiv(fz, fpz);
        
        // Check convergence to roots
        if (length(z - root1) < tolerance) { whichRoot = 0; break; }
        if (length(z - root2) < tolerance) { whichRoot = 1; break; }
        if (length(z - root3) < tolerance) { whichRoot = 2; break; }
        
        i += 1.0;
    }
    
    // Return iteration count, which root (0-2), and angle
    float rootVal = whichRoot >= 0 ? float(whichRoot) / 3.0 : 0.0;
    return vec4(i, rootVal, atan(z.y, z.x), i);
}

// ============================================================================
// Output mapping
// ============================================================================

float mapOutput(vec4 result, int mode) {
    float maxIter = float(iterations);
    
    if (mode == 0) {
        // Iteration count (normalized)
        return result.x / maxIter;
    } else if (mode == 1) {
        // Distance estimate (final |z|, normalized)
        return clamp(result.y / (bailout * 2.0), 0.0, 1.0);
    } else if (mode == 2) {
        // Angle of final z
        return (result.z + PI) / TAU;
    } else if (mode == 3) {
        // Potential: log(log(|z|)) based coloring
        if (result.w >= maxIter) return 0.0;
        float potential = log(result.y) / pow(2.0, result.w);
        return clamp(1.0 - log(potential + 1.0), 0.0, 1.0);
    }
    
    return result.x / maxIter;
}

// ============================================================================
// Main
// ============================================================================

void main() {
    vec2 z = transformCoords(gl_FragCoord.xy);
    
    // Get animated or static Julia constant
    vec2 juliaC = vec2(juliaReal, juliaImag);
    if (animateJulia) {
        float t = time * speed;
        juliaC = vec2(
            0.7885 * cos(t * TAU),
            0.7885 * sin(t * TAU)
        );
    }
    
    vec4 result;
    
    // Select fractal type
    if (fractalType == 0) {
        result = mandelbrot(z, power);
    } else if (fractalType == 1) {
        result = julia(z, juliaC, power);
    } else if (fractalType == 2) {
        result = burningShip(z, power);
    } else if (fractalType == 3) {
        result = tricorn(z, power);
    } else if (fractalType == 4) {
        result = newton(z);
    } else {
        result = mandelbrot(z, power);
    }
    
    // Check if point is in the set (didn't escape)
    bool inSet = result.w >= float(iterations);
    
    // Map to output value
    float value;
    if (fractalType == 4) {
        // Newton fractal: use root coloring combined with iteration
        float rootColor = result.y; // which root (0, 1/3, 2/3)
        float iterColor = 1.0 - result.x / float(iterations);
        value = rootColor + iterColor * 0.3;
        value = fract(value * colorCycles);
    } else if (inSet) {
        value = 0.0;
    } else {
        value = mapOutput(result, outputMode);
        value = fract(value * colorCycles);
    }
    
    // Apply inversion
    if (invert) {
        value = 1.0 - value;
    }
    
    fragColor = vec4(vec3(value), 1.0);
}
