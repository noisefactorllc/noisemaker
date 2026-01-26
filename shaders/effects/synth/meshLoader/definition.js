import { Effect } from '../../../src/runtime/effect.js'

/**
 * Mesh Loader - Load mesh data from OBJ files
 *
 * Synth effect that populates mesh surface textures (positions, normals, UVs)
 * from external OBJ files. The mesh data is uploaded to GPU textures and can
 * be rendered using meshRender.
 *
 * Usage:
 *   meshLoader(url: "/models/teapot.obj").meshRender().write(o0)
 *
 * The URL is processed by the demo UI which calls canvas.loadOBJFromURL()
 * to populate the mesh0 surfaces.
 */
export default class MeshLoader extends Effect {
    name = "Mesh Loader"
    namespace = "synth"
    func = "meshLoader"
    tags = ["mesh", "geometry", "3D", "OBJ"]
    description = "Load mesh data from OBJ files into GPU textures."

    // Mark this as requiring external mesh data (like externalTexture for media)
    // The demo-ui detects this and handles URL loading
    externalMesh = "mesh0"

    // No local textures - we write directly to global mesh surfaces
    textures = {}

    // No globals - mesh transforms (scale, offset) are applied in meshRender
    globals = {}

    // Preview pass shows the loaded mesh texture data
    passes = [
        {
            name: "preview",
            program: "preview",
            inputs: {
                positionsTex: "global_mesh0_positions",
                normalsTex: "global_mesh0_normals"
            },
            outputs: {
                fragColor: "outputTex"
            }
        }
    ]
}
