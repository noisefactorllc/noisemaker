import { Effect } from '../../../src/runtime/effect.js'

/**
 * Text - Text overlay filter
 *
 * Filter effect that overlays text rendered on the CPU side onto an input image.
 * Supports multiple instances per graph, each with independent text content,
 * font, size, position, rotation, and background settings.
 */
export default class Text extends Effect {
    id = "text"
    name = "Text"
    namespace = "filter"
    func = "text"
    description = "Overlay text onto the image"
    tags = ["text"]

    // This tells the UI to create a hidden canvas and bind it to 'textTex'
    externalTexture = "textTex"

    globals = {
        text: {
            type: "string",
            default: "Hello World",
            ui: {

                label: "text",multiline: true,
                category: "general"
            }
        },
        font: {
            type: "string",
            default: "Nunito",
            choices: {
                nunito: "Nunito",
                sansSerif: "sans-serif",
                serif: "serif",
                monospace: "monospace",
                cursive: "cursive",
                fantasy: "fantasy"
            },
            ui: {

                label: "font",control: "dropdown",
                category: "general"
            }
        },
        size: {
            type: "float",
            default: 0.1,
            min: 0.01,
            max: 1.0,
            step: 0.01,
            ui: {

                label: "size",control: "slider",
                category: "transform"
            }
        },
        posX: {
            type: "float",
            default: 0.5,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            ui: {

                label: "pos x",control: "slider",
                category: "transform"
            }
        },
        posY: {
            type: "float",
            default: 0.5,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            ui: {

                label: "pos y",control: "slider",
                category: "transform"
            }
        },
        rotation: {
            type: "float",
            default: 0.0,
            min: -180.0,
            max: 180.0,
            step: 1.0,
            ui: {

                label: "rotation",control: "slider",
                category: "transform"
            }
        },
        color: {
            type: "color",
            default: "#ffffff",
            ui: {

                label: "color",control: "color",
                category: "general"
            }
        },
        bgColor: {
            type: "color",
            default: "#000000",
            ui: {

                label: "background color",control: "color",
                category: "background"
            }
        },
        bgAlpha: {
            type: "float",
            default: 0.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            ui: {

                label: "background opacity",control: "slider",
                category: "background"
            }
        },
        justify: {
            type: "string",
            default: "center",
            choices: {
                "left": "left",
                "center": "center",
                "right": "right"
            },
            ui: {

                label: "justify",control: "dropdown",
                category: "general"
            }
        }
    }

    paramAliases = { bgOpacity: 'bgAlpha' }


    passes = [
        {
            name: "overlay",
            program: "text",
            inputs: {
                inputTex: "inputTex",
                textTex: "textTex"
            },
            outputs: {
                fragColor: "outputTex"
            }
        }
    ]
}
