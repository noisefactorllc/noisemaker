/**
 * The fixed-step simulation clock.
 *
 * A loop of L seconds has N = max(1, round(60 * L)) steps, at loop positions
 * g / N. The loop position tau counts whole loops (tau = loops + t), and a
 * render at tau shows the state after grid step G(tau) = floor(tau * N + EPS).
 * Each render runs every grid step after the last one it ran, up to G(tau), so
 * the state at a loop position does not depend on the display, the render
 * speed, the frame rate or the number of renders. The wrap continues the grid:
 * there is no reset and no odd-sized step. The clock keeps an integer step
 * counter and never accumulates a float time.
 *
 * A render whose due steps number more than K = min(30, ceil(N / 2)) is a
 * discontinuity: the clock re-anchors there and runs one step, as at a start.
 * A start (the first render, after reset(), after a discontinuity) runs one
 * step. The clock reads only loop times, so a backward jump reads as a wrap.
 *
 * This module holds no GPU state, so it can be tested on its own.
 */

/** Steps per second of loop time. */
export const STEPS_PER_SECOND = 60

/** Float tolerance on a host's loop time, in steps (for example k / 30). */
export const STEP_EPSILON = 1e-6

/**
 * The number of steps in a loop of `loopDuration` seconds.
 * @param {number} loopDuration
 * @returns {number}
 */
export function stepsPerLoop(loopDuration) {
    const n = Math.round(STEPS_PER_SECOND * loopDuration)
    return Number.isFinite(n) && n >= 1 ? n : 1
}

/**
 * The largest number of due steps that a render runs before it is a
 * discontinuity: half a second of steps, and half a loop for a short loop.
 * @param {number} n - Steps per loop
 * @returns {number}
 */
export function jumpLimit(n) {
    return Math.min(30, Math.ceil(n / 2))
}

export class SimulationClock {
    /**
     * @param {number} [loopDuration=10] - Loop duration in seconds
     */
    constructor(loopDuration = 10) {
        this.setLoopDuration(loopDuration)
        this.reset()
    }

    /** Steps per loop. */
    get stepsPerLoop() {
        return this._n
    }

    /** The step size in loop time, 1 / N. */
    get stepSize() {
        return 1 / this._n
    }

    /** The jump limit K. */
    get jumpLimit() {
        return jumpLimit(this._n)
    }

    /**
     * The last grid step run, as a loop position index, or null before a start.
     * @returns {number|null}
     */
    get lastStep() {
        return this._anchored ? this._lastStep : null
    }

    /** Steps run since the last start. */
    get stepsSinceStart() {
        return this._stepsSinceStart
    }

    /** Whether the next render is a start. */
    get startPending() {
        return !this._anchored
    }

    /**
     * Set the loop duration. The state is kept: the next render seeks to its
     * time without stepping, because the host restarts its loop there.
     * @param {number} loopDuration - Seconds
     */
    setLoopDuration(loopDuration) {
        // The host restarts its loop at a new time, so the next render seeks,
        // whether or not N changes.
        if (this._n !== undefined && this._anchored) this._seekPending = true
        this._n = stepsPerLoop(loopDuration)
    }

    /** Whether the next render seeks without stepping (after a change of loop duration). */
    get seekPending() {
        return this._anchored && this._seekPending
    }

    /** Make the next render a start. */
    reset() {
        this._anchored = false
        this._seekPending = false
        this._editPending = false
        this._loops = 0
        this._lastTime = 0
        this._lastStep = 0
        this._stepsSinceStart = 0
    }

    /**
     * Move the clock to loop time `t` without stepping; the state is kept. The
     * next render steps from the first grid step after `t`. Before a start it
     * changes nothing: the next render is still a start.
     * @param {number} t - Loop time in [0, 1)
     */
    seek(t) {
        if (!this._anchored) return
        this._seekPending = false
        this._loops = 0
        this._lastTime = t
        this._lastStep = this._gridStep(t)
    }

    /** Mark an edit: the next render runs one step when no step is due and the loop is stopped. */
    markEdit() {
        this._editPending = true
    }

    /** Clear a pending edit mark. */
    clearEdit() {
        this._editPending = false
    }

    /**
     * The loop time of the grid step after loop time `fromTime`, wrapped to
     * [0, 1), for stepping one grid step while paused. A host that queues
     * steps passes the time of the last one it queued.
     * @param {number} fromTime - Loop time to step from
     * @returns {number}
     */
    nextStepTime(fromTime) {
        return ((this._gridStep(fromTime) + 1) % this._n) / this._n
    }

    /**
     * Advance to loop time `t` and return the grid steps to run, in order.
     * @param {number} t - Loop time in [0, 1)
     * @param {object} [options]
     * @param {boolean} [options.stopped=true] - Whether the host's loop is stopped (for the edit mark)
     * @returns {{steps: number[], start: boolean, discontinuity: boolean, seek: boolean, edit: boolean, deltaTime: number}}
     *   `steps` are grid indices g (step time (g mod N) / N). `deltaTime` is the
     *   loop time since the previous render, with the wrap counted as +1, and 0
     *   after a start or a seek.
     */
    advance(t, { stopped = true } = {}) {
        const edit = this._editPending
        this._editPending = false
        const result = { steps: [], start: false, discontinuity: false, seek: false, edit: false, deltaTime: 0 }

        if (!this._anchored) {
            this._anchor(t)
            result.start = true
            result.steps.push(this._lastStep)
            this._stepsSinceStart = 1
            return result
        }
        if (this._seekPending) {
            this.seek(t)
            result.seek = true
            return result
        }

        // A time a hair below the previous one is the same time, not a wrap.
        const sameTime = t <= this._lastTime && this._lastTime - t <= STEP_EPSILON / this._n
        const loops = !sameTime && t < this._lastTime ? this._loops + 1 : this._loops
        // Whole loops and the step within the loop stay integers.
        const target = sameTime
            ? this._loops * this._n + this._gridStep(this._lastTime)
            : loops * this._n + this._gridStep(t)
        const due = target - this._lastStep
        const deltaTime = sameTime ? 0 : (loops - this._loops) + (t - this._lastTime)

        if (due > this.jumpLimit) {
            this._anchor(t)
            result.discontinuity = true
            result.steps.push(this._lastStep)
            this._stepsSinceStart = 1
            return result
        }

        if (!sameTime) {
            this._loops = loops
            this._lastTime = t
        }
        result.deltaTime = deltaTime
        for (let g = this._lastStep + 1; g <= target; g++) result.steps.push(g)
        if (result.steps.length) {
            this._lastStep = result.steps[result.steps.length - 1]
        } else if (edit && stopped) {
            // An edit step advances the state at the next grid step's time but
            // leaves the grid where it is, so the clock never runs ahead of the
            // host's time and playback resumes without a pause.
            result.steps.push(this._lastStep + 1)
            result.edit = true
        }
        this._stepsSinceStart += result.steps.length
        return result
    }

    /**
     * The loop time of grid step `g`, in [0, 1).
     * @param {number} g
     * @returns {number}
     */
    stepTime(g) {
        return (((g % this._n) + this._n) % this._n) / this._n
    }

    _gridStep(t) {
        return Math.floor(t * this._n + STEP_EPSILON)
    }

    _anchor(t) {
        this._anchored = true
        this._seekPending = false
        this._loops = 0
        this._lastTime = t
        this._lastStep = this._gridStep(t)
    }
}
