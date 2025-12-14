/**
 * Toggle Switch Web Component
 * 
 * A slider-style toggle for boolean values, replacing the default HTML checkbox.
 * Styled to match the Noisedeck design language.
 * 
 * @module ui/toggleSwitch
 */

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
        super();
        this.attachShadow({ mode: 'open' });
        
        /** @type {boolean} */
        this._checked = false;
        
        /** @type {boolean} */
        this._disabled = false;
        
        this._render();
    }

    static get observedAttributes() {
        return ['checked', 'disabled'];
    }

    connectedCallback() {
        this._setupEventListeners();
    }

    disconnectedCallback() {
        // Clean up handled automatically by shadow DOM
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (name === 'checked') {
            this._checked = newVal !== null;
            this._updateVisualState();
        } else if (name === 'disabled') {
            this._disabled = newVal !== null;
            this._updateVisualState();
        }
    }

    /** @returns {boolean} Current checked state */
    get checked() {
        return this._checked;
    }

    /** @param {boolean} val - New checked state */
    set checked(val) {
        const newVal = Boolean(val);
        if (this._checked !== newVal) {
            this._checked = newVal;
            if (newVal) {
                this.setAttribute('checked', '');
            } else {
                this.removeAttribute('checked');
            }
            this._updateVisualState();
        }
    }

    /** @returns {boolean} Current disabled state */
    get disabled() {
        return this._disabled;
    }

    /** @param {boolean} val - New disabled state */
    set disabled(val) {
        const newVal = Boolean(val);
        if (this._disabled !== newVal) {
            this._disabled = newVal;
            if (newVal) {
                this.setAttribute('disabled', '');
            } else {
                this.removeAttribute('disabled');
            }
            this._updateVisualState();
        }
    }

    /**
     * Render the component's shadow DOM
     * @private
     */
    _render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: inline-block;
                    vertical-align: middle;
                    cursor: pointer;
                    -webkit-tap-highlight-color: transparent;
                }

                :host([disabled]) {
                    cursor: not-allowed;
                    opacity: 0.5;
                    pointer-events: none;
                }

                .toggle-track {
                    position: relative;
                    width: 2rem;
                    height: 1rem;
                    background: color-mix(in srgb, var(--color4, #26314f) 60%, var(--color3, #1b2538) 40%);
                    border-radius: var(--ui-corner-radius-pill, 999px);
                    transition: background 0.15s ease;
                    box-sizing: border-box;
                }

                :host(:hover) .toggle-track {
                    background: color-mix(in srgb, var(--color4, #26314f) 75%, var(--color3, #1b2538) 25%);
                }

                :host(:focus-visible) {
                    outline: none;
                }

                :host(:focus-visible) .toggle-track {
                    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent3, #a5b8ff) 25%, transparent 75%);
                }

                .toggle-track.checked {
                    background: color-mix(in srgb, var(--accent3, #a5b8ff) 35%, var(--color3, #1b2538) 65%);
                }

                :host(:hover) .toggle-track.checked {
                    background: color-mix(in srgb, var(--accent3, #a5b8ff) 45%, var(--color3, #1b2538) 55%);
                }

                .toggle-thumb {
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

                .toggle-track.checked .toggle-thumb {
                    left: calc(100% - 0.875rem);
                    background: var(--accent3, #a5b8ff);
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
                }

                :host(:active) .toggle-thumb {
                    width: 0.875rem;
                }

                :host(:active) .toggle-track.checked .toggle-thumb {
                    left: calc(100% - 1rem);
                }
            </style>
            <div class="toggle-track" role="switch" aria-checked="false" tabindex="0">
                <div class="toggle-thumb"></div>
            </div>
        `;
    }

    /**
     * Set up event listeners
     * @private
     */
    _setupEventListeners() {
        const track = this.shadowRoot.querySelector('.toggle-track');
        
        track.addEventListener('click', (e) => {
            if (this._disabled) return;
            e.preventDefault();
            e.stopPropagation();
            this._toggle();
        });

        // Also listen on host element for clicks that miss the track
        this.addEventListener('click', (e) => {
            if (this._disabled) return;
            e.preventDefault();
            this._toggle();
        });

        track.addEventListener('keydown', (e) => {
            if (this._disabled) return;
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                this._toggle();
            }
        });
    }

    /**
     * Toggle the checked state
     * @private
     */
    _toggle() {
        this.checked = !this._checked;
        this.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /**
     * Update the visual state to match the checked property
     * @private
     */
    _updateVisualState() {
        const track = this.shadowRoot.querySelector('.toggle-track');
        if (!track) return;
        
        if (this._checked) {
            track.classList.add('checked');
            track.setAttribute('aria-checked', 'true');
        } else {
            track.classList.remove('checked');
            track.setAttribute('aria-checked', 'false');
        }
    }
}

customElements.define('toggle-switch', ToggleSwitch);

export { ToggleSwitch };
