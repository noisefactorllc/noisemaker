/**
 * The Portable package viewer, demo/shaders/package.html?package=<url>.
 *
 * It shows a package in the demo and reloads it when its files change. Each
 * revision loads in a fresh realm: an iframe of the demo in package mode
 * (index.html?package=1, lib/portable-realm.js), which receives the
 * revision's files as bytes and loads them through the public package API.
 * The visible realm is replaced only when the new one has compiled and
 * rendered the revision, and the revision is still the latest. A failed
 * revision leaves the last good realm in place, and a newer revision cancels
 * an older one still loading.
 *
 * `package` is the URL of a package directory (definition.json, help.md and
 * the shader files of its programs) or of a .zip archive, which carries any
 * other file too. `backend` is glsl or wgsl.
 *
 * The page keeps the harness of Portable's viewer, which shade-mcp drives:
 * #status (class success or error) and the window.__portable* globals.
 */

import { fileMapFromZip } from '../../../shaders/src/portable/package.js'

const SOURCE = 'portable-viewer'
const REALM_URL = new URL('../index.html?package=1', import.meta.url)
const STARTER_URL = new URL('../../../shaders/portable/examples/gradient-sweep/', import.meta.url)
const POLL_MS = 1000

const statusEl = document.getElementById('status')
const frames = document.getElementById('realms')

const params = new URLSearchParams(location.search)
let packageUrl = resolvePackageUrl(params.get('package'))
let currentEffectId = effectIdOf(packageUrl)
let requestedBackend = params.get('backend') === 'wgsl' ? 'wgsl' : 'glsl'
let currentBackend = requestedBackend

// The definition of the latest revision read, whether or not it was accepted.
let definition = null
// The parameters the user changed, replayed in every later realm.
let edits = {}
let pipelineGeneration = 0
let revisionCounter = 0
let latestRevision = 0
// The visible realm: { frame, revision }.
let visible = null
// The realm loading the latest revision, if any.
let candidate = null
// The stamps of the files the latest revision read, by URL, and which have
// been rebased against a HEAD response (see checkForChanges).
let stamps = new Map()
let headSeen = new Set()
let reloading = false

function resolvePackageUrl(value) {
    const url = value ? new URL(value, location.href) : new URL(STARTER_URL)
    if (!isZip(url) && !url.pathname.endsWith('/')) url.pathname += '/'
    return url
}

function isZip(url) {
    return url.pathname.toLowerCase().endsWith('.zip')
}

// The id shade-mcp knows the effect by: its directory or archive name until
// the harness selects one by id.
function effectIdOf(url) {
    const name = url.pathname.split('/').filter(Boolean).pop() || 'effect'
    return isZip(url) ? name.replace(/\.zip$/i, '') : name
}

function setStatus(message, type = '') {
    statusEl.textContent = message
    statusEl.className = type
}

// A file's change validator: Last-Modified, or the ETag that static servers
// send instead.
function validator(response) {
    return response.ok ? (response.headers.get('Last-Modified') || response.headers.get('ETag')) : null
}

async function fetchFile(url, files, path, required) {
    const response = await fetch(url, { cache: 'no-store' })
    stamps.set(url.href, validator(response))
    if (!response.ok) {
        if (required) throw new Error(`Failed to load ${path} (${response.status})`)
        return
    }
    files.set(path, await response.arrayBuffer())
}

/** The files of the package at `url`, by path, as ArrayBuffers. */
async function readPackage(url) {
    const files = new Map()
    stamps = new Map()
    headSeen = new Set()
    if (isZip(url)) {
        const response = await fetch(url, { cache: 'no-store' })
        stamps.set(url.href, validator(response))
        if (!response.ok) throw new Error(`Failed to load ${url.pathname} (${response.status})`)
        const read = await fileMapFromZip(new Uint8Array(await response.arrayBuffer()))
        if (!read.files) throw Object.assign(new Error('the archive does not read'), { diagnostics: read.diagnostics })
        for (const [path, bytes] of read.files) files.set(path, bytes.slice().buffer)
        return files
    }
    await fetchFile(new URL('definition.json', url), files, 'definition.json', true)
    let declared
    try {
        declared = JSON.parse(new TextDecoder().decode(files.get('definition.json')))
    } catch (error) {
        throw new Error(`definition.json is not JSON: ${error.message}`)
    }
    const passes = Array.isArray(declared?.passes) ? declared.passes : Object.values(declared?.passes ?? {})
    const programs = [...new Set(passes.map(pass => pass?.program).filter(name => typeof name === 'string'))]
    const wanted = ['help.md']
    for (const program of programs) wanted.push(`glsl/${program}.glsl`, `wgsl/${program}.wgsl`)
    for (const declaration of Array.isArray(declared?.capabilities) ? declared.capabilities : []) {
        if (typeof declaration?.id === 'string' && Number.isInteger(declaration.version)) {
            wanted.push(`capabilities/${declaration.id}/v${declaration.version}.json`)
        }
    }
    await Promise.all(wanted.map(path => fetchFile(new URL(path, url), files, path, false)))
    // A program without a .glsl file can have split GLSL stages.
    const split = programs.filter(program => !files.has(`glsl/${program}.glsl`))
        .flatMap(program => [`glsl/${program}.vert`, `glsl/${program}.frag`])
    await Promise.all(split.map(path => fetchFile(new URL(path, url), files, path, false)))
    return files
}

function readDefinition(files) {
    try {
        return JSON.parse(new TextDecoder().decode(files.get('definition.json')))
    } catch {
        return null
    }
}

// The backend a package can run on: the requested one when every program
// has its language, else the one language it has.
function backendFor(files, requested) {
    const names = [...files.keys()]
    const has = language => language === 'glsl'
        ? names.some(name => /^glsl\/.+\.(glsl|frag)$/.test(name))
        : names.some(name => /^wgsl\/.+\.wgsl$/.test(name))
    if (has(requested)) return requested
    return requested === 'glsl' ? (has('wgsl') ? 'wgsl' : 'glsl') : (has('glsl') ? 'glsl' : 'wgsl')
}

function createRealm(backend) {
    const frame = document.createElement('iframe')
    frame.className = 'portable-realm'
    frame.title = 'Portable package'
    const src = new URL(REALM_URL)
    src.searchParams.set('backend', backend)
    frame.src = src.href
    frames.appendChild(frame)
    return frame
}

async function disposeRealm(frame) {
    try {
        await frame?.contentWindow?.__portableRealm?.dispose()
    } catch {
        // A realm that never started has nothing to dispose.
    }
    frame?.remove()
}

/**
 * Show the package's latest files in a new realm. Resolves with { ok } when
 * that realm is accepted and shown, or { error } when it is refused, failed
 * or superseded.
 */
async function loadLatest() {
    const revision = ++revisionCounter
    latestRevision = revision
    let files
    try {
        files = await readPackage(packageUrl)
    } catch (error) {
        if (revision !== latestRevision) return { error: 'superseded by a newer revision' }
        const message = `Failed to load effect: ${errorText(error)}`
        setStatus(message, 'error')
        return { error: message }
    }
    if (revision !== latestRevision) return { error: 'superseded by a newer revision' }
    definition = readDefinition(files)
    const backend = backendFor(files, requestedBackend)
    // A newer revision cancels the one still loading.
    if (candidate) {
        const superseded = candidate
        candidate = null
        superseded.cancel()
        await disposeRealm(superseded.frame)
    }
    const frame = createRealm(backend)
    let cancel
    const outcome = await new Promise(resolve => {
        cancel = () => {
            window.removeEventListener('message', onMessage)
            resolve({ error: 'superseded by a newer revision' })
        }
        candidate = { frame, revision, cancel }
        const onMessage = event => {
            if (event.source !== frame.contentWindow || event.origin !== location.origin) return
            const message = event.data
            if (message?.source !== SOURCE) return
            if (message.type === 'ready') {
                const entries = [...files].map(([path, buffer]) => [path, buffer.slice(0)])
                frame.contentWindow.postMessage({ source: SOURCE, type: 'load', revision, files: entries, edits },
                    location.origin, entries.map(([, buffer]) => buffer))
            } else if (message.type === 'accepted' && message.revision === revision) {
                window.removeEventListener('message', onMessage)
                resolve({ ok: true, func: message.func, backend: message.backend })
            } else if (message.type === 'failed' && message.revision === revision) {
                window.removeEventListener('message', onMessage)
                resolve({ error: message.error })
            }
        }
        window.addEventListener('message', onMessage)
        frame.addEventListener('error', () => {
            window.removeEventListener('message', onMessage)
            resolve({ error: 'the realm did not load' })
        })
    })
    if (candidate?.frame === frame) candidate = null
    // A final revision check: only the latest revision replaces the visible realm.
    if (revision !== latestRevision || outcome.error === 'superseded by a newer revision') {
        if (frame.isConnected) await disposeRealm(frame)
        return { error: 'superseded by a newer revision' }
    }
    if (outcome.error) {
        await disposeRealm(frame)
        setStatus(outcome.error, 'error')
        console.error('Effect load error:', outcome.error)
        return { error: outcome.error }
    }
    const previous = visible
    visible = { frame, revision }
    frame.classList.add('active')
    currentBackend = outcome.backend
    await disposeRealm(previous?.frame)
    pipelineGeneration++
    setStatus(`Loaded: user.${outcome.func} (${outcome.backend === 'wgsl' ? 'WebGPU' : 'WebGL'})`, 'success')
    return { ok: true }
}

function errorText(error) {
    if (error && typeof error === 'object') {
        if (Array.isArray(error.diagnostics) && error.diagnostics.length) {
            return error.diagnostics.map(entry => entry.message || JSON.stringify(entry)).join('; ')
        }
        if (error.message) return error.message
    }
    return String(error)
}

// Edits of the visible realm's package steps, replayed in later realms.
window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== visible?.frame?.contentWindow) return
    const message = event.data
    if (message?.source === SOURCE && message.type === 'edit' && typeof message.name === 'string') {
        edits = { ...edits, [message.name]: message.value }
    }
})

// The harness's loads run one at a time, and the poll waits for them. A poll
// that finds an edit while its own reload is still loading starts the newer
// revision, which cancels the older one.
let queue = Promise.resolve()
function runLoad(prepare) {
    const run = queue.then(async () => {
        reloading = true
        try {
            prepare?.()
            return await loadLatest()
        } finally {
            reloading = false
        }
    })
    queue = run.catch(() => {})
    return run
}

function reloadOnChange(statusMessage) {
    setStatus(statusMessage, 'success')
    loadLatest()
}

// A HEAD stamp that differs from the stored GET stamp is an edit, or a
// server whose HEAD and GET headers differ. A GET settles it.
async function stampDiffers(url, stored) {
    return validator(await fetch(url, { cache: 'no-store' })) !== stored
}

async function checkForChanges() {
    if (reloading) return
    try {
        for (const [href, stored] of stamps) {
            const url = new URL(href)
            const head = validator(await fetch(url, { method: 'HEAD', cache: 'no-store' }))
            const message = url.pathname.endsWith('/definition.json') || isZip(url)
                ? 'Changes detected, reloading...'
                : 'Shader changes detected, reloading...'
            if (!headSeen.has(href)) {
                // The first tick after a load: a GET decides whether an edit
                // landed since the load; header skew is absorbed by rebasing.
                headSeen.add(href)
                if (head !== stored && await stampDiffers(url, stored)) {
                    reloadOnChange(message)
                    return
                }
                stamps.set(href, head)
                continue
            }
            if (head !== stored) {
                reloadOnChange(message)
                return
            }
        }
    } catch {
        // A failed poll is retried on the next tick.
    }
}

// The harness shade-mcp drives, as Portable's viewer had it.
const realm = () => visible?.frame?.contentWindow?.__portableRealm ?? null
Object.defineProperty(window, '__portableCanvasRenderer', { get: () => realm()?.renderer ?? null, configurable: true })
Object.defineProperty(window, '__portableRenderingPipeline', { get: () => realm()?.renderer?.pipeline ?? null, configurable: true })
Object.defineProperty(window, '__portableFrameCount', { get: () => realm()?.renderer?.pipeline?.frameIndex ?? 0, configurable: true })
Object.defineProperty(window, '__portableCurrentEffect', {
    get: () => ({ id: currentEffectId, instance: { globals: definition?.globals || {} } }),
    configurable: true,
})
Object.defineProperty(window, '__portablePipelineGeneration', { get: () => pipelineGeneration, configurable: true })
window.__portableCurrentBackend = () => realm()?.renderer?.backend ?? currentBackend
window.__portableSetPaused = paused => realm()?.setPaused(paused)
window.__portableSetPausedTime = time => realm()?.setPausedTime(time)
// Select an effect by its id and the URL its directory is served at.
window.__portableSelectEffect = (id, options = {}) => runLoad(() => {
    const url = resolvePackageUrl(options.url || `../${id}/`)
    if (url.href !== packageUrl.href) {
        packageUrl = url
        edits = {}
    }
    currentEffectId = id
})
// Show the package on another backend. A package without that language for
// every program is refused.
window.__portableSetBackend = async backend => {
    const requested = backend === 'wgsl' ? 'wgsl' : 'glsl'
    const result = await runLoad(() => { requestedBackend = requested })
    if (result.ok && currentBackend !== requested) {
        throw new Error(`This effect has no ${requested === 'wgsl' ? 'WGSL' : 'GLSL'} shader for every pass`)
    }
    return result
}

setStatus('Loading effect...')
await runLoad()
setInterval(checkForChanges, POLL_MS)
