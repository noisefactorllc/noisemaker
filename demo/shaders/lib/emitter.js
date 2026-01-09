/**
 * Lightweight event emitter for ProgramState
 *
 * Provides on/off/emit pattern without DOM dependencies,
 * enabling use in Node.js for testing and SSR.
 *
 * @module lib/emitter
 */

export class Emitter {
    #listeners = new Map()

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {function} callback - Handler function
     */
    on(event, callback) {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, new Set())
        }
        this.#listeners.get(event).add(callback)
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {function} callback - Handler to remove
     */
    off(event, callback) {
        const handlers = this.#listeners.get(event)
        if (handlers) {
            handlers.delete(callback)
        }
    }

    /**
     * Subscribe to an event (one-time)
     * @param {string} event - Event name
     * @param {function} callback - Handler function
     */
    once(event, callback) {
        const wrapper = (data) => {
            this.off(event, wrapper)
            callback(data)
        }
        this.on(event, wrapper)
    }

    /**
     * Emit an event to all subscribers
     * @param {string} event - Event name
     * @param {*} data - Event payload
     */
    emit(event, data) {
        const handlers = this.#listeners.get(event)
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(data)
                } catch (err) {
                    console.error(`[Emitter] Error in ${event} handler:`, err)
                }
            }
        }
    }

    /**
     * Remove all listeners for an event (or all events)
     * @param {string} [event] - Event name (omit to clear all)
     */
    removeAllListeners(event) {
        if (event) {
            this.#listeners.delete(event)
        } else {
            this.#listeners.clear()
        }
    }
}
