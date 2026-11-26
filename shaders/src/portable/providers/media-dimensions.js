/**
 * The noisemaker/media-dimensions capability, version 1.
 *
 * Keeps the dimensions of the media a host uploads into an effect's external
 * texture, and binds them each frame to a vec2 size parameter, as synth/media
 * does with imageSize. The state lives on the registered effect's own `state`,
 * as width and height of 1 until the host reports the media's size.
 *
 *   onInit()                  sets the state to 1 by 1, once per effect per pipeline
 *   onUpdate()                returns { <size uniform>: [width || 1, height || 1] }
 *   setMediaDimensions(w, h)  the host reports the media's size, before or after onInit
 *
 * Each hook runs with the registered effect as its receiver, so every node of
 * the effect, in every pipeline, shares the one state, as before. The pipeline
 * binds a returned uniform only where the pass does not already resolve it.
 */

/** The descriptor: what a declaration of this capability may give, as data. */
export const MEDIA_DIMENSIONS_DESCRIPTOR = Object.freeze({
    id: 'noisemaker/media-dimensions',
    version: 1,
    description: 'The size of the media a host uploads into the effect, bound each frame to a vec2 size parameter',
    bindings: {
        parameters: { size: { types: ['vec2'], required: true } },
    },
    dependencies: { parameters: [], resources: [] },
    methods: ['setMediaDimensions'],
})

/**
 * The provider: create() runs once per registered effect, and gives the
 * effect its onInit, onUpdate and setMediaDimensions.
 * @param {{bindings: object, uniforms: {size: string}}} input - uniforms names the
 *   shader uniform of each bound parameter role
 */
export function createMediaDimensions({ uniforms }) {
    const size = uniforms.size
    return {
        onInit() {
            this.state.imageWidth = 1
            this.state.imageHeight = 1
        },
        onUpdate() {
            return {
                [size]: [this.state.imageWidth || 1, this.state.imageHeight || 1]
            }
        },
        methods: {
            setMediaDimensions(width, height) {
                this.state.imageWidth = width
                this.state.imageHeight = height
            }
        }
    }
}

export const mediaDimensionsProvider = Object.freeze({
    id: MEDIA_DIMENSIONS_DESCRIPTOR.id,
    version: MEDIA_DIMENSIONS_DESCRIPTOR.version,
    descriptor: MEDIA_DIMENSIONS_DESCRIPTOR,
    create: createMediaDimensions,
})
