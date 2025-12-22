/**
 * Custom Effect Selector Web Component
 *
 * A stylable dropdown replacement that supports rich formatting for effect names
 * and descriptions, with grouped categories.
 *
 * Note: This component does NOT use Shadow DOM. Styles are injected into the
 * document head once, using the 'es-' prefix for scoping.
 */

/**
 * Convert camelCase to space-separated words
 * @param {string} str - camelCase string
 * @returns {string} Space-separated string
 */
function camelToSpaceCase(str) {
    return str
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .toLowerCase()
}

/** Flag to track if styles have been injected */
let stylesInjected = false

/**
 * Inject component styles into document head (once)
 */
function injectStyles() {
    if (stylesInjected) return
    stylesInjected = true

    const style = document.createElement('style')
    style.id = 'effect-select-styles'
    style.textContent = `
        effect-select {
            display: block;
            position: relative;
            font-family: Nunito, sans-serif;
            width: 280px;
        }

        effect-select.open {
            z-index: 10000;
        }

        effect-select .es-trigger {
            width: 100%;
            padding: 0.25rem 0.375rem;
            padding-right: 1.5rem;
            background: color-mix(in srgb, var(--accent3) 15%, transparent 85%);
            border: 1px solid color-mix(in srgb, var(--accent3) 25%, transparent 75%);
            border-radius: var(--ui-corner-radius-small, 0.375rem);
            color: var(--color6, #d9deeb);
            font-family: Nunito, sans-serif;
            font-size: 0.6875rem;
            font-weight: 560;
            outline: none;
            cursor: pointer;
            transition: all 0.15s ease;
            text-align: left;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            position: relative;
            box-sizing: border-box;
        }

        effect-select .es-trigger-name {
            font-size: 0.6875rem;
            font-weight: 600;
            color: var(--color6, #d9deeb);
        }

        effect-select .es-trigger-description {
            font-size: 0.625rem;
            font-weight: 400;
            color: var(--color5, #98a7c8);
        }

        effect-select .es-trigger::after {
            content: '▼';
            position: absolute;
            right: 0.375rem;
            top: 50%;
            transform: translateY(-50%);
            font-size: 0.5rem;
            opacity: 0.6;
            pointer-events: none;
        }

        effect-select .es-trigger:hover {
            background: color-mix(in srgb, var(--accent3) 22%, transparent 78%);
            border-color: color-mix(in srgb, var(--accent3) 35%, transparent 65%);
        }

        effect-select .es-trigger:focus,
        effect-select.open .es-trigger {
            border-color: var(--accent3, #a5b8ff);
            background: color-mix(in srgb, var(--accent3) 25%, transparent 75%);
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent3) 25%, transparent 75%);
        }

        effect-select .es-dropdown {
            display: none;
            position: absolute;
            top: calc(100% + 0.25rem);
            left: 0;
            min-width: 100%;
            width: max-content;
            max-width: 500px;
            max-height: 400px;
            overflow-y: auto;
            overflow-x: hidden;
            background: color-mix(in srgb, var(--color2, #101522) 95%, transparent 5%);
            border: 1px solid color-mix(in srgb, var(--accent3) 35%, transparent 65%);
            border-radius: var(--ui-corner-radius-small, 0.375rem);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            z-index: 10000;
            backdrop-filter: blur(12px);
        }

        effect-select.open .es-dropdown {
            display: block;
        }

        effect-select.flip-up .es-dropdown {
            top: auto;
            bottom: calc(100% + 0.25rem);
        }

        effect-select .es-group-header {
            padding: 0.5rem 0.5rem 0.25rem;
            font-size: 0.625rem;
            font-weight: 700;
            text-transform: lowercase;
            letter-spacing: 0.05em;
            color: var(--accent3, #a5b8ff);
            background: color-mix(in srgb, var(--accent1, #141a2d) 50%, transparent 50%);
            border-bottom: 1px solid color-mix(in srgb, var(--accent3) 15%, transparent 85%);
            position: sticky;
            top: 0;
            z-index: 1;
        }

        effect-select .es-option {
            padding: 0.375rem 0.5rem;
            cursor: pointer;
            transition: background 0.1s ease;
            border-bottom: 1px solid color-mix(in srgb, var(--accent3) 8%, transparent 92%);
        }

        effect-select .es-option:last-child {
            border-bottom: none;
        }

        effect-select .es-option:hover,
        effect-select .es-option.focused {
            background: color-mix(in srgb, var(--accent3) 20%, transparent 80%);
        }

        effect-select .es-option.selected {
            background: color-mix(in srgb, var(--accent3) 30%, transparent 70%);
        }

        effect-select .es-option-name {
            font-size: 0.6875rem;
            font-weight: 600;
            color: var(--color6, #d9deeb);
        }

        effect-select .es-option-description {
            font-size: 0.625rem;
            font-weight: 400;
            color: var(--color5, #98a7c8);
        }

        /* Scrollbar styling */
        effect-select .es-dropdown::-webkit-scrollbar {
            width: 0.375rem;
        }

        effect-select .es-dropdown::-webkit-scrollbar-track {
            background: transparent;
        }

        effect-select .es-dropdown::-webkit-scrollbar-thumb {
            background: color-mix(in srgb, var(--accent3) 30%, transparent 70%);
            border-radius: 0.25rem;
        }

        effect-select .es-dropdown::-webkit-scrollbar-thumb:hover {
            background: color-mix(in srgb, var(--accent3) 50%, transparent 50%);
        }

        effect-select .es-dropdown {
            scrollbar-width: thin;
            scrollbar-color: color-mix(in srgb, var(--accent3) 30%, transparent 70%) transparent;
        }
    `
    document.head.appendChild(style)
}

class EffectSelect extends HTMLElement {
    constructor() {
        super()
        this._effects = []
        this._value = ''
        this._isOpen = false
        this._selectedIndex = -1
        this._focusedIndex = -1
        this._flatOptions = [] // Flat list for keyboard navigation

        // Type-ahead search state (mimics native select behavior)
        this._searchString = ''
        this._searchTimeout = null
        this._lastSearchTime = 0
    }

    connectedCallback() {
        injectStyles()
        this._render()
        this._setupEventListeners()
    }

    static get observedAttributes() {
        return ['value']
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'value' && oldValue !== newValue) {
            this._value = newValue
            this._updateDisplay()
        }
    }

    get value() {
        return this._value
    }

    set value(val) {
        const oldValue = this._value
        this._value = val
        this.setAttribute('value', val)
        this._updateDisplay()

        // If value changed, dispatch change event (for test harness compatibility)
        // This ensures setting .value programmatically triggers change handlers
        if (oldValue !== val && this._flatOptions.some(opt => opt.value === val)) {
            this.dispatchEvent(new Event('change', { bubbles: true }))
        }
    }

    /**
     * Get the selected index (native select compatibility)
     */
    get selectedIndex() {
        return this._flatOptions.findIndex(opt => opt.value === this._value)
    }

    set selectedIndex(idx) {
        if (idx >= 0 && idx < this._flatOptions.length) {
            this.value = this._flatOptions[idx].value
        }
    }

    /**
     * Get options array (native select compatibility for test harness)
     * Returns an array-like object with .length and iterable options
     */
    get options() {
        return this._flatOptions.map(opt => ({
            value: opt.value,
            text: opt.description
                ? `${camelToSpaceCase(opt.name)}: ${opt.description}`
                : camelToSpaceCase(opt.name),
            selected: opt.value === this._value
        }))
    }

    /**
     * Populate the selector with effects
     * @param {Array} effects - Array of { namespace, name, description? }
     */
    setEffects(effects) {
        this._effects = effects
        this._buildFlatOptions()
        this._renderDropdown()
        this._updateDisplay()
    }

    _buildFlatOptions() {
        this._flatOptions = []
        const grouped = {}

        this._effects.forEach(effect => {
            if (!grouped[effect.namespace]) {
                grouped[effect.namespace] = []
            }
            grouped[effect.namespace].push(effect)
        })

        const sortedNamespaces = Object.keys(grouped).sort((a, b) => {
            const aIsClassic = a.startsWith('classic')
            const bIsClassic = b.startsWith('classic')
            if (aIsClassic && !bIsClassic) return 1
            if (!aIsClassic && bIsClassic) return -1
            return a.localeCompare(b)
        })

        sortedNamespaces.forEach(namespace => {
            grouped[namespace].sort((a, b) => a.name.localeCompare(b.name)).forEach(effect => {
                this._flatOptions.push({
                    value: `${namespace}/${effect.name}`,
                    namespace,
                    name: effect.name,
                    description: effect.description || ''
                })
            })
        })
    }

    _render() {
        this.innerHTML = `
            <button class="es-trigger" tabindex="0" aria-haspopup="listbox">
                <span class="es-trigger-text">Select effect...</span>
            </button>
            <div class="es-dropdown" role="listbox"></div>
        `
    }

    _renderDropdown() {
        const dropdown = this.querySelector('.es-dropdown')
        if (!dropdown) return

        dropdown.innerHTML = ''

        const grouped = {}
        this._effects.forEach(effect => {
            if (!grouped[effect.namespace]) {
                grouped[effect.namespace] = []
            }
            grouped[effect.namespace].push(effect)
        })

        const sortedNamespaces = Object.keys(grouped).sort((a, b) => {
            const aIsClassic = a.startsWith('classic')
            const bIsClassic = b.startsWith('classic')
            if (aIsClassic && !bIsClassic) return 1
            if (!aIsClassic && bIsClassic) return -1
            return a.localeCompare(b)
        })

        sortedNamespaces.forEach(namespace => {
            const header = document.createElement('div')
            header.className = 'es-group-header'
            header.textContent = camelToSpaceCase(namespace)
            dropdown.appendChild(header)

            grouped[namespace].sort((a, b) => a.name.localeCompare(b.name)).forEach(effect => {
                const option = document.createElement('div')
                option.className = 'es-option'
                option.dataset.value = `${namespace}/${effect.name}`
                option.setAttribute('role', 'option')

                const nameSpan = document.createElement('span')
                nameSpan.className = 'es-option-name'
                nameSpan.textContent = camelToSpaceCase(effect.name)
                option.appendChild(nameSpan)

                if (effect.description) {
                    const descSpan = document.createElement('span')
                    descSpan.className = 'es-option-description'
                    descSpan.textContent = `: ${effect.description}`
                    option.appendChild(descSpan)
                }

                dropdown.appendChild(option)
            })
        })

        this._updateSelectedOption()
    }

    _updateDisplay() {
        const trigger = this.querySelector('.es-trigger-text')
        if (!trigger) return

        const selectedEffect = this._flatOptions.find(opt => opt.value === this._value)
        if (selectedEffect) {
            const displayName = camelToSpaceCase(selectedEffect.name)
            if (selectedEffect.description) {
                trigger.innerHTML = `<span class="es-trigger-name">${displayName}</span><span class="es-trigger-description">: ${selectedEffect.description}</span>`
            } else {
                trigger.innerHTML = `<span class="es-trigger-name">${displayName}</span>`
            }
        } else {
            trigger.textContent = 'Select effect...'
        }

        this._updateSelectedOption()
    }

    _updateSelectedOption() {
        const dropdown = this.querySelector('.es-dropdown')
        if (!dropdown) return

        dropdown.querySelectorAll('.es-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.value === this._value)
        })
    }

    _setupEventListeners() {
        const trigger = this.querySelector('.es-trigger')
        const dropdown = this.querySelector('.es-dropdown')

        // Toggle dropdown on trigger click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation()
            this._toggleDropdown()
        })

        // Handle option clicks
        dropdown.addEventListener('click', (e) => {
            const option = e.target.closest('.es-option')
            if (option) {
                this._selectOption(option.dataset.value)
            }
        })

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!this.contains(e.target)) {
                this._closeDropdown()
            }
        })

        // Keyboard navigation
        trigger.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'Enter':
                    e.preventDefault()
                    if (this._isOpen) {
                        // Select focused item (if any) and close dropdown
                        if (this._focusedIndex >= 0 && this._focusedIndex < this._flatOptions.length) {
                            this._selectOption(this._flatOptions[this._focusedIndex].value)
                        } else {
                            this._closeDropdown()
                        }
                    } else {
                        this._openDropdown()
                    }
                    break
                case ' ':
                    e.preventDefault()
                    this._openDropdown()
                    break
                case 'ArrowDown':
                    e.preventDefault()
                    if (!this._isOpen) {
                        // When closed, arrow down moves to next option (like native select)
                        this._moveSelection(1)
                    } else {
                        // When open, move focus down
                        this._moveFocus(1)
                    }
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    if (!this._isOpen) {
                        // When closed, arrow up moves to previous option (like native select)
                        this._moveSelection(-1)
                    } else {
                        // When open, move focus up
                        this._moveFocus(-1)
                    }
                    break
                case 'Escape':
                    this._closeDropdown()
                    break
                case 'Home':
                    e.preventDefault()
                    if (this._flatOptions.length > 0) {
                        if (this._isOpen) {
                            this._focusedIndex = 0
                            this._updateFocusedOption()
                        } else {
                            this._selectOption(this._flatOptions[0].value)
                        }
                    }
                    break
                case 'End':
                    e.preventDefault()
                    if (this._flatOptions.length > 0) {
                        if (this._isOpen) {
                            this._focusedIndex = this._flatOptions.length - 1
                            this._updateFocusedOption()
                        } else {
                            this._selectOption(this._flatOptions[this._flatOptions.length - 1].value)
                        }
                    }
                    break
                default:
                    // Handle type-ahead for printable characters
                    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        e.preventDefault()
                        this._handleTypeAhead(e.key)
                    }
            }
        })

        dropdown.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault()
                    this._moveFocus(1)
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    this._moveFocus(-1)
                    break
                case 'Enter':
                    e.preventDefault()
                    if (this._focusedIndex >= 0) {
                        this._selectOption(this._flatOptions[this._focusedIndex].value)
                    }
                    break
                case 'Escape':
                    this._closeDropdown()
                    break
                case 'Home':
                    e.preventDefault()
                    if (this._flatOptions.length > 0) {
                        this._focusedIndex = 0
                        this._updateFocusedOption()
                    }
                    break
                case 'End':
                    e.preventDefault()
                    if (this._flatOptions.length > 0) {
                        this._focusedIndex = this._flatOptions.length - 1
                        this._updateFocusedOption()
                    }
                    break
                default:
                    // Handle type-ahead for printable characters when dropdown is open
                    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        e.preventDefault()
                        this._handleTypeAhead(e.key)
                    }
            }
        })
    }

    _toggleDropdown() {
        if (this._isOpen) {
            this._closeDropdown()
        } else {
            this._openDropdown()
        }
    }

    _openDropdown() {
        this._isOpen = true
        this.classList.add('open')

        // Determine if we need to flip upward
        const dropdown = this.querySelector('.es-dropdown')
        const trigger = this.querySelector('.es-trigger')
        const triggerRect = trigger.getBoundingClientRect()
        const dropdownHeight = Math.min(400, this._flatOptions.length * 28 + 100) // Estimate
        const spaceBelow = window.innerHeight - triggerRect.bottom
        const spaceAbove = triggerRect.top

        // Flip up if not enough space below but enough above
        if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
            this.classList.add('flip-up')
        } else {
            this.classList.remove('flip-up')
        }

        // Set initial focus to selected item
        const selectedIdx = this._flatOptions.findIndex(opt => opt.value === this._value)
        this._focusedIndex = selectedIdx >= 0 ? selectedIdx : 0
        this._updateFocusedOption()

        // Scroll selected into view
        const selectedOption = dropdown.querySelector('.es-option.selected')
        if (selectedOption) {
            selectedOption.scrollIntoView({ block: 'center' })
        }
    }

    _closeDropdown() {
        this._isOpen = false
        this.classList.remove('open')
        this.classList.remove('flip-up')
        this._focusedIndex = -1
        this._clearFocus()
    }

    _selectOption(value) {
        this._value = value
        this.setAttribute('value', value)
        this._updateDisplay()
        this._closeDropdown()

        // Dispatch change event
        this.dispatchEvent(new CustomEvent('change', {
            bubbles: true,
            detail: { value }
        }))
    }

    _moveFocus(direction) {
        if (this._flatOptions.length === 0) return

        this._focusedIndex += direction
        if (this._focusedIndex < 0) this._focusedIndex = this._flatOptions.length - 1
        if (this._focusedIndex >= this._flatOptions.length) this._focusedIndex = 0

        this._updateFocusedOption()
    }

    /**
     * Move selection when dropdown is closed (arrow keys change value directly like native select)
     * @param {number} direction - 1 for next, -1 for previous
     */
    _moveSelection(direction) {
        if (this._flatOptions.length === 0) return

        const currentIdx = this._flatOptions.findIndex(opt => opt.value === this._value)
        let newIdx = currentIdx + direction

        // Clamp to bounds (don't wrap when closed, like native select)
        if (newIdx < 0) newIdx = 0
        if (newIdx >= this._flatOptions.length) newIdx = this._flatOptions.length - 1

        if (newIdx !== currentIdx) {
            this._selectOption(this._flatOptions[newIdx].value)
        }
    }

    _updateFocusedOption() {
        this._clearFocus()

        if (this._focusedIndex >= 0 && this._focusedIndex < this._flatOptions.length) {
            const value = this._flatOptions[this._focusedIndex].value
            const dropdown = this.querySelector('.es-dropdown')
            const option = dropdown.querySelector(`.es-option[data-value="${CSS.escape(value)}"]`)
            if (option) {
                option.classList.add('focused')
                option.scrollIntoView({ block: 'nearest' })
            }
        }
    }

    _clearFocus() {
        const dropdown = this.querySelector('.es-dropdown')
        dropdown.querySelectorAll('.es-option.focused').forEach(opt => {
            opt.classList.remove('focused')
        })
    }

    /**
     * Handle type-ahead search like a native select element.
     * - Typing a single character jumps to the first matching option
     * - Typing quickly builds a multi-character search string
     * - Repeating the same character cycles through matching options
     * @param {string} char - The character typed
     */
    _handleTypeAhead(char) {
        const now = Date.now()
        const timeSinceLastKey = now - this._lastSearchTime
        this._lastSearchTime = now

        // Clear the search timeout
        if (this._searchTimeout) {
            clearTimeout(this._searchTimeout)
        }

        // If more than 500ms since last keypress, start a new search
        // (native select typically uses ~500-1000ms)
        if (timeSinceLastKey > 500) {
            this._searchString = ''
        }

        const previousSearch = this._searchString
        this._searchString += char.toLowerCase()

        // Reset search string after delay (like native select)
        this._searchTimeout = setTimeout(() => {
            this._searchString = ''
        }, 1000)

        // Get display names for matching
        const optionsWithNames = this._flatOptions.map((opt, idx) => ({
            ...opt,
            idx,
            displayName: camelToSpaceCase(opt.name).toLowerCase()
        }))

        // Find matching options
        let matchingOptions = optionsWithNames.filter(opt =>
            opt.displayName.startsWith(this._searchString)
        )

        // If no match with full string but we just added a repeated character,
        // cycle through options starting with that character
        if (matchingOptions.length === 0 && this._searchString.length > 1) {
            // Try matching with just the new character
            const singleCharMatches = optionsWithNames.filter(opt =>
                opt.displayName.startsWith(char.toLowerCase())
            )

            if (singleCharMatches.length > 0) {
                // Reset to single character search
                this._searchString = char.toLowerCase()
                matchingOptions = singleCharMatches
            }
        }

        // If single character is repeated (e.g., "aaa"), cycle through matches
        const isRepeatedChar = this._searchString.length > 1 &&
            this._searchString.split('').every(c => c === this._searchString[0])

        if (isRepeatedChar && previousSearch.length > 0) {
            const singleCharMatches = optionsWithNames.filter(opt =>
                opt.displayName.startsWith(this._searchString[0])
            )

            if (singleCharMatches.length > 1) {
                // Find current position in the cycle
                const currentIdx = this._isOpen ? this._focusedIndex : this.selectedIndex
                const currentMatchIdx = singleCharMatches.findIndex(opt => opt.idx === currentIdx)

                // Move to next match (with wrap)
                const nextMatchIdx = (currentMatchIdx + 1) % singleCharMatches.length
                const targetIdx = singleCharMatches[nextMatchIdx].idx

                if (this._isOpen) {
                    this._focusedIndex = targetIdx
                    this._updateFocusedOption()
                } else {
                    this._selectOption(this._flatOptions[targetIdx].value)
                }
                return
            }
        }

        // Jump to first match
        if (matchingOptions.length > 0) {
            const targetIdx = matchingOptions[0].idx

            if (this._isOpen) {
                this._focusedIndex = targetIdx
                this._updateFocusedOption()
            } else {
                // When closed, select the option directly (like native select)
                this._selectOption(this._flatOptions[targetIdx].value)
            }
        }
    }
}

customElements.define('effect-select', EffectSelect)

export { EffectSelect }
