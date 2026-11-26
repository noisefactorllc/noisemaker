/**
 * The engine's own capability providers, registered in the engine's registry
 * when this module loads, so that a package can declare them as it declares
 * any host's provider.
 */

import { defaultCapabilityRegistry } from '../capabilities.js'
import { mediaDimensionsProvider } from './media-dimensions.js'
import { wormOverlayProvider } from './worm-overlay.js'

export const ENGINE_PROVIDERS = Object.freeze([wormOverlayProvider, mediaDimensionsProvider])

for (const provider of ENGINE_PROVIDERS) {
    if (!defaultCapabilityRegistry.get(provider.id, provider.version)) defaultCapabilityRegistry.register(provider)
}

export { mediaDimensionsProvider, wormOverlayProvider }
