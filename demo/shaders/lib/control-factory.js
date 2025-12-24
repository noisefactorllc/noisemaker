/**
 * Control Factory for Noisemaker Shader Demo
 *
 * This module provides a pluggable interface for creating UI controls.
 * Downstream projects can provide their own ControlFactory implementation
 * to substitute custom web components for the default HTML elements.
 *
 * ## Architecture
 *
 * Each control method returns a ControlHandle object with:
 * - `element`: The DOM element to append to the container
 * - `getValue()`: Returns the current control value
 * - `setValue(v)`: Updates the control to display value v
 *
 * The UIController stores these handles on control groups (`controlGroup._controlHandle`)
 * so that `syncControlsFromDsl()` can update controls without knowing their implementation.
 *
 * ## Usage
 *
 * ```javascript
 * import { ControlFactory, UIController } from './lib/demo-ui.js'
 *
 * // Custom factory using web components
 * class CustomControlFactory extends ControlFactory {
 *     createSelect(options) {
 *         const el = document.createElement('my-custom-dropdown')
 *         el.items = options.choices.map(c => ({ value: c.value, label: c.label }))
 *         el.value = options.value
 *         return {
 *             element: el,
 *             getValue: () => el.value,
 *             setValue: (v) => { el.value = v }
 *         }
 *     }
 *
 *     createSlider(options) {
 *         const el = document.createElement('my-custom-slider')
 *         el.min = options.min
 *         el.max = options.max
 *         el.value = options.value
 *         return {
 *             element: el,
 *             getValue: () => el.value,
 *             setValue: (v) => { el.value = v }
 *         }
 *     }
 * }
 *
 * const ui = new UIController(renderer, {
 *     controlFactory: new CustomControlFactory(),
 *     // ... other options
 * })
 * ```
 *
 * ## Current Integration Point
 *
 * The UIController currently stores control handles on control group elements
 * (`container._controlHandle`) after creating each control. The `syncControlsFromDsl`
 * method checks for these handles first:
 *
 * ```javascript
 * if (controlGroup._controlHandle?.setValue) {
 *     controlGroup._controlHandle.setValue(value)
 * }
 * ```
 *
 * This allows downstream projects to:
 * 1. Extend this class and override `create*` methods
 * 2. OR subclass UIController and override `_create*Control` methods
 * 3. OR replace control elements post-creation and attach `_controlHandle`
 */

/**
 * @typedef {object} ControlHandle
 * @property {HTMLElement} element - The DOM element for the control
 * @property {function(): *} getValue - Get the current control value
 * @property {function(*): void} setValue - Set the control value
 * @property {function(function): void} [onChange] - Optional: set change handler (if not using events)
 * @property {function(Array<{value: *, label: string}>): void} [setChoices] - Optional: update dropdown choices dynamically (select controls only)
 */

/**
 * Default control factory using native HTML elements.
 * Override methods to substitute custom web components.
 */
export class ControlFactory {
    /**
     * Create a select/dropdown control
     * @param {object} options
     * @param {Array<{value: *, label: string, data?: object}>} options.choices - Available options
     * @param {*} options.value - Initial selected value
     * @param {string} [options.className] - CSS class name
     * @returns {ControlHandle}
     */
    createSelect(options) {
        const select = document.createElement('select')
        if (options.className) select.className = options.className

        let selectedIndex = 0
        options.choices.forEach((choice, i) => {
            const option = document.createElement('option')
            option.value = i
            option.textContent = choice.label
            // Store custom data attributes
            if (choice.data) {
                for (const [key, val] of Object.entries(choice.data)) {
                    option.dataset[key] = typeof val === 'object' ? JSON.stringify(val) : val
                }
            }
            // Match by value
            if (this._valuesEqual(choice.value, options.value)) {
                selectedIndex = i
            }
            select.appendChild(option)
        })
        select.selectedIndex = selectedIndex

        // Keep reference to choices for getValue/setValue
        let currentChoices = options.choices

        return {
            element: select,
            getValue: () => {
                // Return the original choice value, not the index
                return currentChoices[select.selectedIndex]?.value
            },
            setValue: (v) => {
                for (let i = 0; i < currentChoices.length; i++) {
                    if (this._valuesEqual(currentChoices[i].value, v)) {
                        select.selectedIndex = i
                        return
                    }
                }
            },
            getSelectedData: () => {
                const opt = select.options[select.selectedIndex]
                return opt?.dataset || {}
            },
            /**
             * Update the available choices dynamically
             * @param {Array<{value: *, label: string, data?: object}>} newChoices
             */
            setChoices: (newChoices) => {
                // Clear existing options
                select.innerHTML = ''
                currentChoices = newChoices

                // Add new options
                newChoices.forEach((choice, i) => {
                    const option = document.createElement('option')
                    option.value = i
                    option.textContent = choice.label
                    if (choice.data) {
                        for (const [key, val] of Object.entries(choice.data)) {
                            option.dataset[key] = typeof val === 'object' ? JSON.stringify(val) : val
                        }
                    }
                    select.appendChild(option)
                })

                select.selectedIndex = 0
            }
        }
    }

    /**
     * Create a slider/range control
     * @param {object} options
     * @param {number} options.value - Initial value
     * @param {number} options.min - Minimum value
     * @param {number} options.max - Maximum value
     * @param {number} [options.step] - Step increment
     * @param {string} [options.className] - CSS class name
     * @returns {ControlHandle}
     */
    createSlider(options) {
        const slider = document.createElement('input')
        slider.type = 'range'
        if (options.className) slider.className = options.className
        slider.min = options.min
        slider.max = options.max
        if (options.step !== undefined) slider.step = options.step
        slider.value = options.value

        return {
            element: slider,
            getValue: () => parseFloat(slider.value),
            setValue: (v) => { slider.value = v }
        }
    }

    /**
     * Create a toggle/switch control for boolean values
     * @param {object} options
     * @param {boolean} options.value - Initial checked state
     * @param {string} [options.className] - CSS class name
     * @returns {ControlHandle}
     */
    createToggle(options) {
        const toggle = document.createElement('toggle-switch')
        toggle.checked = !!options.value

        return {
            element: toggle,
            getValue: () => toggle.checked,
            setValue: (v) => { toggle.checked = !!v }
        }
    }

    /**
     * Create a color picker control
     * @param {object} options
     * @param {Array<number>} options.value - RGB or RGBA array (0-1 range)
     * @param {boolean} [options.hasAlpha] - Whether to include alpha channel
     * @param {string} [options.className] - CSS class name
     * @returns {ControlHandle}
     */
    createColorPicker(options) {
        const colorInput = document.createElement('input')
        colorInput.type = 'color'
        if (options.className) colorInput.className = options.className

        // Convert array to hex
        const toHex = (arr) => {
            if (!Array.isArray(arr)) return '#000000'
            const r = Math.round((arr[0] || 0) * 255).toString(16).padStart(2, '0')
            const g = Math.round((arr[1] || 0) * 255).toString(16).padStart(2, '0')
            const b = Math.round((arr[2] || 0) * 255).toString(16).padStart(2, '0')
            return `#${r}${g}${b}`
        }

        colorInput.value = toHex(options.value)

        // Store alpha separately since HTML color input doesn't support it
        let currentAlpha = Array.isArray(options.value) && options.value.length >= 4 ? options.value[3] : 1

        return {
            element: colorInput,
            getValue: () => {
                const hex = colorInput.value
                const r = parseInt(hex.slice(1, 3), 16) / 255
                const g = parseInt(hex.slice(3, 5), 16) / 255
                const b = parseInt(hex.slice(5, 7), 16) / 255
                return options.hasAlpha ? [r, g, b, currentAlpha] : [r, g, b]
            },
            setValue: (v) => {
                colorInput.value = toHex(v)
                if (options.hasAlpha && Array.isArray(v) && v.length >= 4) {
                    currentAlpha = v[3]
                }
            }
        }
    }

    /**
     * Create a button control (momentary trigger)
     * @param {object} options
     * @param {string} options.label - Button text
     * @param {string} [options.className] - CSS class name
     * @param {string} [options.tooltip] - Tooltip text
     * @returns {ControlHandle}
     */
    createButton(options) {
        const button = document.createElement('button')
        button.textContent = options.label
        if (options.className) button.className = options.className
        if (options.tooltip) {
            button.classList.add('tooltip')
            button.dataset.title = options.tooltip
        }

        // Buttons don't have get/set values in the traditional sense
        // The change event IS the action
        return {
            element: button,
            getValue: () => false,
            setValue: () => {}
        }
    }

    /**
     * Create a text display element (for read-only values like "automatic")
     * @param {object} options
     * @param {string} options.text - Display text
     * @param {string} [options.className] - CSS class name
     * @returns {ControlHandle}
     */
    createTextDisplay(options) {
        const span = document.createElement('span')
        span.textContent = options.text
        if (options.className) span.className = options.className

        return {
            element: span,
            getValue: () => options.text,
            setValue: (v) => { span.textContent = v }
        }
    }

    /**
     * Create a value display element (for showing slider values, etc.)
     * @param {object} options
     * @param {string|number} options.value - Display value
     * @param {string} [options.className] - CSS class name
     * @returns {ControlHandle}
     */
    createValueDisplay(options) {
        const span = document.createElement('span')
        if (options.className) span.className = options.className
        span.textContent = options.value

        return {
            element: span,
            getValue: () => span.textContent,
            setValue: (v) => { span.textContent = v }
        }
    }

    /**
     * Helper to compare values for equality (handles objects, arrays, null)
     * @private
     */
    _valuesEqual(a, b) {
        if (a === b) return true
        if (a === null || b === null) return a === b
        if (typeof a !== typeof b) return false
        if (typeof a === 'object') {
            return JSON.stringify(a) === JSON.stringify(b)
        }
        return false
    }
}

/**
 * Default factory instance - used when no custom factory is provided
 */
export const defaultControlFactory = new ControlFactory()
