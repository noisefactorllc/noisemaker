import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
    name: "Points Billboard Render",
    namespace: "render",
    func: "pointsBillboardRender",
    tags: ["agents"],

    description: "Render agent particles as billboard sprites with texture sampling",

    // Internal trail texture for accumulation
    textures: {
        global_billboard_trail: {
            width: "100%",
            height: "100%",
            format: "rgba16f"
        }
    },

    globals: {
        // Sprite texture source
        tex: {
            type: "surface",
            default: "none",
            ui: {
                label: "sprite",
                category: "source"
            }
        },

        // Base point size in pixels
        pointSize: {
            type: "float",
            default: 8.0,
            min: 1.0,
            max: 64.0,
            uniform: "pointSize",
            ui: {
                label: "point size",
                control: "slider",
                category: "visual"
            }
        },

        // Point size variation (0=uniform, 100=full range)
        sizeVariation: {
            type: "float",
            default: 0.0,
            min: 0.0,
            max: 100.0,
            uniform: "sizeVariation",
            ui: {
                label: "size variation",
                control: "slider",
                category: "visual"
            }
        },

        // Point rotation variation (0=no rotation, 100=full 360° range)
        rotationVar: {
            type: "float",
            default: 0.0,
            min: 0.0,
            max: 100.0,
            uniform: "rotationVariation",
            ui: {
                label: "rotation variation",
                control: "slider",
                category: "visual"
            }
        },

        // Random seed for deterministic noise
        seed: {
            type: "int",
            default: 42.0,
            min: 0.0,
            max: 1000.0,
            uniform: "seed",
            ui: {
                label: "seed",
                control: "slider",
                category: "visual"
            }
        },

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
                label: "input intensity",
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
        }
    },

    paramAliases: { rotationVariation: 'rotationVar' },

    passes: [
        // Pass 1: Diffuse - decay existing trail
        {
            name: "diffuse",
            program: "diffuse",

            inputs: {
                trailTex: "global_billboard_trail"
            },

            uniforms: {
                intensity: "intensity"
            },

            outputs: {
                fragColor: "global_billboard_trail"
            }
        },

        // Pass 2: Copy decayed trail to write buffer before deposit
        {
            name: "copy",
            program: "copy",

            inputs: {
                sourceTex: "global_billboard_trail"
            },

            outputs: {
                fragColor: "global_billboard_trail"
            }
        },

        // Pass 3: Deposit - scatter billboard quads to trail
        {
            name: "deposit",
            program: "deposit",
            drawMode: "billboards",
            count: 'input', // Derive from xyzTex dimensions for dynamic stateSize
            blend: true,

            inputs: {
                // Read from shared global textures
                xyzTex: "global_xyz",
                rgbaTex: "global_rgba",
                spriteTex: "tex"
            },

            uniforms: {
                density: "density",
                pointSize: "pointSize",
                sizeVariation: "sizeVariation",
                rotationVariation: "rotationVariation",
                seed: "seed",
                viewMode: "viewMode",
                rotateX: "rotateX",
                rotateY: "rotateY",
                rotateZ: "rotateZ",
                viewScale: "viewScale",
                posX: "posX",
                posY: "posY"
            },

            outputs: {
                fragColor: "global_billboard_trail"
            }
        },

        // Pass 4: Blend - composite trail with input
        {
            name: "blend",
            program: "blend",

            inputs: {
                inputTex: "inputTex",
                trailTex: "global_billboard_trail"
            },

            uniforms: {
                inputIntensity: "inputIntensity"
            },

            outputs: {
                fragColor: "outputTex"
            }
        }
    ]
})
