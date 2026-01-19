/**
 * External Input State Classes for MIDI and Audio
 *
 * These classes manage state for real-time MIDI and audio input.
 * The host application updates these states, and the Pipeline
 * reads them during uniform resolution for midi() and audio() functions.
 */

/**
 * MIDI channel state for a single channel.
 * Tracks note number, velocity, gate state, and timing for trigger modes.
 */
export class MidiChannelState {
    constructor() {
        /** @type {number} Last note number (0-127) */
        this.key = 0
        /** @type {number} Last velocity (0-127) */
        this.velocity = 0
        /** @type {number} Gate state: 1 = note on, 0 = note off */
        this.gate = 0
        /** @type {number} Timestamp of last note-on (Date.now()) */
        this.time = 0
    }

    /**
     * Handle a note-on event.
     * @param {number} key - MIDI note number (0-127)
     * @param {number} velocity - Note velocity (0-127)
     */
    noteOn(key, velocity) {
        this.key = key
        this.velocity = velocity
        this.gate = 1
        this.time = Date.now()
    }

    /**
     * Handle a note-off event.
     * Preserves the last key and velocity for reference.
     */
    noteOff() {
        this.gate = 0
    }

    /**
     * Reset the channel state.
     */
    reset() {
        this.key = 0
        this.velocity = 0
        this.gate = 0
        this.time = 0
    }
}

/**
 * Complete MIDI state for all 16 MIDI channels.
 * Provides per-channel state tracking for the Pipeline.
 */
export class MidiState {
    constructor() {
        /** @type {Object.<number, MidiChannelState>} Per-channel state (1-16) */
        this.channels = {}
        for (let i = 1; i <= 16; i++) {
            this.channels[i] = new MidiChannelState()
        }
    }

    /**
     * Get the state for a specific MIDI channel.
     * @param {number} n - Channel number (1-16)
     * @returns {MidiChannelState} The channel state
     */
    getChannel(n) {
        const channel = this.channels[n]
        if (channel) return channel
        // Fallback to channel 1 for invalid channel numbers
        return this.channels[1]
    }

    /**
     * Process a raw MIDI message.
     * Parses the status byte and routes to appropriate channel.
     * @param {Uint8Array} data - Raw MIDI message data [status, key, velocity]
     */
    handleMessage(data) {
        if (!data || data.length < 3) return

        const [status, key, velocity] = data
        const channel = (status & 0x0F) + 1  // Extract channel (1-16)
        const messageType = status & 0xF0     // Extract message type

        const channelState = this.getChannel(channel)

        // Note On (0x90) with velocity > 0
        if (messageType === 0x90 && velocity > 0) {
            channelState.noteOn(key, velocity)
        }
        // Note Off (0x80) or Note On with velocity 0
        else if (messageType === 0x80 || (messageType === 0x90 && velocity === 0)) {
            channelState.noteOff()
        }
    }

    /**
     * Reset all channel states.
     */
    reset() {
        for (let i = 1; i <= 16; i++) {
            this.channels[i].reset()
        }
    }
}

/**
 * Audio analysis state.
 * Provides frequency band data extracted from an AnalyserNode.
 */
export class AudioState {
    constructor() {
        /** @type {number} Low frequency band level (0-1) */
        this.low = 0
        /** @type {number} Mid frequency band level (0-1) */
        this.mid = 0
        /** @type {number} High frequency band level (0-1) */
        this.high = 0
        /** @type {number} Overall volume level (0-1) */
        this.vol = 0
        /** @type {Float32Array} Raw FFT bins (16 bins, normalized 0-1) */
        this.fft = new Float32Array(16)

        // Internal buffer for smoothing
        this._smoothingBuffers = {
            low: [],
            mid: [],
            high: []
        }
        this._maxBufferLength = 5
    }

    /**
     * Update audio state from a Web Audio AnalyserNode.
     * Extracts frequency bands and calculates overall volume.
     *
     * @param {AnalyserNode} analyser - Web Audio AnalyserNode
     * @param {number} [smoothing=5] - Number of frames to average (1-10)
     */
    updateFromAnalyser(analyser, smoothing = 5) {
        if (!analyser) return

        this._maxBufferLength = Math.max(1, Math.min(10, smoothing))

        const buf = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(buf)

        // Extract frequency bands from FFT bins
        // Bin indices based on noisedeck-pro: 0=low, 2=mid, 4=high
        const rawLow = buf[0] / 255
        const rawMid = buf[2] / 255
        const rawHigh = buf[4] / 255

        // Apply smoothing via rolling average
        this.low = this._smooth('low', rawLow)
        this.mid = this._smooth('mid', rawMid)
        this.high = this._smooth('high', rawHigh)

        // Calculate FFT bins and overall volume
        const step = Math.max(1, Math.floor(buf.length / 16))
        let sum = 0
        for (let i = 0; i < 16; i++) {
            const v = buf[i * step] / 255
            this.fft[i] = v
            sum += v
        }
        this.vol = sum / 16
    }

    /**
     * Directly set frequency band values.
     * Useful for testing or non-Web Audio sources.
     *
     * @param {number} low - Low band level (0-1)
     * @param {number} mid - Mid band level (0-1)
     * @param {number} high - High band level (0-1)
     */
    setBands(low, mid, high) {
        this.low = Math.max(0, Math.min(1, low))
        this.mid = Math.max(0, Math.min(1, mid))
        this.high = Math.max(0, Math.min(1, high))
        this.vol = (this.low + this.mid + this.high) / 3
    }

    /**
     * Apply smoothing to a value using a rolling buffer.
     * @private
     */
    _smooth(band, value) {
        const buffer = this._smoothingBuffers[band]

        if (buffer.length < this._maxBufferLength) {
            buffer.push(value)
        } else {
            // Rotate buffer
            buffer.shift()
            buffer.push(value)
        }

        // Return average
        return buffer.reduce((a, b) => a + b, 0) / buffer.length
    }

    /**
     * Reset audio state to zero.
     */
    reset() {
        this.low = 0
        this.mid = 0
        this.high = 0
        this.vol = 0
        this.fft.fill(0)
        this._smoothingBuffers.low = []
        this._smoothingBuffers.mid = []
        this._smoothingBuffers.high = []
    }
}

// =============================================================================
// Input Managers (Browser-side integration)
// =============================================================================

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
        return !!(typeof navigator !== 'undefined' && navigator.requestMIDIAccess)
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
        return !!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof AudioContext !== 'undefined')
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
