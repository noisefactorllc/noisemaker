import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
    name: "Points Emit",
    func: "pointsEmit",
    namespace: "render",
    starter: true,
    hasTex: true,
    tags: ["agents"],

    description: "Initialize and maintain agent state for particle systems",

    // Global parameters exposed to the user
    globals: {
        // Optional input texture for coloring agents
        tex: {
            type: "surface",
            default: "none",
            colorModeUniform: "colorMode",
            ui: {
                label: "color source"
            }
        },

        // Color mode uniform (set automatically based on tex)
        colorMode: {
            type: "int",
            default: 0,
            uniform: "colorMode",
            ui: { control: false }
        },

        // State texture size (controls agent count)
        // 256=65k, 512=262k, 1024=1M, 2048=4M
        stateSize: {
            type: "int",
            default: 256,
            min: 64,
            max: 2048,
            uniform: "stateSize",
            ui: {
                label: "state size",
                control: "dropdown"
            },
            choices: {
                "x64": 64,
                "x128": 128,
                "x256": 256,
                "x512": 512,
                "x1024": 1024,
                "x2048": 2048
            }
        },

        // Initial distribution pattern
        layout: {
            type: "int",
            default: 0,
            uniform: "layoutMode",
            ui: {
                label: "layout",
                control: "dropdown"
            },
            choices: {
                random: 0,
                grid: 1,
                center: 2,
                ring: 3,
                clusters: 4,
                spiral: 5
            }
        },

        // Random seed
        seed: {
            type: "float",
            default: 0.0,
            min: 0.0,
            max: 100.0,
            uniform: "seed",
            ui: {
                label: "seed",
                control: "slider"
            }
        },

        // Attrition: per-frame respawn chance (0=none, 10=10% per frame)
        attrition: {
            type: "float",
            default: 0.0,
            min: 0.0,
            max: 10.0,
            uniform: "attrition",
            ui: {
                label: "attrition",
                control: "slider"
            }
        },

        // Reset state button - forces all agents to respawn
        resetState: {
            type: "boolean",
            default: false,
            uniform: "resetState",
            ui: {
                control: "button",
                buttonLabel: "reset",
                label: "state"
            }
        }
    },

    // Internal textures for agent state storage
    // Using underscore convention for SHARED global textures (not node-prefixed)
    textures: {
        global_xyz: {
            width: { param: 'stateSize', default: 256 },
            height: { param: 'stateSize', default: 256 },
            format: "rgba32f"
        },
        global_vel: {
            width: { param: 'stateSize', default: 256 },
            height: { param: 'stateSize', default: 256 },
            format: "rgba32f"
        },
        global_rgba: {
            width: { param: 'stateSize', default: 256 },
            height: { param: 'stateSize', default: 256 },
            format: "rgba8"
        }
    },

    // Agent state textures exposed as pipeline outputs for downstream effects
    outputXyz: "global_xyz",
    outputVel: "global_vel",
    outputRgba: "global_rgba",

    passes: [
        {
            name: "init",
            program: "init",
            drawBuffers: 3,

            inputs: {
                // Read previous state for respawn logic (from shared storage)
                xyzTex: "global_xyz",
                velTex: "global_vel",
                rgbaTex: "global_rgba",

                // Optional color source (tex global)
                tex: "tex"
            },

            uniforms: {
                attrition: "attrition",
                resetState: "resetState"
            },

            outputs: {
                // Write directly to shared global textures
                outXYZ: "global_xyz",
                outVel: "global_vel",
                outRGBA: "global_rgba"
            }
        },

        // Passthrough: copy the surface argument to the 2D pipeline output
        // This ensures downstream effects receive the background texture via inputTex
        {
            name: "passthrough",
            program: "passthrough",

            inputs: {
                tex: "tex"
            },

            outputs: {
                fragColor: "outputTex"
            }
        }
    ]
})
