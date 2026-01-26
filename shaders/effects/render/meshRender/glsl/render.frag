#version 300 es
precision highp float;

// Mesh Render Fragment Shader
// Blinn-Phong lighting with diffuse, specular, ambient, and rim

// Lighting uniforms
uniform vec3 lightDirection;
uniform vec3 diffuseColor;
uniform float diffuseIntensity;
uniform vec3 specularColor;
uniform float specularIntensity;
uniform float shininess;
uniform vec3 ambientColor;
uniform float rimIntensity;
uniform float rimPower;
uniform vec3 meshColor;
uniform int wireframe;

in vec3 vNormal;
in vec2 vUV;
in vec3 vPosition;

out vec4 fragColor;

void main() {
    // Normalize inputs
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(lightDirection);
    
    // View direction (camera looking down -Z in orthographic)
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    
    // Ambient lighting
    vec3 ambient = ambientColor * meshColor;
    
    // Diffuse lighting (Lambertian)
    float diffuseFactor = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = diffuseColor * diffuseFactor * meshColor * diffuseIntensity;
    
    // Specular lighting (Blinn-Phong)
    vec3 halfDir = normalize(lightDir + viewDir);
    float specAngle = max(dot(halfDir, normal), 0.0);
    float specularFactor = pow(specAngle, shininess);
    vec3 specular = specularColor * specularFactor * specularIntensity;
    
    // Fresnel rim lighting
    float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), rimPower);
    vec3 rimLight = vec3(rim) * rimIntensity;
    
    // Combine lighting
    vec3 color = ambient + diffuse + specular + rimLight;
    
    // Wireframe mode: draw edges only
    if (wireframe == 1) {
        // Use screen-space derivatives to detect edges
        vec3 ndx = dFdx(vNormal);
        vec3 ndy = dFdy(vNormal);
        float normalEdge = length(ndx) + length(ndy);
        
        if (normalEdge < 0.1) {
            discard;  // Discard interior pixels
        }
        color = meshColor;  // Wireframe is flat colored
    }
    
    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));
    
    fragColor = vec4(color, 1.0);
}
