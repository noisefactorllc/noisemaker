/**
 * Custom Effect Selector Web Component
 * 
 * A stylable dropdown replacement that supports rich formatting for effect names
 * and descriptions, with grouped categories.
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
        .toLowerCase();
}

class EffectSelect extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._effects = [];
        this._value = '';
        this._isOpen = false;
        this._selectedIndex = -1;
        this._focusedIndex = -1;
        this._flatOptions = []; // Flat list for keyboard navigation
    }

    connectedCallback() {
        this._render();
        this._setupEventListeners();
    }

    static get observedAttributes() {
        return ['value'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'value' && oldValue !== newValue) {
            this._value = newValue;
            this._updateDisplay();
        }
    }

    get value() {
        return this._value;
    }

    set value(val) {
        const oldValue = this._value;
        this._value = val;
        this.setAttribute('value', val);
        this._updateDisplay();
        
        // If value changed, dispatch change event (for test harness compatibility)
        // This ensures setting .value programmatically triggers change handlers
        if (oldValue !== val && this._flatOptions.some(opt => opt.value === val)) {
            this.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    /**
     * Get the selected index (native select compatibility)
     */
    get selectedIndex() {
        return this._flatOptions.findIndex(opt => opt.value === this._value);
    }

    set selectedIndex(idx) {
        if (idx >= 0 && idx < this._flatOptions.length) {
            this.value = this._flatOptions[idx].value;
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
        }));
    }

    /**
     * Populate the selector with effects
     * @param {Array} effects - Array of { namespace, name, description? }
     */
    setEffects(effects) {
        this._effects = effects;
        this._buildFlatOptions();
        this._renderDropdown();
        this._updateDisplay();
    }

    _buildFlatOptions() {
        this._flatOptions = [];
        const grouped = {};
        
        this._effects.forEach(effect => {
            if (!grouped[effect.namespace]) {
                grouped[effect.namespace] = [];
            }
            grouped[effect.namespace].push(effect);
        });

        const sortedNamespaces = Object.keys(grouped).sort((a, b) => {
            const aIsClassic = a.startsWith('classic');
            const bIsClassic = b.startsWith('classic');
            if (aIsClassic && !bIsClassic) return 1;
            if (!aIsClassic && bIsClassic) return -1;
            return a.localeCompare(b);
        });

        sortedNamespaces.forEach(namespace => {
            grouped[namespace].sort((a, b) => a.name.localeCompare(b.name)).forEach(effect => {
                this._flatOptions.push({
                    value: `${namespace}/${effect.name}`,
                    namespace,
                    name: effect.name,
                    description: effect.description || ''
                });
            });
        });
    }

    _render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    position: relative;
                    font-family: Nunito, sans-serif;
                    width: 100%;
                }

                :host(.open) {
                    z-index: 10000;
                }

                .select-trigger {
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

                .select-trigger::after {
                    content: '▼';
                    position: absolute;
                    right: 0.375rem;
                    top: 50%;
                    transform: translateY(-50%);
                    font-size: 0.5rem;
                    opacity: 0.6;
                    pointer-events: none;
                }

                .select-trigger:hover {
                    background: color-mix(in srgb, var(--accent3) 22%, transparent 78%);
                    border-color: color-mix(in srgb, var(--accent3) 35%, transparent 65%);
                }

                .select-trigger:focus,
                :host(.open) .select-trigger {
                    border-color: var(--accent3, #a5b8ff);
                    background: color-mix(in srgb, var(--accent3) 25%, transparent 75%);
                    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent3) 25%, transparent 75%);
                }

                .dropdown {
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

                :host(.open) .dropdown {
                    display: block;
                }

                :host(.flip-up) .dropdown {
                    top: auto;
                    bottom: calc(100% + 0.25rem);
                }

                .group-header {
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

                .option {
                    padding: 0.375rem 0.5rem;
                    cursor: pointer;
                    transition: background 0.1s ease;
                    border-bottom: 1px solid color-mix(in srgb, var(--accent3) 8%, transparent 92%);
                }

                .option:last-child {
                    border-bottom: none;
                }

                .option:hover,
                .option.focused {
                    background: color-mix(in srgb, var(--accent3) 20%, transparent 80%);
                }

                .option.selected {
                    background: color-mix(in srgb, var(--accent3) 30%, transparent 70%);
                }

                .option-name {
                    font-size: 0.6875rem;
                    font-weight: 600;
                    color: var(--color6, #d9deeb);
                }

                .option-description {
                    font-size: 0.625rem;
                    font-weight: 400;
                    color: color-mix(in srgb, var(--color5, #98a7c8) 70%, transparent 30%);
                    margin-left: 0.25rem;
                }

                /* Scrollbar styling */
                .dropdown::-webkit-scrollbar {
                    width: 0.375rem;
                }

                .dropdown::-webkit-scrollbar-track {
                    background: transparent;
                }

                .dropdown::-webkit-scrollbar-thumb {
                    background: color-mix(in srgb, var(--accent3) 30%, transparent 70%);
                    border-radius: 0.25rem;
                }

                .dropdown::-webkit-scrollbar-thumb:hover {
                    background: color-mix(in srgb, var(--accent3) 50%, transparent 50%);
                }

                .dropdown {
                    scrollbar-width: thin;
                    scrollbar-color: color-mix(in srgb, var(--accent3) 30%, transparent 70%) transparent;
                }
            </style>
            <button class="select-trigger" tabindex="0" aria-haspopup="listbox">
                <span class="trigger-text">Select effect...</span>
            </button>
            <div class="dropdown" role="listbox"></div>
        `;
    }

    _renderDropdown() {
        const dropdown = this.shadowRoot.querySelector('.dropdown');
        if (!dropdown) return;

        dropdown.innerHTML = '';

        const grouped = {};
        this._effects.forEach(effect => {
            if (!grouped[effect.namespace]) {
                grouped[effect.namespace] = [];
            }
            grouped[effect.namespace].push(effect);
        });

        const sortedNamespaces = Object.keys(grouped).sort((a, b) => {
            const aIsClassic = a.startsWith('classic');
            const bIsClassic = b.startsWith('classic');
            if (aIsClassic && !bIsClassic) return 1;
            if (!aIsClassic && bIsClassic) return -1;
            return a.localeCompare(b);
        });

        sortedNamespaces.forEach(namespace => {
            const header = document.createElement('div');
            header.className = 'group-header';
            header.textContent = camelToSpaceCase(namespace);
            dropdown.appendChild(header);

            grouped[namespace].sort((a, b) => a.name.localeCompare(b.name)).forEach(effect => {
                const option = document.createElement('div');
                option.className = 'option';
                option.dataset.value = `${namespace}/${effect.name}`;
                option.setAttribute('role', 'option');

                const nameSpan = document.createElement('span');
                nameSpan.className = 'option-name';
                nameSpan.textContent = camelToSpaceCase(effect.name);
                option.appendChild(nameSpan);

                if (effect.description) {
                    const descSpan = document.createElement('span');
                    descSpan.className = 'option-description';
                    descSpan.textContent = `: ${effect.description}`;
                    option.appendChild(descSpan);
                }

                dropdown.appendChild(option);
            });
        });

        this._updateSelectedOption();
    }

    _updateDisplay() {
        const trigger = this.shadowRoot.querySelector('.trigger-text');
        if (!trigger) return;

        const selectedEffect = this._flatOptions.find(opt => opt.value === this._value);
        if (selectedEffect) {
            const displayName = camelToSpaceCase(selectedEffect.name);
            trigger.textContent = selectedEffect.description 
                ? `${displayName}: ${selectedEffect.description}`
                : displayName;
        } else {
            trigger.textContent = 'Select effect...';
        }

        this._updateSelectedOption();
    }

    _updateSelectedOption() {
        const dropdown = this.shadowRoot.querySelector('.dropdown');
        if (!dropdown) return;

        dropdown.querySelectorAll('.option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.value === this._value);
        });
    }

    _setupEventListeners() {
        const trigger = this.shadowRoot.querySelector('.select-trigger');
        const dropdown = this.shadowRoot.querySelector('.dropdown');

        // Toggle dropdown on trigger click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleDropdown();
        });

        // Handle option clicks
        dropdown.addEventListener('click', (e) => {
            const option = e.target.closest('.option');
            if (option) {
                this._selectOption(option.dataset.value);
            }
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!this.contains(e.target)) {
                this._closeDropdown();
            }
        });

        // Keyboard navigation
        trigger.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'Enter':
                case ' ':
                case 'ArrowDown':
                    e.preventDefault();
                    this._openDropdown();
                    break;
                case 'Escape':
                    this._closeDropdown();
                    break;
            }
        });

        dropdown.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this._moveFocus(1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this._moveFocus(-1);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (this._focusedIndex >= 0) {
                        this._selectOption(this._flatOptions[this._focusedIndex].value);
                    }
                    break;
                case 'Escape':
                    this._closeDropdown();
                    break;
            }
        });
    }

    _toggleDropdown() {
        if (this._isOpen) {
            this._closeDropdown();
        } else {
            this._openDropdown();
        }
    }

    _openDropdown() {
        this._isOpen = true;
        this.classList.add('open');
        
        // Determine if we need to flip upward
        const dropdown = this.shadowRoot.querySelector('.dropdown');
        const trigger = this.shadowRoot.querySelector('.select-trigger');
        const triggerRect = trigger.getBoundingClientRect();
        const dropdownHeight = Math.min(400, this._flatOptions.length * 28 + 100); // Estimate
        const spaceBelow = window.innerHeight - triggerRect.bottom;
        const spaceAbove = triggerRect.top;
        
        // Flip up if not enough space below but enough above
        if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
            this.classList.add('flip-up');
        } else {
            this.classList.remove('flip-up');
        }
        
        // Set initial focus to selected item
        const selectedIdx = this._flatOptions.findIndex(opt => opt.value === this._value);
        this._focusedIndex = selectedIdx >= 0 ? selectedIdx : 0;
        this._updateFocusedOption();
        
        // Scroll selected into view
        const selectedOption = dropdown.querySelector('.option.selected');
        if (selectedOption) {
            selectedOption.scrollIntoView({ block: 'center' });
        }
    }

    _closeDropdown() {
        this._isOpen = false;
        this.classList.remove('open');
        this.classList.remove('flip-up');
        this._focusedIndex = -1;
        this._clearFocus();
    }

    _selectOption(value) {
        this._value = value;
        this.setAttribute('value', value);
        this._updateDisplay();
        this._closeDropdown();
        
        // Dispatch change event
        this.dispatchEvent(new CustomEvent('change', {
            bubbles: true,
            detail: { value }
        }));
    }

    _moveFocus(direction) {
        if (this._flatOptions.length === 0) return;
        
        this._focusedIndex += direction;
        if (this._focusedIndex < 0) this._focusedIndex = this._flatOptions.length - 1;
        if (this._focusedIndex >= this._flatOptions.length) this._focusedIndex = 0;
        
        this._updateFocusedOption();
    }

    _updateFocusedOption() {
        this._clearFocus();
        
        if (this._focusedIndex >= 0 && this._focusedIndex < this._flatOptions.length) {
            const value = this._flatOptions[this._focusedIndex].value;
            const dropdown = this.shadowRoot.querySelector('.dropdown');
            const option = dropdown.querySelector(`.option[data-value="${CSS.escape(value)}"]`);
            if (option) {
                option.classList.add('focused');
                option.scrollIntoView({ block: 'nearest' });
            }
        }
    }

    _clearFocus() {
        const dropdown = this.shadowRoot.querySelector('.dropdown');
        dropdown.querySelectorAll('.option.focused').forEach(opt => {
            opt.classList.remove('focused');
        });
    }
}

customElements.define('effect-select', EffectSelect);

export { EffectSelect };
