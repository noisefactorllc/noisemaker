// Billboard Deposit Shader - Scatter agents as billboard quads

struct Uniforms {
    resolution: vec2<f32>,
    shapeMode: i32,
    depositOpacity: f32,
    density: f32,
    pointSize: f32,
    sizeVariation: f32,
    rotationVar: f32,
    seed: i32,
    viewMode: i32,
    rotateX: f32,
    rotateY: f32,
    rotateZ: f32,
    viewScale: f32,
    posX: f32,
    posY: f32,
    posZ: f32,
    fieldOfView: f32,
    sizeDistance: f32,
    brightnessDistance: f32,
    aperture: f32,
    focalDistance: f32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) spriteUV: vec2<f32>,
    @location(2) blurRadius: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var xyzTex: texture_2d<f32>;
@group(0) @binding(2) var rgbaTex: texture_2d<f32>;

fn hash_uint_bb(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash(n: f32) -> f32 {
    return f32(hash_uint_bb(bitcast<u32>(n + f32(u.seed)))) / 4294967295.0;
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;

    // Each quad uses 6 vertices (2 triangles)
    let particleID = i32(vertexIndex) / 6;
    let vertexInQuad = i32(vertexIndex) % 6;
    
    // Get state size from xyz texture dimensions
    let texSize = textureDimensions(xyzTex, 0);
    let stateSize = i32(texSize.x);
    let totalAgents = stateSize * stateSize;
    
    // Cull particles beyond texture size
    if (particleID >= totalAgents) {
        out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
        out.color = vec4<f32>(0.0);
        out.spriteUV = vec2<f32>(0.0);
        return out;
    }
    
    // Density-based culling
    let cullThreshold = u.density / 100.0;
    let particleRandom = fract(f32(particleID) * 0.618033988749895);
    if (particleRandom > cullThreshold) {
        out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
        out.color = vec4<f32>(0.0);
        out.spriteUV = vec2<f32>(0.0);
        return out;
    }
    
    // Calculate UV for this particle
    let x = particleID % stateSize;
    let y = particleID / stateSize;
    
    // Read particle position and color
    let pos = textureLoad(xyzTex, vec2<i32>(x, y), 0);
    let col = textureLoad(rgbaTex, vec2<i32>(x, y), 0);
    
    // Check if particle is alive (pos.w >= 0.5 means alive)
    if (pos.w < 0.5) {
        out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
        out.color = vec4<f32>(0.0);
        out.spriteUV = vec2<f32>(0.0);
        return out;
    }
    
    var clipPos: vec2<f32>;
    var cameraDepth = 80.0;
    var cameraDistance = 0.0;
    var projectedScale = 1.0;
    
    if (u.viewMode == 0) {
        // 2D mode: positions are normalized 0..1
        clipPos = vec2<f32>(pos.x * 2.0 - 1.0, 1.0 - pos.y * 2.0);
    } else {
        // 3D mode: apply rotation and orthographic projection
        var p = pos.xyz;
        
        // Detect if this is a 2D system or 3D attractor
        let is2DSystem = u.viewMode == 1 && abs(p.z) < 1.0 && p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0;
        
        if (is2DSystem) {
            p = vec3<f32>(p.x - 0.5, p.y - 0.5, 0.0);
        }
        
        // Apply rotation around X axis
        let cosX = cos(u.rotateX);
        let sinX = sin(u.rotateX);
        p = vec3<f32>(p.x, p.y * cosX - p.z * sinX, p.y * sinX + p.z * cosX);
        
        // Apply rotation around Y axis
        let cosY = cos(u.rotateY);
        let sinY = sin(u.rotateY);
        p = vec3<f32>(p.x * cosY + p.z * sinY, p.y, -p.x * sinY + p.z * cosY);
        
        // Apply rotation around Z axis
        let cosZ = cos(u.rotateZ);
        let sinZ = sin(u.rotateZ);
        p = vec3<f32>(p.x * cosZ - p.y * sinZ, p.x * sinZ + p.y * cosZ, p.z);
        
        // Apply X/Y offset after rotation
        p.x = p.x + u.posX;
        p.y = p.y + u.posY;
        p.z += u.posZ;
        cameraDepth = 80.0 - p.z;
        cameraDistance = length(vec3f(p.xy, cameraDepth));
        
        // Orthographic projection with scale
        if (u.viewMode == 2) {
            if (cameraDepth <= 0.1) {
                out.position = vec4f(2.0, 2.0, 0.0, 1.0);
                out.color = vec4f(0.0);
                out.spriteUV = vec2f(0.0);
                return out;
            }
            let focalLength = 1.0 / tan(clamp(u.fieldOfView, 10.0, 150.0) * 0.00872664626);
            clipPos = p.xy * focalLength * u.viewScale / cameraDepth;
            clipPos.x *= u.resolution.y / u.resolution.x;
            projectedScale = 80.0 * focalLength * u.viewScale / (1.732050808 * cameraDepth);
        } else if (is2DSystem) {
            clipPos = p.xy * 3.5 * u.viewScale;
        } else {
            clipPos = p.xy / 40.0 * u.viewScale;
        }
        clipPos.y = -clipPos.y;
    }
    
    // Per-particle size variation (seeded deterministic)
    let sizeNoise = hash(f32(particleID));
    let sizeMultiplier = 1.0 - (u.sizeVariation / 100.0) * (sizeNoise - 0.5);
    var sizeFade = 1.0;
    var brightnessFade = 1.0;
    var blurPixels = 0.0;
    if (u.viewMode != 0) {
        if (u.sizeDistance > 0.0) { sizeFade = 1.0 - smoothstep(0.0, u.sizeDistance, cameraDistance); }
        if (u.brightnessDistance > 0.0) { brightnessFade = 1.0 - smoothstep(0.0, u.brightnessDistance, cameraDistance); }
        blurPixels = min(32.0, u.aperture * abs(cameraDepth - u.focalDistance) / max(abs(cameraDepth), 0.1));
    }
    let baseSize = u.pointSize * sizeMultiplier * projectedScale;
    let blurPadding = select(0.0, 0.5, blurPixels > 0.0);
    let finalSize = (baseSize * (1.0 + 2.0 * blurPadding) + 2.0 * blurPixels) * sizeFade;
    if (finalSize <= 0.0 || brightnessFade <= 0.0) {
        out.position = vec4f(2.0, 2.0, 0.0, 1.0);
        out.color = vec4f(0.0);
        out.spriteUV = vec2f(0.0);
        return out;
    }
    out.blurRadius = blurPixels / max(baseSize, 0.001);
    
    // Per-particle rotation (seeded deterministic)
    let rotationNoise = hash(f32(particleID) + 1234.5);
    let rotation = (u.rotationVar / 100.0) * rotationNoise * 6.283185; // 0 to 2π
    
    // Convert pixel size to clip-space units
    let pixelToClip = 2.0 / u.resolution;
    let halfSize = finalSize * 0.5;
    let sizeClip = halfSize * pixelToClip;
    
    // Quad vertex offsets (two triangles: 0-1-2, 2-1-3)
    var offsets: array<vec2<f32>, 6>;
    offsets[0] = vec2<f32>(-1.0, -1.0); // bottom-left
    offsets[1] = vec2<f32>( 1.0, -1.0); // bottom-right
    offsets[2] = vec2<f32>(-1.0,  1.0); // top-left
    offsets[3] = vec2<f32>(-1.0,  1.0); // top-left
    offsets[4] = vec2<f32>( 1.0, -1.0); // bottom-right
    offsets[5] = vec2<f32>( 1.0,  1.0); // top-right
    
    let offset = offsets[vertexInQuad];
    
    // Apply rotation to offset
    let cosR = cos(rotation);
    let sinR = sin(rotation);
    let rotatedOffset = vec2<f32>(
        offset.x * cosR - offset.y * sinR,
        offset.x * sinR + offset.y * cosR
    );
    
    // Scale offset and add to center position
    var finalPos = clipPos + rotatedOffset * sizeClip;
    // Perspective world positions and local sprite geometry share the same
    // presentation Y convention. Preserve the legacy flat/ortho convention.
    if (u.viewMode == 2) { finalPos.y = clipPos.y - rotatedOffset.y * sizeClip.y; }
    
    out.position = vec4<f32>(finalPos, 0.0, 1.0);
    out.color = col * brightnessFade;
    
    // Sprite UV coordinates (0-1 range)
    out.spriteUV = offset * (0.5 + blurPadding + out.blurRadius) + 0.5;
    
    return out;
}

@group(0) @binding(3) var spriteTex: texture_2d<f32>;
@group(0) @binding(4) var spriteSampler: sampler;
@group(0) @binding(5) var spriteMeanTex: texture_2d<f32>;

fn shadeSprite(uv: vec2f, color: vec4f) -> vec4f {
    let opacity = u.depositOpacity / 100.0;

    if (u.shapeMode == 0) {
        // Texture mode: sample sprite texture
        let spriteColor = textureSampleLevel(spriteTex, spriteSampler, uv, 0.0);
        return vec4<f32>(spriteColor.rgb * color.rgb, spriteColor.a * color.a) * opacity;
    }

    // Procedural SDF shapes
    let p = uv - 0.5;
    var sdf: f32;
    var alpha: f32;

    if (u.shapeMode == 1) {
        // Circle
        sdf = length(p) - 0.45;
    } else if (u.shapeMode == 2) {
        // Ring
        sdf = abs(length(p) - 0.35) - 0.08;
    } else if (u.shapeMode == 3) {
        // Square
        sdf = max(abs(p.x), abs(p.y)) - 0.4;
    } else if (u.shapeMode == 4) {
        // Diamond
        sdf = abs(p.x) + abs(p.y) - 0.45;
    } else if (u.shapeMode == 5) {
        // Equilateral triangle (Inigo Quilez SDF)
        let r = 0.25;
        let k = 1.732050808; // sqrt(3)
        var t = vec2<f32>(abs(p.x) - r, p.y - 0.04 + r / k);
        if (t.x + k * t.y > 0.0) { t = vec2<f32>(t.x - k * t.y, -k * t.x - t.y) / 2.0; }
        t.x -= clamp(t.x, -2.0 * r, 0.0);
        sdf = -length(t) * sign(t.y);
    } else if (u.shapeMode == 6) {
        // 5-point star (Inigo Quilez SDF — straight edges)
        let r = 0.35;
        let rf = 0.4;
        let k1 = vec2<f32>(0.809016994375, -0.587785252292);
        let k2 = vec2<f32>(-k1.x, k1.y);
        var s = vec2<f32>(abs(p.x), p.y);
        s -= 2.0 * max(dot(k1, s), 0.0) * k1;
        s -= 2.0 * max(dot(k2, s), 0.0) * k2;
        s.x = abs(s.x);
        s.y -= r;
        let ba = rf * vec2<f32>(-k1.y, k1.x) - vec2<f32>(0.0, 1.0);
        let h = clamp(dot(s, ba) / dot(ba, ba), 0.0, r);
        sdf = length(s - ba * h) * sign(s.y * ba.x - s.x * ba.y);
    } else {
        // Soft (7) — gaussian falloff
        alpha = exp(-dot(p, p) * 8.0);
        return vec4<f32>(color.rgb * alpha, alpha * color.a) * opacity;
    }

    alpha = 1.0 - smoothstep(-0.02, 0.02, sdf);
    return vec4<f32>(color.rgb * alpha, alpha * color.a) * opacity;
}

fn blurSample(uv: vec2f, color: vec4f) -> vec4f {
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec4f(0.0); }
    return shadeSprite(uv, color);
}

// Continuous source-grid footprints retain RGBA mass and spatial centers.
fn blurWeight(uv: vec2f, center: vec2f, expansion: f32) -> f32 {
    let p = (uv - center) / expansion;
    let gaussian = exp(-dot(p, p) / 0.0648) * (1.0 - smoothstep(0.45, 0.5, length(p)));
    return gaussian * min(1.0, 1.0 / (0.2035752 * expansion * expansion));
}

fn shadeParticle(in: VertexOutput) -> vec4f {
    if (in.blurRadius <= 0.0) { return shadeSprite(in.spriteUV, in.color); }
    let expansion = 1.0 + 2.0 * in.blurRadius;
    var blurred = vec4f(0.0);
    if (u.shapeMode == 0) {
        for (var y = 0; y < 5; y++) {
            for (var x = 0; x < 5; x++) {
                let source = textureLoad(spriteMeanTex, vec2i(x, y), 0);
                blurred += source * blurWeight(in.spriteUV, vec2f(f32(x), f32(y)) / 4.0, expansion);
            }
        }
        blurred *= in.color * (u.depositOpacity / 100.0);
    } else {
        var meanColor = vec4f(0.0);
        for (var y = 0; y < 5; y++) {
            for (var x = 0; x < 5; x++) {
                meanColor += shadeSprite((vec2f(f32(x), f32(y)) + 0.5) / 5.0, in.color);
            }
        }
        let center = select(vec2f(0.5), vec2f(0.5, 0.54), u.shapeMode == 5);
        blurred = meanColor / 25.0 * blurWeight(in.spriteUV, center, expansion);
    }
    return mix(blurSample(in.spriteUV, in.color), blurred, smoothstep(0.0, 0.5, in.blurRadius));
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
    let color = shadeParticle(in);
    return color;
}
