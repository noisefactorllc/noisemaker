#!/usr/bin/env node
/**
 * Package a Portable effect directory as a ZIP archive.
 *
 *   node scripts/package-portable.mjs [effectDir] [outputFile]
 *
 * With no arguments it packages the starter example,
 * shaders/portable/examples/gradient-sweep/, into effect.zip in the current
 * directory. The archive holds the directory's files at its root, deflated,
 * with UTF-8 names, as docs/shaders/effects.rst Section 8.1 reads a ZIP
 * package. A .DS_Store file and a __MACOSX directory are left out, as the
 * engine leaves them out of a package.
 *
 * The archive is written with node:zlib alone. It replaces Portable's two
 * packagers (https://github.com/noisefactorllc/portable at 6f211e44): its
 * package-portable.mjs, which used a ZIP package, and package-portable.sh.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_EFFECT = path.join(REPO_ROOT, 'shaders/portable/examples/gradient-sweep')
export const DEFAULT_OUTPUT = 'effect.zip'

// macOS resource junk is not part of a package.
const JUNK_PATTERN = /(^|\/)[^/]*\.DS_Store$|(^|\/)__MACOSX(\/|$)/

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
})

function crc32(bytes) {
    let c = 0xffffffff
    for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

/** The package's files under `dir`, as [archive name, absolute path], in name order. */
export function packageEntries(dir) {
    const entries = []
    const walk = (folder, prefix) => {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            const name = prefix + entry.name
            if (JUNK_PATTERN.test(name)) continue
            const full = path.join(folder, entry.name)
            if (entry.isDirectory()) walk(full, `${name}/`)
            else if (entry.isFile()) entries.push([name, full])
        }
    }
    walk(dir, '')
    return entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

// An MS-DOS date and time, as a ZIP entry records them; 1980 is the earliest.
function dosDateTime(date) {
    const year = Math.max(1980, date.getFullYear())
    return {
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
        date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    }
}

/**
 * A ZIP archive of `entries` ([name, absolute path]), as one buffer. Each file
 * is deflated, records its CRC-32 and sizes in its local header, and has a
 * central directory record. It refuses what needs ZIP64.
 */
export function zipEntries(entries) {
    const UTF8_NAMES = 0x0800
    const DEFLATE = 8
    const VERSION = 20
    const locals = []
    const centrals = []
    let offset = 0
    if (entries.length > 0xffff) throw new Error('too many files for a ZIP archive without ZIP64')
    for (const [name, file] of entries) {
        const data = fs.readFileSync(file)
        const compressed = deflateRawSync(data, { level: 9 })
        const nameBytes = Buffer.from(name, 'utf8')
        const { time, date } = dosDateTime(fs.statSync(file).mtime)
        const crc = crc32(data)
        if (data.length > 0xfffffffe || compressed.length > 0xfffffffe || offset > 0xfffffffe) {
            throw new Error(`${name} is too large for a ZIP archive without ZIP64`)
        }
        const local = Buffer.alloc(30)
        local.writeUInt32LE(0x04034b50, 0)
        local.writeUInt16LE(VERSION, 4)
        local.writeUInt16LE(UTF8_NAMES, 6)
        local.writeUInt16LE(DEFLATE, 8)
        local.writeUInt16LE(time, 10)
        local.writeUInt16LE(date, 12)
        local.writeUInt32LE(crc, 14)
        local.writeUInt32LE(compressed.length, 18)
        local.writeUInt32LE(data.length, 22)
        local.writeUInt16LE(nameBytes.length, 26)
        local.writeUInt16LE(0, 28)
        const central = Buffer.alloc(46)
        central.writeUInt32LE(0x02014b50, 0)
        central.writeUInt16LE(VERSION, 4)
        central.writeUInt16LE(VERSION, 6)
        central.writeUInt16LE(UTF8_NAMES, 8)
        central.writeUInt16LE(DEFLATE, 10)
        central.writeUInt16LE(time, 12)
        central.writeUInt16LE(date, 14)
        central.writeUInt32LE(crc, 16)
        central.writeUInt32LE(compressed.length, 20)
        central.writeUInt32LE(data.length, 24)
        central.writeUInt16LE(nameBytes.length, 28)
        central.writeUInt32LE(offset, 42)
        locals.push(local, nameBytes, compressed)
        centrals.push(central, nameBytes)
        offset += local.length + nameBytes.length + compressed.length
    }
    const directory = Buffer.concat(centrals)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(entries.length, 8)
    end.writeUInt16LE(entries.length, 10)
    end.writeUInt32LE(directory.length, 12)
    end.writeUInt32LE(offset, 16)
    return Buffer.concat([...locals, directory, end])
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`
}

/**
 * Write the package at `effectDir` to `outputPath`. A failure before the
 * output opens leaves any existing file there as it was. A failure after it
 * opens removes the output, so no partial archive is left.
 */
export function packagePortable(effectDir, outputPath) {
    if (!fs.existsSync(effectDir) || !fs.statSync(effectDir).isDirectory()) {
        throw new Error(`Effect directory not found: ${effectDir}`)
    }
    const archive = zipEntries(packageEntries(effectDir))
    const fd = fs.openSync(outputPath, 'w')
    try {
        let written = 0
        while (written < archive.length) written += fs.writeSync(fd, archive, written, archive.length - written)
        fs.closeSync(fd)
    } catch (error) {
        try { fs.closeSync(fd) } catch { /* closed already */ }
        fs.rmSync(outputPath, { force: true })
        throw error
    }
    return archive.length
}

function main(argv) {
    const [effectArg, outputArg] = argv
    const effectPath = path.resolve(effectArg ?? DEFAULT_EFFECT)
    const outputPath = path.resolve(outputArg ?? DEFAULT_OUTPUT)
    console.log('Packaging effect...')
    console.log('  → Creating ZIP archive...')
    const size = packagePortable(effectPath, outputPath)
    console.log('')
    console.log(`Effect packaged: ${outputPath} (${formatSize(size)})`)
    console.log('')
    console.log(`To import: Open Noisedeck → file → import effect from zip → Select ${outputPath}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main(process.argv.slice(2))
    } catch (error) {
        console.error('Error:', error.message)
        process.exit(1)
    }
}
