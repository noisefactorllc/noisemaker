/**
 * Toggle Switch Web Component
 *
 * A slider-style toggle for boolean values, replacing the default HTML checkbox.
 * Styled to match the Noisedeck design language.
 *
 * Note: This component does NOT use Shadow DOM. Styles are injected into the
 * document head once, using the 'ts-' prefix for scoping.
 *
 * @module ui/toggleSwitch
 */

/** Flag to track if styles have been injected */
let stylesInjected = false

/**
 * Inject component styles into document head (once)
 */
function injectStyles() {
    if (stylesInjected) return
    stylesInjected = true

    const style = document.createElement('style')
    style.id = 'toggle-switch-styles'
    style.textContent = `
        toggle-switch {
            display: inline-block;
            vertical-align: middle;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
        }

        toggle-switch[disabled] {
            cursor: not-allowed;
            opacity: 0.5;
            pointer-events: none;
        }

        toggle-switch .ts-track {
            position: relative;
            width: 2rem;
            height: 1rem;
            background: color-mix(in srgb, var(--color4, #26314f) 60%, var(--color3, #1b2538) 40%);
            border-radius: var(--ui-corner-radius-pill, 999px);
            transition: background 0.15s ease;
            box-sizing: border-box;
        }

        toggle-switch:hover .ts-track {
            background: color-mix(in srgb, var(--color4, #26314f) 75%, var(--color3, #1b2538) 25%);
        }

        toggle-switch:focus-visible {
            outline: none;
        }

        toggle-switch:focus-visible .ts-track {
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent3, #a5b8ff) 25%, transparent 75%);
        }

        toggle-switch .ts-track.ts-checked {
            background: color-mix(in srgb, var(--accent3, #a5b8ff) 35%, var(--color3, #1b2538) 65%);
        }

        toggle-switch:hover .ts-track.ts-checked {
            background: color-mix(in srgb, var(--accent3, #a5b8ff) 45%, var(--color3, #1b2538) 55%);
        }

        toggle-switch .ts-thumb {
            position: absolute;
            top: 50%;
            left: 0.125rem;
            transform: translateY(-50%);
            width: 0.75rem;
            height: 0.75rem;
            background: var(--color5, #98a7c8);
            border-radius: 50%;
            transition: left 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        }

        toggle-switch .ts-track.ts-checked .ts-thumb {
            left: calc(100% - 0.875rem);
            background: var(--accent3, #a5b8ff);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        toggle-switch:active .ts-thumb {
            width: 0.875rem;
        }

        toggle-switch:active .ts-track.ts-checked .ts-thumb {
            left: calc(100% - 1rem);
        }
    `
    document.head.appendChild(style)
}

/**
 * ToggleSwitch - Web component for boolean value toggles
 * @extends HTMLElement
 *
 * @example
 * <toggle-switch checked></toggle-switch>
 *
 * @fires change - Fires when the toggle state changes
 */
class ToggleSwitch extends HTMLElement {
    constructor() {
        super()

        /** @type {boolean} */
        this._checked = false

        /** @type {boolean} */
        this._disabled = false

        /** @type {HTMLElement|null} */
        this._track = null
    }

    static get observedAttributes() {
        return ['checked', 'disabled']
    }

    connectedCallback() {
        injectStyles()
        this._render()
        this._setupEventListeners()
    }

    disconnectedCallback() {
        // Clean up event listeners if needed
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (name === 'checked') {
            this._checked = newVal !== null
            this._updateVisualState()
        } else if (name === 'disabled') {
            this._disabled = newVal !== null
            this._updateVisualState()
        }
    }

    /** @returns {boolean} Current checked state */
    get checked() {
        return this._checked
    }

    /** @param {boolean} val - New checked state */
    set checked(val) {
        const newVal = Boolean(val)
        if (this._checked !== newVal) {
            this._checked = newVal
            if (newVal) {
                this.setAttribute('checked', '')
            } else {
                this.removeAttribute('checked')
            }
            this._updateVisualState()
        }
    }

    /** @returns {boolean} Current disabled state */
    get disabled() {
        return this._disabled
    }

    /** @param {boolean} val - New disabled state */
    set disabled(val) {
        const newVal = Boolean(val)
        if (this._disabled !== newVal) {
            this._disabled = newVal
            if (newVal) {
                this.setAttribute('disabled', '')
            } else {
                this.removeAttribute('disabled')
            }
            this._updateVisualState()
        }
    }

    /**
     * Render the component's DOM
     * @private
     */
    _render() {
        this.innerHTML = `
            <div class="ts-track" role="switch" aria-checked="false" tabindex="0">
                <div class="ts-thumb"></div>
            </div>
        `
        this._track = this.querySelector('.ts-track')

        // Sync initial state from attributes
        this._checked = this.hasAttribute('checked')
        this._disabled = this.hasAttribute('disabled')
        this._updateVisualState()
    }

    /**
     * Set up event listeners
     * @private
     */
    _setupEventListeners() {
        if (!this._track) return

        this._track.addEventListener('click', (e) => {
            if (this._disabled) return
            e.preventDefault()
            e.stopPropagation()
            this._toggle()
        })

        // Also listen on host element for clicks that miss the track
        this.addEventListener('click', (e) => {
            if (this._disabled) return
            // Prevent double-toggle if event came from track
            if (e.target === this._track || this._track?.contains(e.target)) return
            e.preventDefault()
            this._toggle()
        })

        this._track.addEventListener('keydown', (e) => {
            if (this._disabled) return
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault()
                this._toggle()
            }
        })
    }

    /**
     * Toggle the checked state
     * @private
     */
    _toggle() {
        this.checked = !this._checked
        this.dispatchEvent(new Event('change', { bubbles: true }))
    }

    /**
     * Update the visual state to match the checked property
     * @private
     */
    _updateVisualState() {
        if (!this._track) return

        if (this._checked) {
            this._track.classList.add('ts-checked')
            this._track.setAttribute('aria-checked', 'true')
        } else {
            this._track.classList.remove('ts-checked')
            this._track.setAttribute('aria-checked', 'false')
        }
    }
}

// Guard against re-definition (allows local overrides to take precedence)
if (!customElements.get('toggle-switch')) {
    customElements.define('toggle-switch', ToggleSwitch)
}

export { ToggleSwitch }
