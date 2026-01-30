import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
    name: "Mesh Render",
    namespace: "render",
    func: "meshRender",
    tags: ["mesh", "geometry"],

    description: "Render triangle mesh from mesh surface textures with Blinn-Phong lighting",

    textures: {},

    globals: {
        // Mesh model transforms (applied before view transforms)
        scale: {
            type: "float",
            default: 1.0,
            min: 0.01,
            max: 10.0,
            uniform: "meshScale",
            ui: {
                label: "Mesh Scale",
                control: "slider",
                category: "mesh"
            }
        },

        offsetX: {
            type: "float",
            default: 0.0,
            min: -5.0,
            max: 5.0,
            uniform: "meshOffsetX",
            ui: {
                label: "Mesh Offset X",
                control: "slider",
                category: "mesh"
            }
        },

        offsetY: {
            type: "float",
            default: 0.0,
            min: -5.0,
            max: 5.0,
            uniform: "meshOffsetY",
            ui: {
                label: "Mesh Offset Y",
                control: "slider",
                category: "mesh"
            }
        },

        offsetZ: {
            type: "float",
            default: 0.0,
            min: -5.0,
            max: 5.0,
            uniform: "meshOffsetZ",
            ui: {
                label: "Mesh Offset Z",
                control: "slider",
                category: "mesh"
            }
        },

        // Camera/view rotation X
        rotateX: {
            type: "float",
            default: 0.3,
            min: -3.14159,
            max: 3.14159,
            uniform: "rotateX",
            ui: {
                label: "Rotate X",
                control: "slider",
                category: "view"
            }
        },

        // Camera/view rotation Y
        rotateY: {
            type: "float",
            default: 0.0,
            min: -3.14159,
            max: 3.14159,
            uniform: "rotateY",
            ui: {
                label: "Rotate Y",
                control: "slider",
                category: "view"
            }
        },

        // Camera/view rotation Z
        rotateZ: {
            type: "float",
            default: 0.0,
            min: -3.14159,
            max: 3.14159,
            uniform: "rotateZ",
            ui: {
                label: "Rotate Z",
                control: "slider",
                category: "view"
            }
        },

        // View scale/zoom
        viewScale: {
            type: "float",
            default: 1.0,
            min: 0.1,
            max: 10.0,
            uniform: "viewScale",
            ui: {
                label: "Zoom",
                control: "slider",
                category: "view"
            }
        },

        // Camera position X
        posX: {
            type: "float",
            default: 0.0,
            min: -10.0,
            max: 10.0,
            uniform: "posX",
            ui: {
                label: "Position X",
                control: "slider",
                category: "view"
            }
        },

        // Camera position Y
        posY: {
            type: "float",
            default: 0.0,
            min: -10.0,
            max: 10.0,
            uniform: "posY",
            ui: {
                label: "Position Y",
                control: "slider",
                category: "view"
            }
        },

        // Light direction
        lightDirection: {
            type: "vec3",
            default: [0.5, 0.7, 0.5],
            uniform: "lightDirection",
            ui: {
                label: "Light Direction",
                control: "vector3",
                category: "lighting"
            }
        },

        // Diffuse color
        diffuseColor: {
            type: "color",
            default: [1.0, 1.0, 1.0],
            uniform: "diffuseColor",
            ui: {
                label: "Diffuse Color",
                control: "color",
                category: "diffuse"
            }
        },

        // Diffuse intensity
        diffuseIntensity: {
            type: "float",
            default: 0.7,
            min: 0.0,
            max: 2.0,
            step: 0.01,
            uniform: "diffuseIntensity",
            ui: {
                label: "Diffuse Intensity",
                control: "slider",
                category: "diffuse"
            }
        },

        // Specular color
        specularColor: {
            type: "color",
            default: [1.0, 1.0, 1.0],
            uniform: "specularColor",
            ui: {
                label: "Specular Color",
                control: "color",
                category: "specular"
            }
        },

        // Specular intensity
        specularIntensity: {
            type: "float",
            default: 0.3,
            min: 0.0,
            max: 2.0,
            step: 0.01,
            uniform: "specularIntensity",
            ui: {
                label: "Specular Intensity",
                control: "slider",
                category: "specular"
            }
        },

        // Shininess (specular power)
        shininess: {
            type: "float",
            default: 32.0,
            min: 1.0,
            max: 256.0,
            step: 1.0,
            uniform: "shininess",
            ui: {
                label: "Shininess",
                control: "slider",
                category: "specular"
            }
        },

        // Ambient color
        ambientColor: {
            type: "color",
            default: [0.1, 0.1, 0.1],
            uniform: "ambientColor",
            ui: {
                label: "Ambient Color",
                control: "color",
                category: "ambient"
            }
        },

        // Rim light intensity (Fresnel)
        rimIntensity: {
            type: "float",
            default: 0.15,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            uniform: "rimIntensity",
            ui: {
                label: "Rim Intensity",
                control: "slider",
                category: "rim"
            }
        },

        // Rim light power
        rimPower: {
            type: "float",
            default: 3.0,
            min: 0.5,
            max: 8.0,
            step: 0.1,
            uniform: "rimPower",
            ui: {
                label: "Rim Power",
                control: "slider",
                category: "rim"
            }
        },

        // Base mesh color
        meshColor: {
            type: "color",
            default: [0.8, 0.8, 0.8],
            uniform: "meshColor",
            ui: {
                label: "Base Color",
                control: "color",
                category: "material"
            }
        },

        // Background color
        bgColor: {
            type: "color",
            default: [0.1, 0.1, 0.15],
            uniform: "bgColor",
            ui: {
                label: "Background",
                control: "color",
                category: "material"
            }
        },

        // Background alpha
        bgAlpha: {
            type: "float",
            default: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            uniform: "bgAlpha",
            ui: {
                label: "Background Alpha",
                control: "slider",
                category: "material"
            }
        },

        // Wireframe mode
        wireframe: {
            type: "int",
            default: 0,
            uniform: "wireframe",
            choices: {
                "solid": 0,
                "wireframe": 1
            },
            ui: {
                label: "Render Mode",
                control: "dropdown",
                category: "material"
            }
        }
    },

    passes: [
        // Clear pass - fill with background color
        {
            name: "clear",
            program: "clear",
            inputs: {},
            uniforms: {
                bgColor: "bgColor",
                bgAlpha: "bgAlpha"
            },
            outputs: {
                fragColor: "outputTex"
            }
        },

        // Render triangles from mesh textures
        {
            name: "render",
            program: "render",
            drawMode: "triangles",
            count: 'input',  // Derive from meshPositions texture dimensions

            blend: false,

            inputs: {
                inputTex: "inputTex",  // Accept pipeline input (makes effect chainable)
                meshPositions: "global_mesh0_positions",
                meshNormals: "global_mesh0_normals"
            },

            uniforms: {
                meshScale: "meshScale",
                meshOffsetX: "meshOffsetX",
                meshOffsetY: "meshOffsetY",
                meshOffsetZ: "meshOffsetZ",
                rotateX: "rotateX",
                rotateY: "rotateY",
                rotateZ: "rotateZ",
                viewScale: "viewScale",
                posX: "posX",
                posY: "posY",
                lightDirection: "lightDirection",
                diffuseColor: "diffuseColor",
                diffuseIntensity: "diffuseIntensity",
                specularColor: "specularColor",
                specularIntensity: "specularIntensity",
                shininess: "shininess",
                ambientColor: "ambientColor",
                rimIntensity: "rimIntensity",
                rimPower: "rimPower",
                meshColor: "meshColor",
                wireframe: "wireframe"
            },

            outputs: {
                fragColor: "outputTex"
            }
        }
    ]
})
