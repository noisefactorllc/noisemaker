# Mesh Loader

An optional marker and preview stage for mesh rendering. It marks the pipeline as one that uses the `mesh0` mesh, and it shows a preview of that mesh data. The mesh data itself comes from the host, which uploads it into the mesh surface textures. Includes built-in procedural shapes and supports custom OBJ file upload in the demo UI.

## Usage

```
meshLoader().meshRender().write(o0)
```

The demo UI shows a shape dropdown and file picker when meshLoader is in the pipeline, and it uploads the selected mesh to `mesh0`.

## Role in the Pipeline

`meshRender()` draws the mesh from the mesh surface textures. It does not read the output of meshLoader. So meshLoader is optional when the host uploads the mesh with the JavaScript API below, and a chain without it renders the same mesh.

## Preview Output

The output of meshLoader shows the loaded mesh data as colors: vertex positions in the left half and normals in the right half. This output is a preview, and it is visible only when meshLoader is the last stage, for example `meshLoader().write(o0)`.

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
