import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
    name: "Points Render",
    namespace: "render",
    func: "pointsRender",
    tags: ["agents"],

    description: "Blend agent trails with input for particle systems",

    // Internal trail texture for accumulation (namespaced like flow)
    textures: {
        global_points_trail: {
            width: "100%",
            height: "100%",
            format: "rgba16f"
        }
    },

    globals: {
        // Agent density for visualization (percentage to render)
        density: {
            type: "float",
            default: 50.0,
            min: 0.0,
            max: 100.0,
            uniform: "density",
            ui: {
                label: "density",
                control: "slider",
                category: "visual"
            }
        },

        // Trail persistence (0=instant fade, 100=no decay)
        intensity: {
            type: "float",
            default: 75.0,
            min: 0.0,
            max: 100.0,
            uniform: "intensity",
            ui: {
                label: "trail intensity",
                control: "slider",
                category: "visual"
            }
        },

        // Input blend factor (0=trail only, 100=input fully visible)
        inputIntensity: {
            type: "float",
            default: 10.15,
            min: 0.0,
            max: 100.0,
            uniform: "inputIntensity",
            ui: {
                label: "input mix",
                control: "slider",
                category: "visual"
            }
        },

        // 3D viewport: view mode (0=2D normalized, 1=3D orthographic)
        viewMode: {
            type: "int",
            default: 0,
            uniform: "viewMode",
            choices: {
                "flat": 0,
                "ortho": 1
            },
            ui: {
                label: "view",
                control: "dropdown",
                category: "view"
            }
        },

        // 3D viewport: rotation around X axis (radians)
        rotateX: {
            type: "float",
            default: 0.3,
            uniform: "rotateX",
            min: 0,
            max: 6.283185,
            step: 0.01,
            ui: {
                label: "rotate x",
                control: "slider",
                category: "view",
                enabledBy: "viewMode"
            }
        },

        // 3D viewport: rotation around Y axis (radians)
        rotateY: {
            type: "float",
            default: 0,
            uniform: "rotateY",
            min: 0,
            max: 6.283185,
            step: 0.01,
            ui: {
                label: "rotate y",
                control: "slider",
                category: "view",
                enabledBy: "viewMode"
            }
        },

        // 3D viewport: rotation around Z axis (radians)
        rotateZ: {
            type: "float",
            default: 0,
            uniform: "rotateZ",
            min: 0,
            max: 6.283185,
            step: 0.01,
            ui: {
                label: "rotate z",
                control: "slider",
                category: "view",
                enabledBy: "viewMode"
            }
        },

        // 3D viewport: zoom/scale factor
        viewScale: {
            type: "float",
            default: 0.8,
            uniform: "viewScale",
            min: 0.1,
            max: 10,
            step: 0.01,
            ui: {
                label: "zoom",
                control: "slider",
                category: "view",
                enabledBy: "viewMode"
            }
        },

        // 3D viewport: position offset X
        posX: {
            type: "float",
            default: 0,
            uniform: "posX",
            min: -50,
            max: 50,
            step: 0.1,
            ui: {
                label: "pos x",
                control: "slider",
                category: "view",
                enabledBy: "viewMode"
            }
        },

        // 3D viewport: position offset Y
        posY: {
            type: "float",
            default: 0,
            uniform: "posY",
            min: -50,
            max: 50,
            step: 0.1,
            ui: {
                label: "pos y",
                control: "slider",
                category: "view",
                enabledBy: "viewMode"
            }
        },

        // Matte opacity (0=transparent background, 1=opaque)
        matteOpacity: {
            type: "float",
            default: 1.0,
            min: 0.0,
            max: 1.0,
            randMin: 0.75,
            uniform: "matteOpacity",
            ui: {
                label: "bg opacity",
                control: "slider",
                category: "visual"
            }
        }
    },

    passes: [
        // Pass 1: Diffuse - decay existing trail (matches flow)
        {
            name: "diffuse",
            program: "diffuse",

            inputs: {
                trailTex: "global_points_trail"
            },

            uniforms: {
                intensity: "intensity"
            },

            outputs: {
                fragColor: "global_points_trail"
            }
        },

        // Pass 2: Copy decayed trail to write buffer before deposit
        // This ensures hardware blending works correctly after ping-pong
        {
            name: "copy",
            program: "copy",

            inputs: {
                sourceTex: "global_points_trail"
            },

            outputs: {
                fragColor: "global_points_trail"
            }
        },

        // Pass 3: Deposit - scatter agent colors to trail
        {
            name: "deposit",
            program: "deposit",
            drawMode: "points",
            count: 'input', // Derive from xyzTex dimensions for dynamic stateSize
            blend: true,

            inputs: {
                // Read from shared global textures (within-frame updates visible)
                xyzTex: "global_xyz",
                rgbaTex: "global_rgba"
            },

            uniforms: {
                density: "density",
                viewMode: "viewMode",
                rotateX: "rotateX",
                rotateY: "rotateY",
                rotateZ: "rotateZ",
                viewScale: "viewScale",
                posX: "posX",
                posY: "posY"
            },

            outputs: {
                fragColor: "global_points_trail"
            }
        },

        // Pass 3: Blend - composite trail with input
        {
            name: "blend",
            program: "blend",

            inputs: {
                inputTex: "inputTex",
                trailTex: "global_points_trail"
            },

            uniforms: {
                inputIntensity: "inputIntensity",
                matteOpacity: "matteOpacity"
            },

            outputs: {
                fragColor: "outputTex"
            }
        }
    ]
})
