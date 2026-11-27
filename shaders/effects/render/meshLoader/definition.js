// Generated from definition.json by scripts/migrate-portable-effects.mjs. Do not edit.
import { Effect } from '../../../src/runtime/effect.js'

class MeshLoader extends Effect {
    "name" = "Mesh Loader"
    "namespace" = "render"
    "func" = "meshLoader"
    "tags" = [
        "mesh",
        "geometry",
        "3d"
    ]
    "description" = "Load mesh data from OBJ files into GPU textures."
    "externalMesh" = "mesh0"
    "builtinMeshes" = {
        "sphere": "share/meshes/sphere.obj",
        "cube": "share/meshes/cube.obj",
        "torus": "share/meshes/torus.obj",
        "cylinder": "share/meshes/cylinder.obj",
        "cone": "share/meshes/cone.obj",
        "capsule": "share/meshes/capsule.obj",
        "icosphere": "share/meshes/icosphere.obj"
    }
    "textures" = {}
    "globals" = {}
    "defaultProgram" = "search render\n\nmeshLoader()\n.meshRender()\n.write(o0)"
    "passes" = [
        {
            "name": "preview",
            "program": "preview",
            "inputs": {
                "positionsTex": "global_mesh0_positions",
                "normalsTex": "global_mesh0_normals"
            },
            "outputs": {
                "fragColor": "outputTex"
            }
        }
    ]
}

export default MeshLoader
