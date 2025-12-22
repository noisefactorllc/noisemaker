import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
    name: "Points Render",
    namespace: "render",
    func: "pointsRender",
    tags: ["agents"],

    description: "Accumulate agent trails and blend with input for particle systems",

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
            default: 100.0,
            min: 1.0,
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
            default: 95.0,
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
            default: 0.0,
            min: 0.0,
            max: 100.0,
            uniform: "inputIntensity",
            ui: {
                label: "input intensity",
                control: "slider",
                category: "visual"
            }
        },

        // Reset state button
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

    passes: [
        // Pass 1: Diffuse - decay existing trail (matches flow)
        {
            name: "diffuse",
            program: "diffuse",

            inputs: {
                trailTex: "global_points_trail"
            },

            uniforms: {
                intensity: "intensity",
                resetState: "resetState"
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
            count: 4194304, // Max for 2048x2048 state texture; shader culls excess
            blend: true,

            inputs: {
                // Read from shared global textures (within-frame updates visible)
                xyzTex: "global_xyz",
                rgbaTex: "global_rgba"
            },

            uniforms: {
                density: "density"
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
                inputIntensity: "inputIntensity"
            },

            outputs: {
                fragColor: "outputTex"
            }
        }
    ]
})
