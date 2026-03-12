// Mesh Render Shader - Combined vertex and fragment
// Blinn-Phong lighting with diffuse, specular, ambient, and rim

struct Uniforms {
    resolution: vec2<f32>,
    aspect: f32,
    meshScale: f32,
    meshOffsetX: f32,
    meshOffsetY: f32,
    meshOffsetZ: f32,
    rotateX: f32,
    rotateY: f32,
    rotateZ: f32,
    viewScale: f32,
    posX: f32,
    posY: f32,
    lightDirection: vec3<f32>,
    diffuseColor: vec3<f32>,
    diffuseIntensity: f32,
    specularColor: vec3<f32>,
    specularIntensity: f32,
    shininess: f32,
    ambientColor: vec3<f32>,
    rimIntensity: f32,
    rimPower: f32,
    meshColor: vec3<f32>,
    wireframe: i32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) @interpolate(perspective, center) normal: vec3<f32>,
    @location(1) @interpolate(perspective, center) uv: vec2<f32>,
    @location(2) @interpolate(perspective, center) worldPos: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var meshPositions: texture_2d<f32>;
@group(0) @binding(2) var meshNormals: texture_2d<f32>;

// Rotation matrices
fn rotationX(angle: f32) -> mat3x3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat3x3<f32>(
        vec3<f32>(1.0, 0.0, 0.0),
        vec3<f32>(0.0, c, -s),
        vec3<f32>(0.0, s, c)
    );
}

fn rotationY(angle: f32) -> mat3x3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat3x3<f32>(
        vec3<f32>(c, 0.0, s),
        vec3<f32>(0.0, 1.0, 0.0),
        vec3<f32>(-s, 0.0, c)
    );
}

fn rotationZ(angle: f32) -> mat3x3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat3x3<f32>(
        vec3<f32>(c, -s, 0.0),
        vec3<f32>(s, c, 0.0),
        vec3<f32>(0.0, 0.0, 1.0)
    );
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;
    
    // Get texture dimensions
    let texSize = textureDimensions(meshPositions, 0);
    let texWidth = i32(texSize.x);
    
    // Compute texel coordinate from vertex ID
    let vertexID = i32(vertexIndex);
    let x = vertexID % texWidth;
    let y = vertexID / texWidth;
    
    // Read vertex data
    let posData = textureLoad(meshPositions, vec2<i32>(x, y), 0);
    let normalData = textureLoad(meshNormals, vec2<i32>(x, y), 0);
    
    var position = posData.xyz;
    let normal = normalData.xyz;
    
    // Apply mesh model transforms (scale then offset)
    position = position * u.meshScale;
    position.x = position.x + u.meshOffsetX;
    position.y = position.y + u.meshOffsetY;
    position.z = position.z + u.meshOffsetZ;
    
    // Build rotation matrix (uniforms are in degrees)
    let deg2rad = 3.14159265 / 180.0;
    let rotation = rotationZ(u.rotateZ * deg2rad) * rotationY(u.rotateY * deg2rad) * rotationX(u.rotateX * deg2rad);
    
    // Transform
    var rotatedPos = rotation * position;
    let rotatedNormal = rotation * normal;
    
    // Apply camera translation
    rotatedPos.x = rotatedPos.x + u.posX;
    rotatedPos.y = rotatedPos.y + u.posY;
    
    // Orthographic projection with scale
    var clipPos = rotatedPos.xy * u.viewScale;
    clipPos.x = clipPos.x / u.aspect;
    
    // Flip Y for WebGPU
    clipPos.y = -clipPos.y;
    
    // Orthographic depth: map Z to NDC range [0, 1] for depth buffer
    // Assuming mesh is roughly centered, use a reasonable depth range
    let nearZ = -10.0;
    let farZ = 10.0;
    let ndcZ = (rotatedPos.z - nearZ) / (farZ - nearZ);  // Maps to [0, 1]
    
    out.position = vec4<f32>(clipPos, ndcZ, 1.0);
    out.normal = rotatedNormal;
    out.uv = vec2<f32>(f32(x) / f32(texWidth), f32(y) / f32(i32(texSize.y)));
    out.worldPos = rotatedPos;
    
    return out;
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Normalize inputs
    let normal = normalize(in.normal);
    let lightDir = normalize(u.lightDirection);
    
    // View direction (camera looking down -Z in orthographic)
    let viewDir = vec3<f32>(0.0, 0.0, 1.0);
    
    // Ambient lighting
    let ambient = u.ambientColor * u.meshColor;
    
    // Diffuse lighting (Lambertian)
    let diffuseFactor = max(dot(normal, lightDir), 0.0);
    let diffuse = u.diffuseColor * diffuseFactor * u.meshColor * u.diffuseIntensity;
    
    // Specular lighting (Blinn-Phong)
    let halfDir = normalize(lightDir + viewDir);
    let specAngle = max(dot(halfDir, normal), 0.0);
    let specularFactor = pow(specAngle, u.shininess);
    let specular = u.specularColor * specularFactor * u.specularIntensity;
    
    // Fresnel rim lighting
    let rim = pow(1.0 - max(dot(normal, viewDir), 0.0), u.rimPower);
    let rimLight = vec3<f32>(rim) * u.rimIntensity;
    
    // Combine lighting
    var color = ambient + diffuse + specular + rimLight;
    
    // Wireframe mode (simplified - just flat color)
    if (u.wireframe == 1) {
        color = u.meshColor;
    }
    
    // Gamma correction
    color = pow(color, vec3<f32>(1.0 / 2.2));
    
    return vec4<f32>(color, 1.0);
}
