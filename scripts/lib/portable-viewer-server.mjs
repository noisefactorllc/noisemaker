/**
 * A static server over this checkout for the Portable viewer's tests.
 *
 * The tests came from Portable's repository, where the starter effect was at
 * /effect/ and the 3D examples at /examples/<name>/. This server keeps those
 * URLs for the packages' new homes, so the tests' routes and the ids the
 * viewer derives from them are as they were, and serves the rest of the
 * checkout as it is. The viewer is VIEWER_PATH.
 */

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const VIEWER_PATH = '/demo/shaders/package.html'

// What a capture of the canvas hides: the viewer's status line, and the
// notices the demo shows after a compile, both drawn over the canvas. A capture
// compares the canvas, not what the page draws over it, and a notice can still
// be showing or already gone when a capture is taken.
export const CANVAS_SCREENSHOT_STYLE = '#status, .hf-toast-container { visibility: hidden !important; }'

/** A PNG of the realm's canvas, as the page shows it, without its overlays. */
export function captureCanvas(frame) {
    return frame.locator('#canvas').screenshot({ style: CANVAS_SCREENSHOT_STYLE, scale: 'css' })
}

/** Portable's URL prefixes, and the directories of this checkout they name. */
export const PORTABLE_ALIASES = Object.freeze({
    '/effect/': 'shaders/portable/examples/gradient-sweep/',
    '/examples/portableBlock3d/': 'shaders/portable/examples/portable-block-3d/',
    '/examples/volumeColor3d/': 'shaders/portable/examples/volume-color-3d/',
})

const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.wgsl': 'text/plain',
    '.glsl': 'text/plain',
    '.vert': 'text/plain',
    '.frag': 'text/plain',
    '.md': 'text/plain',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.obj': 'text/plain',
    '.zip': 'application/zip',
}

/** The checkout file a request path names, or null. */
export function fileFor(pathname) {
    let relative = pathname
    for (const [prefix, directory] of Object.entries(PORTABLE_ALIASES)) {
        if (pathname.startsWith(prefix)) {
            relative = `/${directory}${pathname.slice(prefix.length)}`
            break
        }
    }
    const file = path.resolve(ROOT, `.${decodeURIComponent(relative)}`)
    return file === ROOT || file.startsWith(ROOT + path.sep) ? file : null
}

/**
 * Start the server on a free local port. A request for a directory serves
 * its index.html; HEAD answers with the headers alone.
 * @returns {Promise<{ server, port, origin }>}
 */
export function startPortableViewerServer() {
    const server = createServer(async (req, res) => {
        try {
            let file = fileFor(new URL(req.url, 'http://localhost').pathname)
            if (!file) throw new Error('outside the checkout')
            if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html')
            const body = await readFile(file)
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
            res.end(req.method === 'HEAD' ? undefined : body)
        } catch {
            res.writeHead(404)
            res.end('Not found')
        }
    })
    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address()
            resolve({ server, port, origin: `http://127.0.0.1:${port}` })
        })
    })
}
