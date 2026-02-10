import http from 'http'
import fs from 'fs/promises'
import path from 'path'

const host = process.env.HOST || '127.0.0.1'
const port = process.env.PORT ? Number(process.env.PORT) : 4173
const root = process.cwd()

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.wgsl': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8'
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return mimeTypes[ext] || 'application/octet-stream'
}

function safeJoin(base, target) {
  const normalized = path.normalize(target).replace(/^\/+/, '')
  const resolvedPath = path.resolve(base, normalized)
  const relative = path.relative(base, resolvedPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }
  return resolvedPath
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Bad Request')
      return
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host}`)
    let pathname = decodeURIComponent(requestUrl.pathname)
    if (pathname.endsWith('/')) {
      pathname += 'index.html'
    }

    const filePath = safeJoin(root, pathname)
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Forbidden')
      return
    }

    let stat
    try {
      stat = await fs.stat(filePath)
    } catch {
      stat = null
    }

    if (!stat) {
      console.warn(`[serve] 404 ${pathname}`)
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not Found')
      return
    }

    let finalPath = filePath
    if (stat.isDirectory()) {
      finalPath = safeJoin(filePath, 'index.html')
      if (!finalPath) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Forbidden')
        return
      }
      try {
        await fs.access(finalPath)
      } catch {
        console.warn(`[serve] 404 ${pathname}`)
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not Found')
        return
      }
    }

    const data = await fs.readFile(finalPath)
    res.writeHead(200, {
      'Content-Type': getContentType(finalPath),
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'ETag': `"${Date.now()}"`
    })
    res.end(data)
  } catch (err) {
    console.error('[serve] error', err)
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Internal Server Error')
  }
})

server.listen(port, host, () => {
  console.log(`[serve] listening on http://${host}:${port}`)
})

const shutdown = () => {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
