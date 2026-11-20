import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

export async function agreementFingerprint(root) {
    const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
    const hash = createHash('sha256').update(git(['rev-parse', 'HEAD']))
    const inputs = ['shaders/src', 'shaders/effects', 'demo/shaders/lib', 'demo/shaders/img', 'share/meshes', 'share/palettes.json',
        'vendor/shade-mcp/harness', 'package.json', 'package-lock.json',
        'scripts/cross-backend-agreement.mjs', 'scripts/lib/agreement-browser.mjs', 'scripts/lib/agreement-source.mjs',
        'scripts/lib/shader-test-browser.mjs', 'scripts/lib/shader-parity-attestation.mjs', 'shaders/tests/agreement-cases.mjs', 'shaders/tests/blank.html']
    const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...inputs]).split('\0').filter(Boolean)
    for (const file of [...new Set(files)].sort()) {
        hash.update(file + '\0').update(await fs.readFile(path.join(root, file))).update('\0')
    }
    return hash.digest('hex')
}
