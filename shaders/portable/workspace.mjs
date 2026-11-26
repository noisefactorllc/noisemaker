// Relocated from Portable (https://github.com/noisefactorllc/portable,
// workspace.mjs at 6f211e44a0f2eb4baff1b9ae68893fa3b3554085), MIT License,
// Copyright (c) 2026 Noise Factor.
// Versioned workspace envelope. Shader compilation/rendering is a separate gate:
// a valid envelope is not evidence that its composition or shaders can render.
const FORMAT = 'noisefactor-workspace';
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function require(condition, message) {
    if (!condition) throw new TypeError(message);
}

function record(value, label) {
    require(value !== null && typeof value === 'object' && !Array.isArray(value)
        && [Object.prototype, null].includes(Object.getPrototypeOf(value)), `${label} must be an object`);
}

function shape(value, fields, label) {
    record(value, label);
    require(Object.keys(value).every(key => fields.includes(key)), `${label} has an unsupported field`);
    require(fields.every(key => Object.hasOwn(value, key)), `${label} is missing a required field`);
}

function validId(value, label) {
    require(typeof value === 'string' && ID.test(value), `${label} must be a stable identifier`);
}

function fileMap(files, label) {
    record(files, label);
    for (const [path, file] of Object.entries(files)) {
        require(path.length > 0 && !/[\\:\u0000-\u001f\u007f]/.test(path)
            && path.split('/').every(part => part && !['.', '..', '__proto__', 'prototype', 'constructor'].includes(part)),
        `${label} has an unsafe path`);
        shape(file, ['encoding', 'data'], `${label}/${path}`);
        // Binary files, images included, stay bytes: never base64 or other text.
        require(file.encoding === 'utf8' || file.encoding === 'binary', `${label}/${path} encoding must be utf8 or binary`);
        require(file.encoding === 'utf8' ? typeof file.data === 'string' : file.data instanceof Uint8Array,
            `${label}/${path} data must be ${file.encoding === 'utf8' ? 'a string' : 'a Uint8Array'}`);
    }
}

function functionName(files) {
    const file = Object.hasOwn(files, 'definition.json') ? files['definition.json'] : undefined;
    require(file?.encoding === 'utf8', 'definition.json must be a UTF-8 file');
    let definition;
    try { definition = JSON.parse(file.data); } catch { throw new TypeError('definition.json must contain valid JSON'); }
    record(definition, 'definition.json');
    const func = definition.func ?? definition.name;
    require(typeof func === 'string' && IDENTIFIER.test(func), 'definition.json needs a valid function identity');
    require(definition.namespace === undefined || definition.namespace === 'user', 'portable effects register in the user namespace');
    require(Object.entries(files).some(([path, file]) =>
        /^(glsl\/.+\.glsl|wgsl\/.+\.wgsl)$/.test(path) && file.encoding === 'utf8' && file.data.trim()),
    'effect needs at least one nonempty UTF-8 shader file');
    return func;
}

function validate(workspace) {
    shape(workspace, ['format', 'version', 'id', 'revision', 'effects', 'assets', 'composition'], 'workspace');
    require(workspace.format === FORMAT && workspace.version === 1, 'unsupported workspace format or version');
    validId(workspace.id, 'workspace.id');
    require(Number.isSafeInteger(workspace.revision) && workspace.revision >= 0, 'workspace.revision must be a nonnegative safe integer');
    require(Array.isArray(workspace.effects), 'workspace.effects must be an array');
    const ids = new Set();
    const functions = new Set();
    for (const effect of workspace.effects) {
        shape(effect, ['id', 'files'], 'effect');
        validId(effect.id, 'effect.id');
        require(!ids.has(effect.id), 'duplicate effect.id');
        ids.add(effect.id);
        fileMap(effect.files, `effect ${effect.id}`);
        const func = functionName(effect.files);
        require(!functions.has(func), 'duplicate effect function identity');
        functions.add(func);
    }
    fileMap(workspace.assets, 'assets');
    shape(workspace.composition, ['dsl', 'effectIds'], 'composition');
    require(typeof workspace.composition.dsl === 'string' && workspace.composition.dsl.trim(), 'composition.dsl must be nonempty');
    const dependencies = workspace.composition.effectIds;
    require(Array.isArray(dependencies) && dependencies.every(id => ids.has(id))
        && new Set(dependencies).size === dependencies.length, 'composition.effectIds must reference unique existing effects');
    return workspace;
}

export function parseWorkspace(json) {
    require(typeof json === 'string', 'workspace input must be JSON text');
    return validate(JSON.parse(json));
}

function* files(workspace) {
    for (const effect of workspace.effects) {
        for (const [path, file] of Object.entries(effect.files)) yield [`effects/${effect.id}/${path}`, file];
    }
    for (const [path, file] of Object.entries(workspace.assets)) yield [`assets/${path}`, file];
}

// JSON text carries UTF-8 files only. A workspace with binary files is saved
// and shared with packWorkspace.
export function serializeWorkspace(workspace) {
    validate(workspace);
    for (const [entry, file] of files(workspace)) {
        require(file.encoding === 'utf8', `${entry} is binary: save this workspace with packWorkspace`);
    }
    return JSON.stringify(workspace, null, 2) + '\n';
}

// The packed workspace is a ZIP archive of stored entries: workspace.json, the
// envelope with each file's encoding but not its data, then every file at
// effects/<effect id>/<path> or assets/<path> as raw bytes.
const MANIFEST = 'workspace.json';
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

function crc32(bytes) {
    let c = 0xffffffff;
    for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function utf8(text) {
    return new TextEncoder().encode(text);
}

export function packWorkspace(workspace) {
    validate(workspace);
    const manifest = structuredClone(workspace);
    for (const effect of manifest.effects) {
        for (const file of Object.values(effect.files)) delete file.data;
    }
    for (const file of Object.values(manifest.assets)) delete file.data;
    const entries = [[MANIFEST, utf8(JSON.stringify(manifest, null, 2) + '\n')]];
    for (const [entry, file] of files(workspace)) {
        entries.push([entry, file.encoding === 'utf8' ? utf8(file.data) : file.data]);
    }

    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const [entry, data] of entries) {
        const name = utf8(entry);
        const crc = crc32(data);
        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true); // UTF-8 names
        local.setUint16(12, 0x21, true); // 1980-01-01, so equal input packs to equal bytes
        local.setUint32(14, crc, true);
        local.setUint32(18, data.length, true);
        local.setUint32(22, data.length, true);
        local.setUint16(26, name.length, true);
        locals.push(new Uint8Array(local.buffer), name, data);
        const central = new DataView(new ArrayBuffer(46));
        central.setUint32(0, 0x02014b50, true);
        central.setUint16(4, 20, true);
        central.setUint16(6, 20, true);
        central.setUint16(8, 0x0800, true);
        central.setUint16(14, 0x21, true);
        central.setUint32(16, crc, true);
        central.setUint32(20, data.length, true);
        central.setUint32(24, data.length, true);
        central.setUint16(28, name.length, true);
        central.setUint32(42, offset, true);
        centrals.push(new Uint8Array(central.buffer), name);
        offset += 30 + name.length + data.length;
    }
    const directorySize = centrals.reduce((size, part) => size + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, directorySize, true);
    end.setUint32(16, offset, true);

    const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
    const packed = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
    let at = 0;
    for (const part of parts) { packed.set(part, at); at += part.length; }
    return packed;
}

export function unpackWorkspace(packed) {
    const bytes = packed instanceof Uint8Array ? packed : new Uint8Array(packed);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const endAt = bytes.length - 22;
    require(endAt >= 0 && view.getUint32(endAt, true) === 0x06054b50, 'packed workspace must be a ZIP archive without a comment');
    const count = view.getUint16(endAt + 10, true);
    let at = view.getUint32(endAt + 16, true);
    const entries = new Map();
    for (let n = 0; n < count; n++) {
        require(view.getUint32(at, true) === 0x02014b50, 'packed workspace has a damaged directory');
        require(view.getUint16(at + 10, true) === 0, 'packed workspace entries must be stored, not compressed');
        const crc = view.getUint32(at + 16, true);
        const size = view.getUint32(at + 20, true);
        const nameLength = view.getUint16(at + 28, true);
        const local = view.getUint32(at + 42, true);
        const entry = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(at + 46, at + 46 + nameLength));
        at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
        require(view.getUint32(local, true) === 0x04034b50, `packed workspace entry ${entry} is damaged`);
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const data = bytes.slice(start, start + size);
        require(data.length === size && crc32(data) === crc, `packed workspace entry ${entry} fails its checksum`);
        require(!entries.has(entry), `packed workspace repeats ${entry}`);
        entries.set(entry, data);
    }
    require(entries.has(MANIFEST), `packed workspace has no ${MANIFEST}`);
    const workspace = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(entries.get(MANIFEST)));
    entries.delete(MANIFEST);
    shape(workspace, ['format', 'version', 'id', 'revision', 'effects', 'assets', 'composition'], 'workspace');
    require(Array.isArray(workspace.effects), 'workspace.effects must be an array');
    const fill = (fileMapValue, prefix, label) => {
        record(fileMapValue, label);
        for (const [path, file] of Object.entries(fileMapValue)) {
            shape(file, ['encoding'], `${label}/${path}`);
            const entry = `${prefix}${path}`;
            require(entries.has(entry), `packed workspace is missing ${entry}`);
            const data = entries.get(entry);
            entries.delete(entry);
            file.data = file.encoding === 'utf8' ? new TextDecoder('utf-8', { fatal: true }).decode(data) : data;
        }
    };
    for (const effect of workspace.effects) {
        record(effect, 'effect');
        validId(effect.id, 'effect.id');
        fill(effect.files, `effects/${effect.id}/`, `effect ${effect.id}`);
    }
    fill(workspace.assets, 'assets/', 'assets');
    require(entries.size === 0, `packed workspace has unlisted entries: ${[...entries.keys()].join(', ')}`);
    return validate(workspace);
}

export function importSingleEffect(files, { workspaceId, effectId, dsl } = {}) {
    record(files, 'legacy files');
    const encoded = Object.fromEntries(Object.entries(files).map(([path, data]) => {
        require(typeof data === 'string', 'legacy files must contain UTF-8 strings');
        return [path, { encoding: 'utf8', data }];
    }));
    fileMap(encoded, 'legacy files');
    functionName(encoded);
    const definition = JSON.parse(encoded['definition.json'].data);
    return validate({
        format: FORMAT, version: 1, id: workspaceId, revision: 0,
        effects: [{ id: effectId, files: encoded }], assets: {},
        composition: { dsl: dsl ?? definition.defaultProgram, effectIds: [effectId] },
    });
}

function findEffect(workspace, id) {
    const effect = workspace.effects.find(effect => effect.id === id);
    require(effect, `unknown effect: ${id}`);
    return effect;
}

export function exportEffect(workspace, effectId) {
    validate(workspace);
    return structuredClone(findEffect(workspace, effectId).files);
}

// Produces a detached candidate. Consumers compile/render it before committing
// it to history, then compare the current revision again after asynchronous work.
export function replaceEffect(workspace, effectId, files, { expectedRevision } = {}) {
    validate(workspace);
    require(workspace.revision === expectedRevision, 'workspace revision conflict');
    const effect = findEffect(workspace, effectId);
    fileMap(files, `effect ${effectId}`);
    require(functionName(effect.files) === functionName(files), 'replacement changes function identity');
    const candidate = structuredClone(workspace);
    findEffect(candidate, effectId).files = structuredClone(files);
    candidate.revision += 1;
    return validate(candidate);
}
