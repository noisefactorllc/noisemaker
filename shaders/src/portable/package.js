/**
 * Portable effect packages as files.
 *
 * A package is a file map: a package-relative path to the file's bytes (a
 * Uint8Array) or text (a string). A host reads one from a directory, or from a
 * ZIP archive with fileMapFromZip(). loadPortablePackage() reads the map and
 * nothing else: it fetches nothing and runs no code from the package.
 *
 * The layout:
 *   definition.json       the declaration (./definition.js reads it)
 *   glsl/<program>.glsl   a GLSL program as one fragment stage, or
 *   glsl/<program>.vert   a GLSL vertex stage, with
 *   glsl/<program>.frag   its GLSL fragment stage
 *   wgsl/<program>.wgsl   a WGSL program
 *   help.md               optional help text
 *   any other path        an asset, kept as bytes
 *
 * The loaded shaders use the keys the built-in loader uses: glsl, vertex,
 * fragment and wgsl. A GLSL program is complete with a .glsl file or a .frag
 * file; a .vert file without a .frag file is incomplete, and a .glsl file
 * beside split stages is refused. A package needs one complete language for
 * every program. With a backend, it needs that backend's language.
 *
 * The loader keeps every file's bytes, so packageFiles() gives back the same
 * file map. Assets are data the package carries: a host uploads them, for
 * example a mesh through loadOBJFromString(). No pass binds an asset by
 * declaration.
 */

import { normalizePortableDefinition } from './definition.js'
import { checkCapabilityDeclarations, normalizeCapabilityDescriptor } from './descriptor.js'
import { RESERVED_KEYS } from './grammar.js'

const DEFINITION = 'definition.json'
const HELP = 'help.md'
// A capability descriptor the package carries, named by its ID and version.
const DESCRIPTOR_DIRECTORY = 'capabilities/'
const DESCRIPTOR_FILE = /^capabilities\/([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)\/v([1-9][0-9]*)\.json$/
const BACKEND_LANGUAGE = Object.freeze({ webgl2: 'glsl', webgpu: 'wgsl' })
const STAGE_FILES = Object.freeze({
    glsl: { directory: 'glsl', extensions: { '.glsl': 'glsl', '.vert': 'vertex', '.frag': 'fragment' } },
    wgsl: { directory: 'wgsl', extensions: { '.wgsl': 'wgsl' } },
})
// Files an archiver adds that belong to no package: Portable's packager leaves
// out the same ones.
const JUNK = /(^|\/)\.DS_Store$|(^|\/)__MACOSX(\/|$)/

function diagnostic(code, path, message) {
    return { code, path, message }
}

// Names a Windows disk cannot hold as a file: reserved devices, with or
// without an extension.
const DEVICE_NAME = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³]) *(\.|$)/i

/**
 * The normal form of a package path, or null when the path cannot be a file of
 * the package. A backslash counts as a separator, "." segments are dropped and
 * the name is in Unicode NFC. An absolute path, a drive letter, an empty
 * segment, a ".." segment or a control character is refused. So is a segment
 * that a Windows disk would change or cannot hold: one that ends with a dot or
 * a space, holds one of < > : " | ? *, or names a reserved device (with or
 * without an extension, and with spaces before it).
 * @param {string} path
 * @returns {string|null}
 */
export function normalizePackagePath(path) {
    if (typeof path !== 'string' || path.length === 0) return null
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(path)) return null
    const unified = path.normalize('NFC').replace(/\\/g, '/')
    if (unified.startsWith('/') || /^[A-Za-z]:/.test(unified)) return null
    const segments = []
    for (const segment of unified.split('/')) {
        if (segment === '.') continue
        if (segment === '' || segment === '..') return null
        if (/[. ]$/.test(segment) || /[<>:"|?*]/.test(segment) || DEVICE_NAME.test(segment)) return null
        segments.push(segment)
    }
    return segments.length > 0 ? segments.join('/') : null
}

// The form two names share when a case-insensitive disk holds them as one
// file: each character in its simple upper case, as such a disk compares
// names. A character whose upper case is several characters stays as it is,
// so ß and ss stay distinct, while the long s folds to S.
function foldCase(name) {
    let folded = ''
    for (const char of name) {
        const upper = char.toUpperCase()
        folded += [...upper].length === 1 ? upper : char
    }
    return folded
}

// A copy, so that the loaded package does not change when the caller's bytes do.
function toBytes(content, copy = true) {
    if (content instanceof Uint8Array) return copy ? new Uint8Array(content) : content
    if (typeof content === 'string') return new TextEncoder().encode(content)
    return null
}

function decodeText(bytes) {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
        return null
    }
}

/**
 * Read a file map into normal paths and bytes. Two paths that normalize to one,
 * or that differ only in case, are refused: one of them would overwrite the
 * other when the package is written to a disk.
 * @param {Map<string, Uint8Array|string>|Object<string, Uint8Array|string>} files
 * @param {object} [options]
 * @param {boolean} [options.copy=true] - Copy the bytes it is given; false only for
 *   bytes that nothing else holds
 * @returns {{files: Map<string, Uint8Array>|null, diagnostics: Array}}
 */
export function readFileMap(files, { copy = true } = {}) {
    const entries = files instanceof Map ? [...files] : (files && typeof files === 'object' ? Object.entries(files) : null)
    if (!entries) return { files: null, diagnostics: [diagnostic('not-a-file-map', '', 'a package is a map of paths to file contents')] }
    const diagnostics = []
    const normal = new Map()
    const folded = new Map()
    for (const [path, content] of entries) {
        const name = normalizePackagePath(path)
        if (name === null) {
            diagnostics.push(diagnostic('invalid-path', String(path), `${JSON.stringify(path)} is not a relative path inside the package`))
            continue
        }
        if (JUNK.test(name)) continue
        const bytes = toBytes(content, copy)
        if (!bytes) {
            diagnostics.push(diagnostic('invalid-file', name, `${name} must be bytes (a Uint8Array) or text`))
            continue
        }
        const key = foldCase(name)
        if (folded.has(key)) {
            diagnostics.push(diagnostic('duplicate-path', name, `${JSON.stringify(path)} and ${JSON.stringify(folded.get(key))} name the same file`))
            continue
        }
        folded.set(key, path)
        normal.set(name, bytes)
    }
    return diagnostics.length > 0 ? { files: null, diagnostics } : { files: normal, diagnostics }
}

// The stage a path holds, as [language, program, key], or null for an asset.
function stageOf(path) {
    const slash = path.indexOf('/')
    if (slash < 0 || path.indexOf('/', slash + 1) >= 0) return null
    const directory = path.slice(0, slash)
    const file = path.slice(slash + 1)
    for (const [language, { directory: expected, extensions }] of Object.entries(STAGE_FILES)) {
        if (directory !== expected) continue
        const dot = file.lastIndexOf('.')
        const key = dot > 0 ? extensions[file.slice(dot)] : undefined
        if (key) return [language, file.slice(0, dot), key]
    }
    return null
}

// The stages of a program, read only from the package's own entries.
function stagesOf(shaders, program) {
    return Object.hasOwn(shaders, program) ? shaders[program] : undefined
}

function complete(language, stages) {
    if (!stages) return false
    return language === 'glsl' ? Boolean(stages.glsl || stages.fragment) : Boolean(stages.wgsl)
}

/**
 * Load a Portable package from its files.
 * @param {Map<string, Uint8Array|string>|Object<string, Uint8Array|string>} files
 * @param {object} [options]
 * @param {'webgl2'|'webgpu'} [options.backend] - The backend that will run the
 *   package: its language must cover every program
 * @returns {{profile: 'legacy'|'v2'|null, definition: object|null, shaders: object|null,
 *   assets: Map<string, Uint8Array>|null, help: string|null, files: Map<string, Uint8Array>|null,
 *   diagnostics: Array<{code: string, path: string, message: string}>}}
 */
export function loadPortablePackage(files, { backend, capabilityDescriptors = [] } = {}) {
    const failed = (diagnostics, profile = null) => ({
        profile, definition: null, shaders: null, assets: null, help: null, files: null,
        capabilities: null, capabilityDescriptors: null, diagnostics,
    })
    if (backend !== undefined && !Object.hasOwn(BACKEND_LANGUAGE, backend)) {
        return failed([diagnostic('unsupported-backend', '', `backend must be ${Object.keys(BACKEND_LANGUAGE).join(' or ')}`)])
    }
    const given = capabilityDescriptors ?? []
    if (!Array.isArray(given)) {
        return failed([diagnostic('invalid-value', 'capabilityDescriptors', 'capabilityDescriptors must be a list of capability descriptors')])
    }
    const read = readFileMap(files)
    if (!read.files) return failed(read.diagnostics)

    const diagnostics = []
    const definitionBytes = read.files.get(DEFINITION)
    if (!definitionBytes) return failed([diagnostic('missing-file', DEFINITION, `a package holds ${DEFINITION} at its root`)])
    const definitionText = decodeText(definitionBytes)
    let declared = null
    if (definitionText === null) {
        diagnostics.push(diagnostic('invalid-encoding', DEFINITION, `${DEFINITION} must be UTF-8`))
    } else {
        try {
            declared = JSON.parse(definitionText)
        } catch (error) {
            diagnostics.push(diagnostic('invalid-json', DEFINITION, `${DEFINITION} is not JSON: ${error.message}`))
        }
    }
    let help = null
    if (read.files.has(HELP)) {
        help = decodeText(read.files.get(HELP))
        if (help === null) diagnostics.push(diagnostic('invalid-encoding', HELP, `${HELP} must be UTF-8`))
    }

    // A version 2 package (one with a format marker) carries its capability
    // descriptors under capabilities/. A legacy package has no capabilities,
    // and keeps every file there as an asset, as before.
    const versioned = declared !== null && typeof declared === 'object' && !Array.isArray(declared) && declared.format !== undefined
    const shaders = {}
    const assets = new Map()
    const carried = []
    const descriptorDiagnostics = []
    for (const [path, bytes] of read.files) {
        if (path === DEFINITION || path === HELP) continue
        if (versioned && path.startsWith(DESCRIPTOR_DIRECTORY)) {
            const descriptor = readDescriptorFile(path, bytes, descriptorDiagnostics)
            if (descriptor) carried.push({ path, descriptor })
            continue
        }
        const stage = stageOf(path)
        if (!stage) {
            assets.set(path, bytes)
            continue
        }
        const [, program, key] = stage
        // A program name is a key of the shader map: one that reaches an
        // object prototype could write a stage into every object of the realm.
        if (RESERVED_KEYS.includes(program)) {
            diagnostics.push(diagnostic('reserved-name', path, `${path}: ${program} is a reserved name and cannot name a program`))
            continue
        }
        const text = decodeText(bytes)
        if (text === null) {
            diagnostics.push(diagnostic('invalid-encoding', path, `${path} must be UTF-8`))
            continue
        }
        if (text.trim().length === 0) {
            diagnostics.push(diagnostic('empty-stage', path, `${path} holds no shader source`))
            continue
        }
        const bucket = stagesOf(shaders, program) ?? (shaders[program] = {})
        bucket[key] = text
    }
    if (diagnostics.length > 0) return failed(diagnostics)

    const normalized = normalizePortableDefinition(declared)
    if (normalized.diagnostics.length > 0) return failed([...normalized.diagnostics, ...descriptorDiagnostics], normalized.profile)
    if (descriptorDiagnostics.length > 0) return failed(descriptorDiagnostics, normalized.profile)
    const passes = Array.isArray(normalized.definition.passes) ? normalized.definition.passes : null
    if (!passes || passes.length === 0) {
        return failed([diagnostic('missing-field', 'passes', 'a package declares its passes; each names the program it runs')], normalized.profile)
    }

    // The declarations, against the descriptors the caller gave and those the
    // package carries, which must agree where both describe one capability.
    // A declaration with no descriptor here passes the structural check only,
    // and the result says so. A legacy package declares none, and the
    // descriptors given are still read.
    const descriptorList = [...given, ...carried.map(entry => entry.descriptor)]
    const pathOf = index => (index < given.length ? `capabilityDescriptors.${index}` : carried[index - given.length].path)
    const checked = checkCapabilityDeclarations(normalized.profile === 'v2' ? normalized.definition : null, descriptorList, pathOf)
    if (checked.diagnostics.length > 0) return failed(checked.diagnostics, normalized.profile)

    for (const [program, stages] of Object.entries(shaders)) {
        if (stages.glsl && (stages.vertex || stages.fragment)) {
            diagnostics.push(diagnostic('duplicate-stage', `shaders/${program}`,
                `glsl/${program}.glsl is one fragment stage; it cannot stand beside glsl/${program}.vert or glsl/${program}.frag`))
        }
        if (stages.vertex && !stages.fragment) {
            diagnostics.push(diagnostic('missing-stage', `shaders/${program}`, `glsl/${program}.vert needs glsl/${program}.frag`))
        }
    }
    const programs = [...new Set(passes.map(pass => pass.program))]
    for (const program of programs) {
        if (!stagesOf(shaders, program)) {
            diagnostics.push(diagnostic('missing-shader', `shaders/${program}`,
                `no shader file for program ${program}: add glsl/${program}.glsl (or .vert and .frag) or wgsl/${program}.wgsl`))
        }
    }
    if (diagnostics.length > 0) return failed(diagnostics, normalized.profile)

    const languages = backend ? [BACKEND_LANGUAGE[backend]] : Object.keys(STAGE_FILES)
    const covering = languages.filter(language => programs.every(program => complete(language, stagesOf(shaders, program))))
    if (covering.length === 0) {
        for (const language of languages) {
            for (const program of programs.filter(name => !complete(language, stagesOf(shaders, name)))) {
                diagnostics.push(backend
                    ? diagnostic('missing-backend', `shaders/${program}`, `${backend} runs ${language}, and program ${program} has no complete ${language} source`)
                    : diagnostic('incomplete-language', `shaders/${program}`, `program ${program} has no complete ${language} source, so ${language} does not cover every program`))
            }
        }
        return failed(diagnostics, normalized.profile)
    }
    // A language that covers only some programs runs nowhere: name each gap,
    // as registerPortableEffect refuses such a package.
    for (const language of Object.keys(STAGE_FILES).filter(name => !covering.includes(name))) {
        const present = programs.filter(program => {
            const stages = stagesOf(shaders, program)
            return language === 'glsl' ? Boolean(stages?.glsl || stages?.vertex || stages?.fragment) : Boolean(stages?.wgsl)
        })
        if (present.length === 0) continue
        for (const program of programs.filter(name => !complete(language, stagesOf(shaders, name)))) {
            diagnostics.push(diagnostic('incomplete-language', `shaders/${program}`,
                `the package gives ${language} for some programs but not for ${program}; give it for every program or for none`))
        }
    }
    if (diagnostics.length > 0) return failed(diagnostics, normalized.profile)

    return {
        profile: normalized.profile, definition: declared, shaders, assets, help, files: read.files,
        capabilities: { complete: checked.complete, unresolved: checked.unresolved },
        capabilityDescriptors: checked.descriptors,
        diagnostics: [],
    }
}

// A descriptor file: JSON, a valid descriptor, and named by its own ID and version.
function readDescriptorFile(path, bytes, diagnostics) {
    const named = DESCRIPTOR_FILE.exec(path)
    if (!named) {
        diagnostics.push(diagnostic('invalid-descriptor', path, `${path}: a capability descriptor file is capabilities/<owner>/<name>/v<version>.json`))
        return null
    }
    const text = decodeText(bytes)
    let raw
    try {
        raw = text === null ? undefined : JSON.parse(text)
    } catch (error) {
        diagnostics.push(diagnostic('invalid-json', path, `${path} is not JSON: ${error.message}`))
        return null
    }
    if (raw === undefined) {
        diagnostics.push(diagnostic('invalid-encoding', path, `${path} must be UTF-8`))
        return null
    }
    const result = normalizeCapabilityDescriptor(raw)
    for (const entry of result.diagnostics) diagnostics.push({ ...entry, path: entry.path ? `${path}#${entry.path}` : path })
    if (!result.descriptor) return null
    const [, owner, name, version] = named
    if (result.descriptor.id !== `${owner}/${name}` || result.descriptor.version !== Number(version)) {
        diagnostics.push(diagnostic('invalid-descriptor', path,
            `${path} describes ${result.descriptor.id} version ${result.descriptor.version}; its file is capabilities/${result.descriptor.id}/v${result.descriptor.version}.json`))
        return null
    }
    return result.descriptor
}

/**
 * The files of a loaded package, in its normal paths, as copies of the bytes it
 * was loaded from.
 * @param {{files: Map<string, Uint8Array>}} loaded - A result of loadPortablePackage()
 * @returns {Map<string, Uint8Array>}
 */
export function packageFiles(loaded) {
    if (!(loaded?.files instanceof Map)) throw new TypeError('packageFiles takes a loaded package')
    return new Map([...loaded.files].map(([path, bytes]) => [path, new Uint8Array(bytes)]))
}

// ZIP reading (APPNOTE.TXT): the end of central directory record, the central
// directory, then each local header and its data.
const EOCD = 0x06054b50
const ZIP64_LOCATOR = 0x07064b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
const STORED = 0
const DEFLATED = 8
const S_IFMT = 0o170000
const S_IFLNK = 0o120000

let crcTable = null
function crc32(bytes) {
    if (!crcTable) {
        crcTable = new Uint32Array(256)
        for (let n = 0; n < 256; n++) {
            let c = n
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
            crcTable[n] = c >>> 0
        }
    }
    let crc = 0xffffffff
    for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
}

// Deflate's largest expansion: a run of one repeated byte inflates to at most
// 1032 bytes for each compressed byte (zlib's technical details). A declared
// size beyond that cannot come from the stored data.
const DEFLATE_MAX_RATIO = 1032

// Inflate raw deflate data, reading no more than `size` bytes of output. A
// damaged stream gives null, as a wrong size does. The output grows as the
// stream yields data, so a declared size alone allocates nothing.
async function inflate(data, size) {
    const chunks = []
    let length = 0
    try {
        const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
        for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            if (length + value.length > size) {
                await reader.cancel()
                return null
            }
            chunks.push(value)
            length += value.length
        }
    } catch {
        return null
    }
    if (length !== size) return null
    const out = new Uint8Array(size)
    let at = 0
    for (const chunk of chunks) {
        out.set(chunk, at)
        at += chunk.length
    }
    return out
}

/**
 * Read the files of a ZIP archive into a file map. Stored and deflated entries
 * are read; each entry's size and CRC-32 must match its record, and its local
 * header must name the same file with the same method. An encrypted, ZIP64,
 * multi-disk or link entry, another compression method, a damaged record or
 * stream, two entries that share archive bytes, a size larger than deflate can
 * produce from the entry's bytes, a name that is not UTF-8 or not a relative
 * path inside the package, and two names for one file are refused. So the
 * files read are at most 1032 times the size of the archive, deflate's largest
 * expansion. Directory entries carry no file and are skipped, as are an
 * archiver's .DS_Store and __MACOSX entries. Zero bytes after the end record,
 * which some archivers add as padding, are allowed.
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {Promise<{files: Map<string, Uint8Array>|null, diagnostics: Array}>}
 */
export async function fileMapFromZip(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : (bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null)
    const refuse = (code, path, message) => ({ files: null, diagnostics: [diagnostic(code, path, message)] })
    if (!data) return refuse('not-an-archive', '', 'a ZIP archive is bytes (a Uint8Array or an ArrayBuffer)')
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const u16 = offset => view.getUint16(offset, true)
    const u32 = offset => view.getUint32(offset, true)

    // The end record is the last record of the archive: after it and its
    // comment come only zero bytes, if anything.
    let end = data.length
    while (end > 0 && data[end - 1] === 0) end--
    let eocd = -1
    for (let offset = data.length - 22; offset >= 0 && offset >= end - 22 - 0xffff; offset--) {
        if (u32(offset) !== EOCD) continue
        const recordEnd = offset + 22 + u16(offset + 20)
        if (recordEnd <= data.length && recordEnd >= end) {
            eocd = offset
            break
        }
    }
    if (eocd < 0) return refuse('damaged-archive', '', 'the archive has no end of central directory record')
    if (eocd >= 20 && u32(eocd - 20) === ZIP64_LOCATOR) return refuse('unsupported-archive', '', 'ZIP64 archives are not read')
    const disk = u16(eocd + 4)
    const centralDisk = u16(eocd + 6)
    const diskEntries = u16(eocd + 8)
    const entries = u16(eocd + 10)
    const centralSize = u32(eocd + 12)
    const centralOffset = u32(eocd + 16)
    if (entries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
        return refuse('unsupported-archive', '', 'ZIP64 archives are not read')
    }
    if (disk !== 0 || centralDisk !== 0 || diskEntries !== entries) {
        return refuse('unsupported-archive', '', 'multi-disk archives are not read')
    }
    if (centralOffset + centralSize > eocd) return refuse('damaged-archive', '', 'the central directory lies outside the archive')

    // First every record is read and checked, then the data, so that no data
    // is inflated from an archive that a later record refuses.
    const names = new TextDecoder('utf-8', { fatal: true })
    const records = []
    let offset = centralOffset
    for (let index = 0; index < entries; index++) {
        if (offset + 46 > eocd || u32(offset) !== CENTRAL) return refuse('damaged-archive', '', `central directory entry ${index} is damaged`)
        const madeBy = u16(offset + 4) >> 8
        const flags = u16(offset + 8)
        const method = u16(offset + 10)
        const crc = u32(offset + 16)
        const compressedSize = u32(offset + 20)
        const size = u32(offset + 24)
        const nameLength = u16(offset + 28)
        const extraLength = u16(offset + 30)
        const commentLength = u16(offset + 32)
        const external = u32(offset + 38)
        const localOffset = u32(offset + 42)
        const centralName = data.subarray(offset + 46, offset + 46 + nameLength)
        let name
        try {
            name = names.decode(centralName)
        } catch {
            return refuse('invalid-path', `entry ${index}`, `the name of entry ${index} is not UTF-8`)
        }
        offset += 46 + nameLength + extraLength + commentLength
        if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
            return refuse('unsupported-archive', name, 'ZIP64 archives are not read')
        }
        if (flags & 0x1) return refuse('encrypted-entry', name, `${name} is encrypted`)
        if (madeBy === 3 && (external >>> 16 & S_IFMT) === S_IFLNK) return refuse('link-entry', name, `${name} is a link, not a file`)
        if (name.endsWith('/')) continue
        if (method !== STORED && method !== DEFLATED) return refuse('unsupported-compression', name, `${name} uses compression method ${method}; only stored and deflated entries are read`)
        if (localOffset + 30 > centralOffset || u32(localOffset) !== LOCAL) return refuse('damaged-archive', name, `the local header of ${name} is damaged`)
        // The local header must name the same file with the same method, so
        // that a streaming reader of the archive sees the files this one does.
        const localNameLength = u16(localOffset + 26)
        const localName = data.subarray(localOffset + 30, localOffset + 30 + localNameLength)
        if (u16(localOffset + 8) !== method || localName.length !== centralName.length || localName.some((byte, at) => byte !== centralName[at])) {
            return refuse('damaged-archive', name, `the local header of ${name} names another file or method than its central record`)
        }
        const start = localOffset + 30 + localNameLength + u16(localOffset + 28)
        if (start + compressedSize > centralOffset) return refuse('damaged-archive', name, `the data of ${name} lies outside the archive`)
        if (method === DEFLATED && size > compressedSize * DEFLATE_MAX_RATIO) {
            return refuse('damaged-archive', name, `${name} declares more data than its compressed bytes can hold`)
        }
        records.push({ name, method, crc, compressedSize, size, localOffset, start })
    }
    // No two entries share bytes: shared data would let a small archive give
    // many large files. Sorted by offset, each entry must end before the next begins.
    const byOffset = [...records].sort((a, b) => a.localOffset - b.localOffset)
    for (let index = 1; index < byOffset.length; index++) {
        const previous = byOffset[index - 1]
        if (byOffset[index].localOffset < previous.start + previous.compressedSize) {
            return refuse('damaged-archive', byOffset[index].name, `${byOffset[index].name} shares archive bytes with ${previous.name}`)
        }
    }

    const files = new Map()
    for (const { name, method, crc, compressedSize, size, start } of records) {
        const raw = data.subarray(start, start + compressedSize)
        const content = method === STORED ? (compressedSize === size ? new Uint8Array(raw) : null) : await inflate(raw, size)
        if (!content || crc32(content) !== crc) return refuse('damaged-archive', name, `${name} does not match its recorded size and CRC-32`)
        if (files.has(name)) return refuse('duplicate-path', name, `the archive holds ${name} twice`)
        files.set(name, content)
    }
    // These bytes were just read from the archive, so nothing else holds them.
    return readFileMap(files, { copy: false })
}
