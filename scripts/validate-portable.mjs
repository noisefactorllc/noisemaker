#!/usr/bin/env node
/**
 * Check a Portable effect package, as a directory or a ZIP archive.
 *
 *   node scripts/validate-portable.mjs [package] [--backend webgl2|webgpu]
 *
 * With no package it checks the starter example,
 * shaders/portable/examples/gradient-sweep/. The checks are the engine's own:
 * loadPortablePackage() (docs/shaders/effects.rst Section 8), and the one
 * refusal that registration adds to it, a declared paramAliases. The script
 * reads no effect catalog and runs no code from the package.
 *
 * It prints each problem on stderr as a FAIL line, and exits 0 when there is
 * none and 1 otherwise. It replaces Portable's validator, test-definition.mjs
 * (https://github.com/noisefactorllc/portable at 6f211e44), whose stricter
 * rules the engine does not apply.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fileMapFromZip, loadPortablePackage } from '../shaders/src/portable/package.js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_PACKAGE = path.join(REPO_ROOT, 'shaders/portable/examples/gradient-sweep')

/** A package directory's files, by their path from its root, as bytes. */
export function readPackageDirectory(dir) {
    const files = new Map()
    const walk = (folder, prefix) => {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
            const relative = prefix + entry.name
            const full = path.join(folder, entry.name)
            if (entry.isDirectory()) walk(full, `${relative}/`)
            else if (entry.isFile()) files.set(relative, new Uint8Array(fs.readFileSync(full)))
        }
    }
    walk(dir, '')
    return files
}

/**
 * The problems of the package at `location`, as { code, path, message }.
 * An empty list means that the engine loads and registers it.
 */
export async function validatePortable(location, { backend } = {}) {
    let stat
    try {
        stat = fs.statSync(location)
    } catch {
        return [{ code: 'missing-package', path: '', message: `no package at ${location}` }]
    }
    let files
    if (stat.isDirectory()) {
        files = readPackageDirectory(location)
    } else {
        const read = await fileMapFromZip(new Uint8Array(fs.readFileSync(location)))
        if (!read.files) return read.diagnostics
        files = read.files
    }
    const loaded = loadPortablePackage(files, backend === undefined ? {} : { backend })
    const problems = [...loaded.diagnostics]
    // Registration refuses a declared paramAliases in every profile, even an
    // empty or null one (CanvasRenderer.registerPortableEffect). A version 2
    // package already has the loader's diagnostic for it.
    const definition = loaded.definition ?? readDeclared(files)
    if (definition && Object.hasOwn(definition, 'paramAliases') && !problems.some(problem => problem.path === 'paramAliases')) {
        problems.push({ code: 'unsupported-field', path: 'paramAliases', message: 'paramAliases is retired: use the canonical parameter names in the program' })
    }
    return problems
}

function readDeclared(files) {
    try {
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(files.get('definition.json')))
    } catch {
        return null
    }
}

async function main(argv) {
    let location = DEFAULT_PACKAGE
    let backend
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index]
        if (arg === '--backend') backend = argv[++index]
        else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`)
        else location = path.resolve(arg)
    }
    console.log(`Checking ${location}...`)
    const problems = await validatePortable(location, { backend })
    for (const problem of problems) {
        console.error(`  FAIL: ${problem.message} (${problem.code}${problem.path ? ` at ${problem.path}` : ''})`)
    }
    console.log('')
    if (problems.length) {
        console.error(`FAILED: ${problems.length} error(s)`)
        return 1
    }
    console.log('All definition checks passed')
    return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).then(code => process.exit(code), error => {
        console.error('Error:', error.message)
        process.exit(1)
    })
}
