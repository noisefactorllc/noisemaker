/**
 * Handfish Control Factory
 *
 * Extends the default ControlFactory to use handfish web components
 * (slider-value, select-dropdown, toggle-switch) instead of native elements.
 */

import { ControlFactory } from './control-factory.js'

export class HandfishControlFactory extends ControlFactory {
    createSlider(options) {
        const slider = document.createElement('slider-value')
        slider.setAttribute('min', options.min)
        slider.setAttribute('max', options.max)
        if (options.step !== undefined) slider.setAttribute('step', options.step)
        slider.setAttribute('value', options.value)
        // Detect int type from step value
        if (options.step !== undefined && Number.isInteger(options.step) && options.step >= 1) {
            slider.setAttribute('type', 'int')
        }

        return {
            element: slider,
            getValue: () => parseFloat(slider.value),
            setValue: (v) => { slider.value = v }
        }
    }

    createSelect(options) {
        const dropdown = document.createElement('select-dropdown')
        dropdown.style.width = '100%'

        // Build items using SelectDropdown's {value, text} format
        let selectedIndex = 0
        const items = options.choices.map((choice, i) => {
            if (this._valuesEqual(choice.value, options.value)) {
                selectedIndex = i
            }
            return { value: String(i), text: choice.label }
        })

        // Set options after connected
        let currentChoices = options.choices
        requestAnimationFrame(() => {
            if (dropdown.setOptions) {
                dropdown.setOptions(items)
                dropdown.value = String(selectedIndex)
            }
        })

        return {
            element: dropdown,
            getValue: () => {
                const idx = parseInt(dropdown.value, 10)
                return currentChoices[idx]?.value
            },
            setValue: (v) => {
                for (let i = 0; i < currentChoices.length; i++) {
                    if (this._valuesEqual(currentChoices[i].value, v)) {
                        dropdown.value = String(i)
                        return
                    }
                }
            },
            getSelectedData: () => {
                const idx = parseInt(dropdown.value, 10)
                const choice = currentChoices[idx]
                return choice?.data || {}
            },
            setChoices: (newChoices) => {
                currentChoices = newChoices
                const newItems = newChoices.map((choice, i) => ({
                    value: String(i),
                    text: choice.label
                }))
                if (dropdown.setOptions) {
                    dropdown.setOptions(newItems)
                    dropdown.value = '0'
                }
            }
        }
    }

    createToggle(options) {
        const toggle = document.createElement('toggle-switch')
        if (options.value) toggle.setAttribute('checked', '')

        return {
            element: toggle,
            getValue: () => toggle.checked,
            setValue: (v) => { toggle.checked = !!v }
        }
    }

    createColorPicker(options) {
        const picker = document.createElement('color-picker')

        // Convert 0-1 RGB array to hex
        const toHex = (arr) => {
            if (!Array.isArray(arr)) return '#000000'
            const r = Math.round((arr[0] || 0) * 255).toString(16).padStart(2, '0')
            const g = Math.round((arr[1] || 0) * 255).toString(16).padStart(2, '0')
            const b = Math.round((arr[2] || 0) * 255).toString(16).padStart(2, '0')
            return `#${r}${g}${b}`
        }

        picker.setAttribute('value', toHex(options.value))

        let currentAlpha = Array.isArray(options.value) && options.value.length >= 4 ? options.value[3] : 1

        return {
            element: picker,
            getValue: () => {
                const hex = picker.value || '#000000'
                const r = parseInt(hex.slice(1, 3), 16) / 255
                const g = parseInt(hex.slice(3, 5), 16) / 255
                const b = parseInt(hex.slice(5, 7), 16) / 255
                return options.hasAlpha ? [r, g, b, currentAlpha] : [r, g, b]
            },
            setValue: (v) => {
                picker.value = toHex(v)
                if (options.hasAlpha && Array.isArray(v) && v.length >= 4) {
                    currentAlpha = v[3]
                }
            }
        }
    }

    createVector2dPicker(options) {
        const picker = document.createElement('vector2d-picker')
        const val = Array.isArray(options.value) ? options.value : [0, 0]

        if (options.min !== undefined) picker.setAttribute('min', options.min)
        if (options.max !== undefined) picker.setAttribute('max', options.max)
        if (options.step !== undefined) picker.setAttribute('step', options.step)
        picker.setAttribute('value', JSON.stringify(val))

        return {
            element: picker,
            getValue: () => {
                const v = picker.value
                return [v.x, v.y]
            },
            setValue: (v) => {
                if (Array.isArray(v)) {
                    picker.value = { x: v[0] ?? 0, y: v[1] ?? 0 }
                }
            }
        }
    }

    createVector3dPicker(options) {
        const picker = document.createElement('vector3d-picker')
        const val = Array.isArray(options.value) ? options.value : [0, 0, 0]

        if (options.min !== undefined) picker.setAttribute('min', options.min)
        if (options.max !== undefined) picker.setAttribute('max', options.max)
        if (options.step !== undefined) picker.setAttribute('step', options.step)
        picker.setAttribute('value', JSON.stringify(val))

        return {
            element: picker,
            getValue: () => {
                const v = picker.value
                return [v.x, v.y, v.z]
            },
            setValue: (v) => {
                if (Array.isArray(v)) {
                    picker.value = { x: v[0] ?? 0, y: v[1] ?? 0, z: v[2] ?? 0 }
                }
            }
        }
    }

    createButton(options) {
        const button = document.createElement('button')
        button.textContent = options.label
        button.className = 'hf-action-btn'
        if (options.tooltip) {
            button.classList.add('tooltip')
            button.dataset.title = options.tooltip
        }

        return {
            element: button,
            getValue: () => false,
            setValue: () => {}
        }
    }
}
