/**
 * The demo in package mode (index.html?package=1): one realm of the Portable
 * package viewer, demo/shaders/package.html.
 *
 * The viewer page owns hot reload. For each revision of a package it opens a
 * fresh realm, an iframe of this page, and sends it the revision's files as
 * bytes. The realm loads them through the public package API
 * (loadPortablePackage, then registerPortableEffect), compiles the package's
 * program in the demo, renders a frame, and reports whether it was accepted.
 * A realm loads one revision only: the engine's registries refuse a second
 * effect with the same name, so a new revision needs a new realm.
 *
 * Messages, all with `source: 'portable-viewer'`:
 *   realm to viewer: { type: 'ready' }
 *                    { type: 'accepted', revision, func, backend }
 *                    { type: 'failed', revision, error }, with a null
 *                      revision when the demo itself did not start
 *   viewer to realm: { type: 'edits', edits }, edits made while it loaded
 *                    { type: 'edit', revision, name, value }
 *   viewer to realm: { type: 'load', revision, files: [[path, ArrayBuffer]], edits }
 */

import { loadPortablePackage } from '../../../shaders/src/portable/package.js'

const SOURCE = 'portable-viewer'

/** The language a backend name of the demo selects in a package. */
const PACKAGE_BACKEND = { glsl: 'webgl2', wgsl: 'webgpu' }

/**
 * The program that shows a package: its defaultProgram, or, for a starter
 * without one, the effect alone (through render3d for a volume).
 */
export function packageProgram(definition, isStarter) {
    if (typeof definition.defaultProgram === 'string' && definition.defaultProgram.trim()) return definition.defaultProgram
    if (!isStarter) throw new Error('A portable filter or volume renderer needs a defaultProgram with its input chain.')
    const renderVolume = definition.outputTex3d ? '.render3d()' : ''
    return `search user, render\n${definition.func}()${renderVolume}.write(o0)\nrender(o0)`
}

/** The text of an error, with a package's diagnostics joined. */
export function errorText(error) {
    if (error && typeof error === 'object') {
        if (Array.isArray(error.diagnostics) && error.diagnostics.length) {
            return error.diagnostics.map(entry => entry.message || JSON.stringify(entry)).join('; ')
        }
        if (error.message) return error.message
    }
    return String(error)
}

/**
 * Run this page as a realm of the package viewer.
 * @param {object} demo - The demo's renderer, UI controller and its compile
 *   step: { renderer, ui, compileDsl(dsl), setPaused(paused), setPausedTime(t) }
 */
export function startPackageRealm({ renderer, ui, compileDsl, setPaused, setPausedTime }) {
    const parent = window.parent !== window ? window.parent : null
    const post = message => parent?.postMessage({ source: SOURCE, ...message }, location.origin)
    // The demo sizes its canvas to its layout on a resize; its layout is
    // shown now, so size the canvas before the first frame.
    window.dispatchEvent(new Event('resize'))
    let loading = null
    let func = null
    let revision = null
    let globals = {}

    // Apply the edits of earlier revisions on this package's steps, as a
    // control change applies them, and show them in the controls.
    function applyEdits(edits) {
        const steps = ui.programState.getStructure().filter(entry => entry.effectKey === `user.${func}`)
        const known = Object.entries(edits ?? {}).filter(([name]) => Object.hasOwn(globals, name))
        if (!steps.length || !known.length) return
        ui.programState.batch(() => {
            for (const step of steps) {
                for (const [name, value] of known) ui.programState.setValue(`step_${step.stepIndex}`, name, value)
            }
        })
        ui._syncControlValuesFromState()
    }

    // Report an edit of the package's own step, so that the viewer can replay
    // it in the next revision's realm. Built-in effects keep their own values.
    ui.programState.on('change', change => {
        if (!func || !change?.stepKey || change.paramName === undefined) return
        const step = ui.programState.getStructure().find(entry => `step_${entry.stepIndex}` === change.stepKey)
        if (step?.effectKey !== `user.${func}`) return
        post({ type: 'edit', revision, name: change.paramName, value: change.value })
    })

    async function load({ revision: next, files, edits = {} }) {
        revision = next
        try {
            const bytes = new Map(files.map(([path, buffer]) => [path, new Uint8Array(buffer)]))
            const loaded = loadPortablePackage(bytes, { backend: PACKAGE_BACKEND[renderer.backend] })
            if (loaded.diagnostics.length) throw Object.assign(new Error('the package does not load'), { diagnostics: loaded.diagnostics })
            const definition = loaded.definition
            // Registration refuses a declared paramAliases in every profile;
            // name the fix, as scripts/validate-portable.mjs does.
            if (Object.hasOwn(definition, 'paramAliases')) {
                throw new Error('paramAliases is retired: use the canonical parameter names in the program')
            }
            const cached = await renderer.registerPortableEffect({ ...definition, shaders: loaded.shaders })
            func = cached.instance?.func ?? definition.func
            const dsl = packageProgram({ ...definition, func }, Boolean(cached.instance?.starter))
            ui.setDsl(dsl)
            await compileDsl(dsl)
            globals = definition.globals ?? {}
            applyEdits(edits)
            renderer.render(0)
            setPaused(false)
            post({ type: 'accepted', revision: next, func, backend: renderer.backend })
        } catch (error) {
            post({ type: 'failed', revision: next, error: errorText(error) })
        }
    }

    window.addEventListener('message', event => {
        if (event.source !== parent || event.origin !== location.origin) return
        const message = event.data
        if (message?.source !== SOURCE) return
        if (message.type === 'load' && !loading) {
            loading = load(message)
        } else if (message.type === 'edits' && loading) {
            // Edits made in the previous realm while this one compiled.
            loading.then(() => applyEdits(message.edits))
        }
    })

    // The viewer reads the visible realm through this object.
    window.__portableRealm = {
        get renderer() { return renderer },
        get ui() { return ui },
        setPaused,
        setPausedTime,
        async dispose() {
            renderer.stop()
            await renderer.dispose()
        },
    }
    post({ type: 'ready' })
}
