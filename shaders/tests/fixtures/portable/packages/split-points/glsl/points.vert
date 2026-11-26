#version 300 es
precision highp float;

// A 4 x 4 grid of points, one per vertex. Point (column, row) lands on the
// centre of the pixel floor(resolution / 4 * (column + 0.5, row + 0.5)), so it
// covers that one pixel. Its colour is (column / 3, row / 3, 1).

uniform vec2 resolution;

out vec4 vColor;

void main() {
    int column = gl_VertexID % 4;
    int row = gl_VertexID / 4;
    vec2 pixel = floor(resolution * 0.25 * (vec2(float(column), float(row)) + 0.5)) + 0.5;
    gl_Position = vec4(pixel / resolution * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = 1.0;
    vColor = vec4(float(column) / 3.0, float(row) / 3.0, 1.0, 1.0);
}
