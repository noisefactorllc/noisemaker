import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
    name: "Heightmap",
    namespace: "points",
    func: "heightmap",
    tags: ["agents"],
    description: "Arrange every particle in a landscape grid with separate height and diffuse surfaces",
    openCategories: ["source", "terrain"],
    textures: {},
    globals: {
        heightTex: {
            type: "surface",
            default: "inputTex",
            ui: { label: "height map", category: "source" }
        },
        diffuseTex: {
            type: "surface",
            default: "inputTex",
            ui: { label: "diffuse map", category: "source" }
        },
        gridScale: {
            type: "float", default: 80, min: 1, max: 400, step: 1,
            uniform: "gridScale",
            ui: { label: "grid width", control: "slider", category: "terrain" }
        },
        heightScale: {
            type: "float", default: 20, min: -100, max: 100, step: 0.1,
            uniform: "heightScale",
            ui: { label: "height", control: "slider", category: "terrain" }
        },
        heightOffset: {
            type: "float", default: 0, min: -100, max: 100, step: 0.1,
            uniform: "heightOffset",
            ui: { label: "height offset", control: "slider", category: "terrain" }
        }
    },
    defaultProgram: "search synth, points, render\n\nperlin(scale: 35, colorMode: rgb)\n  .write(o1)\n\nperlin(scale: 22, octaves: 4, colorMode: mono)\n  .write(o2)\n\nsolid()\n  .pointsEmit(stateSize: x256)\n  .heightmap(heightTex: read(o2), diffuseTex: read(o1), heightScale: 25)\n  .pointsBillboardRender(viewMode: perspective, rotateX: 0.55, posY: -12, posZ: 22, pointSize: 2, density: 100, intensity: 0, inputIntensity: 0, depositOpacity: 65, sizeDistance: 150, brightnessDistance: 180, aperture: 1.5, focalDistance: 65)\n  .write(o0)\n\nrender(o0)",
    passes: [
        {
            name: "agent",
            type: "compute",
            program: "agent",
            drawBuffers: 3,
            inputs: {
                xyzTex: "global_xyz",
                velTex: "global_vel",
                heightTex: "heightTex",
                diffuseTex: "diffuseTex"
            },
            uniforms: {
                gridScale: "gridScale",
                heightScale: "heightScale",
                heightOffset: "heightOffset"
            },
            outputs: {
                outXYZ: "global_xyz",
                outVel: "global_vel",
                outRGBA: "global_rgba"
            }
        },
        {
            name: "passthrough",
            program: "passthrough",
            inputs: { inputTex: "inputTex" },
            outputs: { fragColor: "outputTex" }
        }
    ]
})
