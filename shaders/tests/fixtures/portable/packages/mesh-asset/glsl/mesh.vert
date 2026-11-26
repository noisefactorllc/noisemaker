#version 300 es
precision highp float;

// One vertex per texel of the mesh textures. Mesh x and y are clip-space x
// and y, with no transform. A texel past the mesh has position w 0 and is
// moved outside the clip volume.

uniform sampler2D meshPositions;
uniform sampler2D meshNormals;

out vec3 vNormal;

void main() {
    int width = textureSize(meshPositions, 0).x;
    ivec2 texel = ivec2(gl_VertexID % width, gl_VertexID / width);
    vec4 position = texelFetch(meshPositions, texel, 0);
    vNormal = texelFetch(meshNormals, texel, 0).xyz;
    if (position.w < 0.5) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    gl_Position = vec4(position.xy, position.z * 0.25 + 0.5, 1.0);
}
