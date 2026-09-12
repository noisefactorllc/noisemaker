import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
    name: "Points Billboard Render",
    namespace: "render",
    func: "pointsBillboardRender",
    tags: ["agents"],
    openCategories: ["source", "visual"],

    description: "Render particles as billboard sprites",

    // Internal trail texture for accumulation
    textures: {
        spriteMeanTiles: { width: 160, height: 160, format: "rgba32f" },
        spriteMean: { width: 5, height: 5, format: "rgba32f" },
        global_billboard_trail: {
            width: "100%",
            height: "100%",
            format: "rgba16f"
        }
    },

    globals: {
        // Shape mode: procedural SDF shapes or texture
        shapeMode: {
            type: "int",
            default: 1,
            uniform: "shapeMode",
            choices: {
                texture: 0,
                circle: 1,
                ring: 2,
                square: 3,
                diamond: 4,
                triangle: 5,
                star: 6,
                soft: 7
            },
            randMin: 1,
            ui: {
                label: "shape",
                control: "dropdown",
                category: "source"
            }
        },

        // Sprite texture source
        tex: {
            type: "surface",
            default: "none",
            ui: {
                label: "sprite",
                category: "source",
                enabledBy: { param: "shapeMode", eq: 0 } // Only show when shapeMode is 'texture'
            }
        },

        // Blend mode for deposit pass
        blendMode: {
            type: "int",
            default: 0,
            uniform: "blendMode",
            choices: {
                additive: 0,
                alpha: 1
            },
            ui: {
                label: "blend",
                control: "dropdown",
                category: "visual"
            }
        },

        // Deposit opacity (controls additive blowout)
        depositOpacity: {
            type: "float",
            default: 20.0,
            min: 1.0,
            max: 100.0,
            uniform: "depositOpacity",
            ui: {
                label: "opacity",
                control: "slider",
                category: "visual"
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
            uniform: "rotationVar",
            ui: {
                label: "rot variation",
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
            randMin: 50,
            uniform: "inputIntensity",
            ui: {
                label: "input mix",
                control: "slider",
                category: "visual"
            }
        },

        // Existing modes retain their projection; perspective uses world coordinates.
        viewMode: {
            type: "int",
            default: 0,
            uniform: "viewMode",
            choices: {
                "flat": 0,
                "ortho": 1,
                "perspective": 2
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

        posZ: {
            type: "float",
            default: 0,
            uniform: "posZ",
            min: -200,
            max: 200,
            step: 0.1,
            ui: {
                label: "pos z",
                control: "slider",
                category: "view",
                enabledBy: "viewMode"
            }
        },

        fieldOfView: {
            type: "float",
            default: 60,
            uniform: "fieldOfView",
            min: 10,
            max: 150,
            step: 1,
            ui: {
                label: "field of view",
                control: "slider",
                category: "view",
                enabledBy: { param: "viewMode", eq: 2 }
            }
        },

        sizeDistance: {
            type: "float",
            default: 0,
            uniform: "sizeDistance",
            min: 0,
            max: 500,
            step: 1,
            ui: {
                label: "size fade distance",
                control: "slider",
                category: "distance",
                enabledBy: "viewMode"
            }
        },

        brightnessDistance: {
            type: "float",
            default: 0,
            uniform: "brightnessDistance",
            min: 0,
            max: 500,
            step: 1,
            ui: {
                label: "brightness fade distance",
                control: "slider",
                category: "distance",
                enabledBy: "viewMode"
            }
        },

        aperture: {
            type: "float",
            default: 0,
            uniform: "aperture",
            min: 0,
            max: 20,
            step: 0.1,
            ui: {
                label: "aperture",
                control: "slider",
                category: "focus",
                enabledBy: "viewMode"
            }
        },

        focalDistance: {
            type: "float",
            default: 80,
            uniform: "focalDistance",
            min: 1,
            max: 500,
            step: 1,
            ui: {
                label: "focal dist",
                control: "slider",
                category: "focus",
                enabledBy: "viewMode"
            }
        }
    },

    paramAliases: { rotationVariation: 'rotationVar' },

    passes: [
        {
            name: "spriteMeanTiles",
            type: "compute",
            program: "spriteMeanTiles",
            inputs: { spriteTex: "tex" },
            uniforms: { shapeMode: "shapeMode", aperture: "aperture", viewMode: "viewMode" },
            outputs: { fragColor: "spriteMeanTiles" }
        },
        {
            name: "spriteMean",
            type: "compute",
            program: "spriteMean",
            inputs: { tilesTex: "spriteMeanTiles" },
            uniforms: { shapeMode: "shapeMode", aperture: "aperture", viewMode: "viewMode" },
            outputs: { fragColor: "spriteMean" }
        },
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

        // Pass 3a: Deposit (additive) - scatter billboard quads to trail with GL_ONE/GL_ONE
        {
            name: "deposit",
            program: "deposit",
            drawMode: "billboards",
            count: 'input', // Derive from xyzTex dimensions for dynamic stateSize
            blend: true,
            conditions: { runIf: [{ uniform: "blendMode", equals: 0 }] },

            inputs: {
                // Read from shared global textures
                xyzTex: "global_xyz",
                rgbaTex: "global_rgba",
                spriteTex: "tex",
                spriteMeanTex: "spriteMean"
            },

            uniforms: {
                shapeMode: "shapeMode",
                depositOpacity: "depositOpacity",
                density: "density",
                pointSize: "pointSize",
                sizeVariation: "sizeVariation",
                rotationVar: "rotationVar",
                seed: "seed",
                viewMode: "viewMode",
                rotateX: "rotateX",
                rotateY: "rotateY",
                rotateZ: "rotateZ",
                viewScale: "viewScale",
                posX: "posX",
                posY: "posY",
                posZ: "posZ",
                fieldOfView: "fieldOfView",
                sizeDistance: "sizeDistance",
                brightnessDistance: "brightnessDistance",
                aperture: "aperture",
                focalDistance: "focalDistance"
            },

            outputs: {
                fragColor: "global_billboard_trail"
            }
        },

        // Pass 3b: Deposit (alpha) - same geometry, premultiplied alpha blend (ONE/ONE_MINUS_SRC_ALPHA)
        {
            name: "deposit_alpha",
            program: "deposit",
            drawMode: "billboards",
            count: 'input',
            blend: ['ONE', 'ONE_MINUS_SRC_ALPHA'],
            conditions: { runIf: [{ uniform: "blendMode", equals: 1 }] },

            inputs: {
                xyzTex: "global_xyz",
                rgbaTex: "global_rgba",
                spriteTex: "tex",
                spriteMeanTex: "spriteMean"
            },

            uniforms: {
                shapeMode: "shapeMode",
                depositOpacity: "depositOpacity",
                density: "density",
                pointSize: "pointSize",
                sizeVariation: "sizeVariation",
                rotationVar: "rotationVar",
                seed: "seed",
                viewMode: "viewMode",
                rotateX: "rotateX",
                rotateY: "rotateY",
                rotateZ: "rotateZ",
                viewScale: "viewScale",
                posX: "posX",
                posY: "posY",
                posZ: "posZ",
                fieldOfView: "fieldOfView",
                sizeDistance: "sizeDistance",
                brightnessDistance: "brightnessDistance",
                aperture: "aperture",
                focalDistance: "focalDistance"
            },

            outputs: {
                fragColor: "global_billboard_trail"
            }
        },

        // Pass 5: Blend - composite trail with input
        {
            name: "blend",
            program: "blend",

            inputs: {
                inputTex: "inputTex",
                trailTex: "global_billboard_trail"
            },

            uniforms: {
                inputIntensity: "inputIntensity",
                blendMode: "blendMode"
            },

            outputs: {
                fragColor: "outputTex"
            }
        }
    ]
})
