/*
 * Precompute shader for nu/shape3d (WGSL)
 * Fills a 64x4096 2D atlas representing a 64^3 3D volume
 * Each texel stores the shape offset value for that 3D position
 * Atlas layout: pixel (x, y) maps to 3D coord (x, y % 64, floor(y / 64))
 */

@group(0) @binding(0) var<uniform> loopAOffset: i32;
@group(0) @binding(1) var<uniform> loopBOffset: i32;
@group(0) @binding(2) var<uniform> loopAScale: f32;
@group(0) @binding(3) var<uniform> loopBScale: f32;
@group(0) @binding(4) var<uniform> loopAAmp: f32;
@group(0) @binding(5) var<uniform> loopBAmp: f32;
@group(0) @binding(6) var<uniform> volumeSize: i32;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn map_range(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn periodicFunction(p: f32) -> f32 {
    let x = TAU * p;
    return map_range(sin(x), -1.0, 1.0, 0.0, 1.0);
}

// ============================================
// 3D Polyhedral SDF Functions
// ============================================

// Tetrahedron (4 faces, 4 vertices)
fn tetrahedronSDF(p: vec3<f32>) -> f32 {
    let s = 0.5;
    return (max(abs(p.x + p.y) - p.z, abs(p.x - p.y) + p.z) - s) / sqrt(3.0);
}

// Cube / Hexahedron (6 faces, 8 vertices)
fn cubeSDF(p: vec3<f32>) -> f32 {
    let d = abs(p) - vec3<f32>(0.45);
    return length(max(d, vec3<f32>(0.0))) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// Octahedron (8 faces, 6 vertices)
fn octahedronSDF(p: vec3<f32>) -> f32 {
    let ap = abs(p);
    let s = 0.5;
    return (ap.x + ap.y + ap.z - s) * 0.57735027;
}

// Dodecahedron (12 pentagonal faces, 20 vertices)
fn dodecahedronSDF(p: vec3<f32>) -> f32 {
    let ap = abs(p);
    let phi = (1.0 + sqrt(5.0)) * 0.5;  // Golden ratio
    
    let n1 = normalize(vec3<f32>(1.0, phi, 0.0));
    let n2 = normalize(vec3<f32>(0.0, 1.0, phi));
    let n3 = normalize(vec3<f32>(phi, 0.0, 1.0));
    
    var d = 0.0;
    d = max(d, dot(ap, n1));
    d = max(d, dot(ap, n2));
    d = max(d, dot(ap, n3));
    d = max(d, ap.x);
    d = max(d, ap.y);
    d = max(d, ap.z);
    
    return d - 0.45;
}

// Icosahedron (20 triangular faces, 12 vertices)
fn icosahedronSDF(p: vec3<f32>) -> f32 {
    let ap = abs(p);
    let phi = (1.0 + sqrt(5.0)) * 0.5;
    
    let n1 = normalize(vec3<f32>(phi, 1.0, 0.0));
    let n2 = normalize(vec3<f32>(1.0, 0.0, phi));
    let n3 = normalize(vec3<f32>(0.0, phi, 1.0));
    
    var d = 0.0;
    d = max(d, dot(ap, n1));
    d = max(d, dot(ap, n2));
    d = max(d, dot(ap, n3));
    d = max(d, dot(ap, normalize(vec3<f32>(1.0, 1.0, 1.0))));
    
    return d - 0.42;
}

// ============================================
// Other 3D Primitive SDFs
// ============================================

fn sphereSDF(p: vec3<f32>) -> f32 {
    return length(p) - 0.5;
}

fn torusSDF(p: vec3<f32>) -> f32 {
    let t = vec2<f32>(0.35, 0.12);
    let q = vec2<f32>(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

fn cylinderSDF(p: vec3<f32>) -> f32 {
    let d = abs(vec2<f32>(length(p.xz), p.y)) - vec2<f32>(0.35, 0.45);
    return min(max(d.x, d.y), 0.0) + length(max(d, vec2<f32>(0.0)));
}

fn coneSDF(p: vec3<f32>) -> f32 {
    let h = 0.6;
    let r = 0.4;
    let c = normalize(vec2<f32>(h, r));
    let q = length(p.xz);
    return max(dot(c.xy, vec2<f32>(q, p.y)), -p.y - h * 0.5);
}

fn capsuleSDF(p: vec3<f32>) -> f32 {
    let h = 0.3;
    let r = 0.25;
    var pp = p;
    pp.y = pp.y - clamp(pp.y, -h, h);
    return length(pp) - r;
}

// Get SDF value for shape type
fn shapeSDF(p: vec3<f32>, shapeType: i32) -> f32 {
    // Platonic Solids
    if (shapeType == 10) { return tetrahedronSDF(p); }
    if (shapeType == 20) { return cubeSDF(p); }
    if (shapeType == 30) { return octahedronSDF(p); }
    if (shapeType == 40) { return dodecahedronSDF(p); }
    if (shapeType == 50) { return icosahedronSDF(p); }
    
    // Other Primitives
    if (shapeType == 100) { return sphereSDF(p); }
    if (shapeType == 110) { return torusSDF(p); }
    if (shapeType == 120) { return cylinderSDF(p); }
    if (shapeType == 130) { return coneSDF(p); }
    if (shapeType == 140) { return capsuleSDF(p); }
    
    return sphereSDF(p);
}

// Get offset value for a position
fn offset3D(p: vec3<f32>, freq: f32, loopOffset: i32, loopAmp: f32) -> f32 {
    // Center at origin: [0,1] -> [-0.5, 0.5]
    let cp = p - vec3<f32>(0.5);
    
    // Get SDF and convert to offset
    let sdf = shapeSDF(cp, loopOffset);
    
    // Convert SDF to offset: invert and scale
    return (0.5 - sdf) * freq;
}

// Helper to compute shape value at a position
fn computeValue(p: vec3<f32>, lf1: f32, lf2: f32, amp1: f32, amp2: f32) -> f32 {
    let offset1 = offset3D(p, lf1, loopAOffset, amp1);
    let offset2 = offset3D(p, lf2, loopBOffset, amp2);
    
    var t1 = p.z;
    var t2 = p.z;
    
    if (loopAAmp < 0.0) {
        t1 = t1 + offset1;
    } else if (loopAAmp > 0.0) {
        t1 = t1 - offset1;
    }
    
    if (loopBAmp < 0.0) {
        t2 = t2 + offset2;
    } else if (loopBAmp > 0.0) {
        t2 = t2 - offset2;
    }
    
    let a = periodicFunction(t1);
    let b = periodicFunction(t2);
    
    let combined = a * amp1 + b * amp2;
    let totalAmp = amp1 + amp2;
    if (totalAmp > 0.0) {
        return combined / totalAmp;
    } else {
        return 0.5;
    }
}

// MRT output structure for volume cache and geometry buffer
struct FragOutput {
    @location(0) color: vec4<f32>,
    @location(1) geoOut: vec4<f32>,
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> FragOutput {
    // Convert 2D fragment position to 3D volume coordinates
    let volSize = volumeSize;
    let volSizeF = f32(volSize);
    let x = i32(position.x);
    let yAtlas = i32(position.y);
    let y = yAtlas % volSize;
    let z = yAtlas / volSize;
    
    // Normalize to [0, 1]
    let p = vec3<f32>(f32(x), f32(y), f32(z)) / (volSizeF - 1.0);
    
    // Calculate frequencies from scale parameters
    let lf1 = map_range(loopAScale, 1.0, 100.0, 6.0, 1.0);
    let lf2 = map_range(loopBScale, 1.0, 100.0, 6.0, 1.0);
    
    // Calculate amplitudes
    let amp1 = map_range(abs(loopAAmp), 0.0, 100.0, 0.0, 1.0);
    let amp2 = map_range(abs(loopBAmp), 0.0, 100.0, 0.0, 1.0);
    
    // Compute value at this position using helper function
    let d = computeValue(p, lf1, lf2, amp1, amp2);
    
    // Compute analytical gradient using finite differences
    let eps = 1.0 / volSizeF;
    let dx = computeValue(p + vec3<f32>(eps, 0.0, 0.0), lf1, lf2, amp1, amp2);
    let dy = computeValue(p + vec3<f32>(0.0, eps, 0.0), lf1, lf2, amp1, amp2);
    let dz = computeValue(p + vec3<f32>(0.0, 0.0, eps), lf1, lf2, amp1, amp2);
    
    let gradient = vec3<f32>(dx - d, dy - d, dz - d) / eps;
    let normal = normalize(-gradient + vec3<f32>(0.000001));
    
    let color = vec4<f32>(d, d, d, 1.0);
    let geoOut = vec4<f32>(normal * 0.5 + 0.5, d);
    
    return FragOutput(color, geoOut);
}
