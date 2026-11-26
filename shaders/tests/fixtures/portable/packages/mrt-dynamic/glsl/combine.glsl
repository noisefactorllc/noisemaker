#version 300 es
precision highp float;

// Each output pixel takes red from its cell in the first target and green
// from its cell in the second. Blue and alpha are 1.

uniform sampler2D columnCells;
uniform sampler2D rowCells;
uniform vec2 resolution;

out vec4 fragColor;

void main() {
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    ivec2 screen = ivec2(resolution);
    ivec2 columnCell = pixel * textureSize(columnCells, 0) / screen;
    ivec2 rowCell = pixel * textureSize(rowCells, 0) / screen;
    float red = texelFetch(columnCells, columnCell, 0).r;
    float green = texelFetch(rowCells, rowCell, 0).g;
    fragColor = vec4(red, green, 1.0, 1.0);
}
