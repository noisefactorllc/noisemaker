# Mesh Loader

**Note:** The mesh loader is a proof of concept that currently only supports OBJ format.

Load external OBJ mesh files into mesh surface textures for GPU rendering.

## Usage

```
meshLoader().meshRender().write(o0)
```

The demo UI shows a file picker when meshLoader is in the pipeline. Select an OBJ file to load it.

## Parameters

This effect has no parameters. Mesh transforms (scale, offset) are applied in `meshRender()`.

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
