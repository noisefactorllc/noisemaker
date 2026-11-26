/**
 * Packaging Test
 *
 * Relocated from Portable (https://github.com/noisefactorllc/portable,
 * test-package.mjs at 6f211e44a0f2eb4baff1b9ae68893fa3b3554085), MIT License,
 * Copyright (c) 2026 Noise Factor.
 *
 * Runs the packager (scripts/package-portable.mjs) and verifies the produced
 * ZIP: every effect file is present, macOS junk files (.DS_Store, __MACOSX)
 * are excluded, the engine's own ZIP reader reads back every file byte for
 * byte, and a missing effect directory fails cleanly without leaving output
 * behind. Portable's block that compared its shell packager with its Node
 * packager went with the shell packager: one packager remains.
 */

import { spawnSync } from 'child_process';
import { mkdtemp, mkdir, rm, chmod, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fileMapFromZip } from '../src/portable/package.js';

// The repository root: the packager's default output is effect.zip in the
// directory it runs in, and this test runs it there.
const __dirname = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let errors = [];

function assert(condition, message) {
    if (!condition) {
        errors.push(message);
        console.error('  FAIL:', message);
    } else {
        console.log('  OK:', message);
    }
}

// Read entry names from the ZIP central directory (no zip64: the small
// packages this script produces stay in classic ZIP format).
function zipEntryNames(buffer) {
    const EOCD_SIGNATURE = 0x06054b50;
    const CEN_SIGNATURE = 0x02014b50;
    let eocd = -1;
    for (let i = buffer.length - 22; i >= 0; i--) {
        if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not a zip archive (no end-of-central-directory record)');
    const count = buffer.readUInt16LE(eocd + 10);
    let offset = buffer.readUInt32LE(eocd + 16);
    const names = [];
    for (let n = 0; n < count; n++) {
        if (buffer.readUInt32LE(offset) !== CEN_SIGNATURE) {
            throw new Error('corrupt zip central directory');
        }
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        names.push(buffer.toString('utf8', offset + 46, offset + 46 + nameLength));
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return names;
}

function runPackager(args) {
    return spawnSync(process.execPath, ['scripts/package-portable.mjs', ...args], {
        cwd: __dirname,
        encoding: 'utf8',
    });
}

async function writeTempEffect(root) {
    await mkdir(join(root, 'glsl'), { recursive: true });
    await writeFile(join(root, 'definition.json'), JSON.stringify({ name: 'Test', func: 'test' }));
    await writeFile(join(root, 'glsl/main.glsl'), 'void main() {}');
    // Junk that package-portable.sh excludes and the Node path must match.
    await writeFile(join(root, '.DS_Store'), 'junk');
    await mkdir(join(root, 'deep'), { recursive: true });
    await writeFile(join(root, 'deep/.DS_Store'), 'junk');
    await mkdir(join(root, '__MACOSX'), { recursive: true });
    await writeFile(join(root, '__MACOSX/junk'), 'junk');
}

console.log('Testing package-portable.mjs...');

// 1. Default invocation: packages the starter example into ./effect.zip. A previously
//    packaged effect.zip is preserved and put back, so running the suite
//    never destroys an existing artifact.
{
    const zipPath = join(__dirname, 'effect.zip');
    let prior = null;
    try { prior = await readFile(zipPath); } catch { prior = null; }
    const result = runPackager([]);
    assert(result.status === 0, `default packaging exits 0 (got ${result.status}: ${result.stderr?.trim()})`);
    let names = [];
    try {
        names = zipEntryNames(await readFile(zipPath));
    } catch (err) {
        assert(false, `default package readable: ${err.message}`);
    } finally {
        if (prior === null) {
            await rm(zipPath, { force: true });
        } else {
            await writeFile(zipPath, prior);
        }
    }
    for (const expected of ['definition.json', 'help.md',
        'glsl/gradientSweep.glsl', 'wgsl/gradientSweep.wgsl']) {
        assert(names.includes(expected), `default package contains ${expected}`);
    }
    assert(!names.some(name => /(^|\/)[^/]*\.DS_Store$|(^|\/)__MACOSX(\/|$)/.test(name)),
        'default package contains no macOS junk entries');
}

// 2. Explicit effect dir and output: junk is excluded, real files survive,
//    and the repo working tree is untouched.
{
    const root = await mkdtemp(join(tmpdir(), 'portable-package-'));
    try {
        const effectDir = join(root, 'effect');
        const zipPath = join(root, 'out.zip');
        await writeTempEffect(effectDir);
        const result = runPackager([effectDir, zipPath]);
        assert(result.status === 0, `custom-path packaging exits 0 (got ${result.status}: ${result.stderr?.trim()})`);
        const names = zipEntryNames(await readFile(zipPath));
        assert(names.includes('definition.json'), 'custom package contains definition.json');
        assert(names.includes('glsl/main.glsl'), 'custom package contains glsl/main.glsl');
        assert(!names.some(name => name.includes('.DS_Store') || name.includes('__MACOSX')),
            'custom package excludes .DS_Store and __MACOSX');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

// 3. A missing effect directory fails with exit code 1, reports the problem,
//    and leaves no partial output behind.
{
    const root = await mkdtemp(join(tmpdir(), 'portable-package-'));
    try {
        const zipPath = join(root, 'out.zip');
        const result = runPackager([join(root, 'missing'), zipPath]);
        assert(result.status === 1, `missing effect dir exits 1 (got ${result.status})`);
        assert(/Effect directory not found/.test(result.stderr || ''),
            'missing effect dir reports "Effect directory not found"');
        let exists = true;
        try { await readFile(zipPath); } catch { exists = false; }
        assert(!exists, 'no partial output is left behind after a failed run');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

// 4. A pre-write failure must not delete a destination that already exists:
//    packaging onto a previous artifact preserves it when the effect
//    directory is missing.
{
    const root = await mkdtemp(join(tmpdir(), 'portable-package-'));
    try {
        const zipPath = join(root, 'out.zip');
        await writeFile(zipPath, 'prior artifact bytes');
        const result = runPackager([join(root, 'missing'), zipPath]);
        assert(result.status === 1, `pre-write failure exits 1 (got ${result.status})`);
        let priorContent = null;
        try { priorContent = await readFile(zipPath, 'utf8'); } catch { priorContent = null; }
        assert(priorContent === 'prior artifact bytes',
            `pre-write failure preserves the existing output file (got ${priorContent === null ? 'deleted file' : JSON.stringify(priorContent)})`);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

// 5. An asynchronous output-open failure must preserve an existing
//    destination: createWriteStream() opens lazily, so the failure arrives
//    after construction. A pre-existing output file the process cannot open
//    (mode 000) reproduces that window and distinguishes 'open'-event
//    tracking from eager flagging.
{
    const root = await mkdtemp(join(tmpdir(), 'portable-package-'));
    try {
        const effectDir = join(root, 'effect');
        await mkdir(join(effectDir, 'glsl'), { recursive: true });
        await writeFile(join(effectDir, 'definition.json'), JSON.stringify({ name: 'T', func: 't' }));
        await writeFile(join(effectDir, 'glsl/main.glsl'), 'void main() {}');
        const zipPath = join(root, 'out.zip');
        await writeFile(zipPath, 'prior artifact bytes');
        await chmod(zipPath, 0o000);
        const result = runPackager([effectDir, zipPath]);
        assert(result.status === 1, `open failure exits 1 (got ${result.status})`);
        // Windows reports a read-only destination as EPERM, not EACCES.
        const openError = process.platform === 'win32' ? /EACCES|EPERM|permission denied/i : /EACCES|permission denied/i;
        assert(openError.test(result.stderr || ''),
            'open failure reports the stream open error');
        let priorContent = null;
        try {
            await chmod(zipPath, 0o644);
            priorContent = await readFile(zipPath, 'utf8');
        } catch { priorContent = null; }
        assert(priorContent === 'prior artifact bytes',
            `asynchronous open failure preserves the existing destination (got ${priorContent === null ? 'deleted file' : JSON.stringify(priorContent)})`);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

// 6. The archive reads back through the engine's own ZIP reader
//    (shaders/src/portable/package.js), with every file of the package byte
//    for byte, and with nothing else.
{
    const root = await mkdtemp(join(tmpdir(), 'portable-package-'));
    try {
        const effectDir = join(root, 'effect');
        const zipPath = join(root, 'out.zip');
        await writeTempEffect(effectDir);
        await mkdir(join(effectDir, 'assets'), { recursive: true });
        const binary = new Uint8Array(Array.from({ length: 4096 }, (_, n) => (n * 37) & 0xff));
        await writeFile(join(effectDir, 'assets/lut.bin'), binary);
        await writeFile(join(effectDir, 'help.md'), 'A note in UTF-8 text: café.\n');
        const result = runPackager([effectDir, zipPath]);
        assert(result.status === 0, `round-trip packaging exits 0 (got ${result.status}: ${result.stderr?.trim()})`);
        const read = await fileMapFromZip(new Uint8Array(await readFile(zipPath)));
        assert(read.files !== null, `the engine reads the archive (${JSON.stringify(read.diagnostics)})`);
        const expected = new Map([
            ['definition.json', await readFile(join(effectDir, 'definition.json'))],
            ['glsl/main.glsl', await readFile(join(effectDir, 'glsl/main.glsl'))],
            ['assets/lut.bin', await readFile(join(effectDir, 'assets/lut.bin'))],
            ['help.md', await readFile(join(effectDir, 'help.md'))],
        ]);
        const names = [...(read.files?.keys() || [])].sort();
        assert(JSON.stringify(names) === JSON.stringify([...expected.keys()].sort()),
            `the archive holds exactly the package's files (got ${JSON.stringify(names)})`);
        for (const [name, bytes] of expected) {
            const got = read.files?.get(name);
            assert(got && Buffer.from(got).equals(bytes), `${name} reads back byte for byte`);
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

console.log('');
if (errors.length > 0) {
    console.error(`FAILED: ${errors.length} error(s)`);
    process.exit(1);
}
console.log('All packaging checks passed');
