/**
 * External Input Manager for MIDI and Audio
 * 
 * Handles Web MIDI API and Web Audio API integration for the shader demo.
 * Provides toggle controls and connects to the CanvasRenderer's state objects.
 */

import { MidiState, AudioState } from '../../../shaders/src/renderer/canvas.js'

/**
 * Manages MIDI input connection and state updates
 */
export class MidiInputManager {
    constructor(renderer) {
        this._renderer = renderer
        this._midiState = null
        this._midiAccess = null
        this._enabled = false
        this._onStatusChange = null
    }

    /**
     * Check if Web MIDI API is available
     * @returns {boolean}
     */
    static isSupported() {
        return !!navigator.requestMIDIAccess
    }

    /**
     * Enable MIDI input
     * @returns {Promise<boolean>} Whether MIDI was successfully enabled
     */
    async enable() {
        if (this._enabled) return true
        
        if (!MidiInputManager.isSupported()) {
            console.warn('Web MIDI API not supported')
            this._notifyStatus('MIDI not supported')
            return false
        }

        try {
            this._midiAccess = await navigator.requestMIDIAccess()
            this._midiState = this._renderer.setMidiState()
            
            // Connect all input devices
            for (const input of this._midiAccess.inputs.values()) {
                input.onmidimessage = (event) => this._handleMidiMessage(event)
            }

            // Listen for new devices
            this._midiAccess.onstatechange = (event) => {
                if (event.port.type === 'input') {
                    if (event.port.state === 'connected') {
                        event.port.onmidimessage = (e) => this._handleMidiMessage(e)
                        this._notifyStatus(`MIDI connected: ${event.port.name}`)
                    } else {
                        this._notifyStatus(`MIDI disconnected: ${event.port.name}`)
                    }
                }
            }

            this._enabled = true
            const inputCount = this._midiAccess.inputs.size
            this._notifyStatus(`MIDI enabled (${inputCount} device${inputCount !== 1 ? 's' : ''})`)
            return true
        } catch (err) {
            console.error('MIDI access denied:', err)
            this._notifyStatus('MIDI access denied')
            return false
        }
    }

    /**
     * Disable MIDI input
     */
    disable() {
        if (!this._enabled) return

        if (this._midiAccess) {
            for (const input of this._midiAccess.inputs.values()) {
                input.onmidimessage = null
            }
            this._midiAccess.onstatechange = null
        }

        this._enabled = false
        this._notifyStatus('MIDI disabled')
    }

    /**
     * Toggle MIDI input
     * @returns {Promise<boolean>} New enabled state
     */
    async toggle() {
        if (this._enabled) {
            this.disable()
            return false
        } else {
            return await this.enable()
        }
    }

    /**
     * Check if MIDI is currently enabled
     * @returns {boolean}
     */
    get enabled() {
        return this._enabled
    }

    /**
     * Set status change callback
     * @param {function(string)} callback
     */
    onStatusChange(callback) {
        this._onStatusChange = callback
    }

    _handleMidiMessage(event) {
        if (!this._midiState) return
        this._midiState.handleMessage(event.data)
    }

    _notifyStatus(message) {
        if (this._onStatusChange) {
            this._onStatusChange(message)
        }
    }
}

/**
 * Manages audio input connection and FFT analysis
 */
export class AudioInputManager {
    constructor(renderer) {
        this._renderer = renderer
        this._audioState = null
        this._audioContext = null
        this._analyser = null
        this._source = null
        this._stream = null
        this._fftData = null
        this._animationId = null
        this._enabled = false
        this._onStatusChange = null
        this._smoothing = 0.8
    }

    /**
     * Check if Web Audio API with microphone is available
     * @returns {boolean}
     */
    static isSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.AudioContext)
    }

    /**
     * Enable audio input (requests microphone permission)
     * @returns {Promise<boolean>} Whether audio was successfully enabled
     */
    async enable() {
        if (this._enabled) return true

        if (!AudioInputManager.isSupported()) {
            console.warn('Web Audio API or getUserMedia not supported')
            this._notifyStatus('Audio input not supported')
            return false
        }

        try {
            // Request microphone access
            this._stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            })

            // Create audio context and analyser
            this._audioContext = new AudioContext()
            this._analyser = this._audioContext.createAnalyser()
            this._analyser.fftSize = 256
            this._analyser.smoothingTimeConstant = this._smoothing

            // Connect microphone to analyser
            this._source = this._audioContext.createMediaStreamSource(this._stream)
            this._source.connect(this._analyser)

            // Create FFT buffer
            this._fftData = new Uint8Array(this._analyser.frequencyBinCount)

            // Set up audio state
            this._audioState = this._renderer.setAudioState()

            // Start update loop
            this._enabled = true
            this._updateLoop()

            this._notifyStatus('Audio input enabled')
            return true
        } catch (err) {
            console.error('Audio access denied:', err)
            this._notifyStatus('Audio access denied')
            return false
        }
    }

    /**
     * Disable audio input
     */
    disable() {
        if (!this._enabled) return

        // Stop update loop
        if (this._animationId) {
            cancelAnimationFrame(this._animationId)
            this._animationId = null
        }

        // Disconnect and stop stream
        if (this._source) {
            this._source.disconnect()
            this._source = null
        }
        if (this._stream) {
            this._stream.getTracks().forEach(track => track.stop())
            this._stream = null
        }
        if (this._audioContext) {
            this._audioContext.close()
            this._audioContext = null
        }

        this._analyser = null
        this._fftData = null
        this._enabled = false

        // Reset audio state values
        if (this._audioState) {
            this._audioState.low = 0
            this._audioState.mid = 0
            this._audioState.high = 0
            this._audioState.vol = 0
        }

        this._notifyStatus('Audio input disabled')
    }

    /**
     * Toggle audio input
     * @returns {Promise<boolean>} New enabled state
     */
    async toggle() {
        if (this._enabled) {
            this.disable()
            return false
        } else {
            return await this.enable()
        }
    }

    /**
     * Check if audio is currently enabled
     * @returns {boolean}
     */
    get enabled() {
        return this._enabled
    }

    /**
     * Set smoothing factor (0-1)
     * @param {number} value
     */
    set smoothing(value) {
        this._smoothing = Math.max(0, Math.min(1, value))
        if (this._analyser) {
            this._analyser.smoothingTimeConstant = this._smoothing
        }
    }

    /**
     * Set status change callback
     * @param {function(string)} callback
     */
    onStatusChange(callback) {
        this._onStatusChange = callback
    }

    _updateLoop() {
        if (!this._enabled) return

        // Get frequency data
        this._analyser.getByteFrequencyData(this._fftData)

        // Sample frequency bands (similar to noisedeck-pro)
        // Low: bins 0-3 (~0-200Hz at 44.1kHz)
        // Mid: bins 4-15 (~200-2000Hz)
        // High: bins 16-31 (~2000-4000Hz)
        const low = (this._fftData[0] + this._fftData[1] + this._fftData[2] + this._fftData[3]) / 4 / 255
        const mid = (this._fftData[4] + this._fftData[6] + this._fftData[8] + this._fftData[10]) / 4 / 255
        const high = (this._fftData[16] + this._fftData[20] + this._fftData[24] + this._fftData[28]) / 4 / 255
        const vol = (low + mid + high) / 3

        // Update audio state
        this._audioState.low = low
        this._audioState.mid = mid
        this._audioState.high = high
        this._audioState.vol = vol

        // Continue loop
        this._animationId = requestAnimationFrame(() => this._updateLoop())
    }

    _notifyStatus(message) {
        if (this._onStatusChange) {
            this._onStatusChange(message)
        }
    }
}

/**
 * Combined manager for both MIDI and Audio input
 */
export class ExternalInputManager {
    constructor(renderer) {
        this.midi = new MidiInputManager(renderer)
        this.audio = new AudioInputManager(renderer)
    }

    /**
     * Set status change callback for both managers
     * @param {function(string)} callback
     */
    onStatusChange(callback) {
        this.midi.onStatusChange(callback)
        this.audio.onStatusChange(callback)
    }
}
