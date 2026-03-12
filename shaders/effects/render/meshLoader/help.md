# Mesh Loader

Load mesh data into mesh surface textures for GPU rendering. Includes built-in procedural shapes and supports custom OBJ file upload.

## Usage

```
meshLoader().meshRender().write(o0)
```

The demo UI shows a shape dropdown and file picker when meshLoader is in the pipeline.

## Built-in Shapes

| Shape | Description |
|-------|-------------|
| cube | 8 vertices, 12 triangles |
| sphere | UV sphere (32x16 segments) |
| torus | Ring torus (32x16 segments) |
| cylinder | Capped cylinder (32 segments) |
| cone | Capped cone (32 segments) |
| capsule | Cylinder with hemisphere caps (32x8 segments) |
| icosphere | Subdivided icosahedron (2 levels) |

## Parameters

Mesh transforms (scale, offset) are applied in `meshRender()`, not here.

## OBJ Format Support

The OBJ parser supports:
- Vertices (`v x y z`)
- Texture coordinates (`vt u v`)
- Normals (`vn x y z`)
- Faces (`f v/vt/vn ...`) with vertex/uv/normal indices
- Triangulation of quads and n-gons

## JavaScript API

```javascript
// Load from URL
await canvas.loadOBJFromURL('/models/teapot.obj', 'mesh0');

// Load from string
await canvas.loadOBJFromString(objContent, 'mesh0');
```
