import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const workflow = name => readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8')
const pushBlock = text => text.match(/\n {2}push:\n([\s\S]*?)(?=\n {2}[a-z_]+:|\npermissions:|\njobs:)/)?.[1] ?? ''
const jobBlock = (text, name) => text.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z_-]+:|$)`))?.[1] ?? ''

test('scene-graph receives the test workflows', () => {
  for (const name of ['js', 'python', 'shaders']) {
    assert.match(pushBlock(workflow(name)), /branches:\s*\[[^\]]*\bscene-graph\b[^\]]*\]/, `${name} must test scene-graph pushes`)
  }
  assert.match(jobBlock(workflow('shaders'), 'gpu'), /github\.ref == 'refs\/heads\/scene-graph'/)
})

test('the GPU job checks the pixel pins on every push it runs for', () => {
  const step = jobBlock(workflow('shaders'), 'gpu').match(/\n {4}- name: Verify pixel pins on both GPU backends\n([\s\S]*?)(?=\n {4}- name:|$)/)?.[1] ?? ''
  assert.match(step, /run: npm run test:shaders:pins/)
  assert.doesNotMatch(step, /\bif:/, 'the pins step must not be limited to one branch')
})

test('the GPU job runs the scene suite on every push it runs for', () => {
  const step = jobBlock(workflow('shaders'), 'gpu').match(/\n {4}- name: Verify scenes on both GPU backends\n([\s\S]*?)(?=\n {4}- name:|$)/)?.[1] ?? ''
  assert.match(step, /run: npm run test:shaders:visual/)
  assert.doesNotMatch(step, /\bif:/, 'the scene step must not be limited to one branch')
})

test('scene-graph pushes cannot run publication jobs', () => {
  for (const [name, jobs] of [['js', ['build-bundles', 'build-standalone-linux', 'build-standalone-macos', 'build-standalone-windows']], ['shaders', ['bundle', 'deploy-site', 'deploy-shaders']]]) {
    for (const job of jobs) assert.match(jobBlock(workflow(name), job), /github\.ref == 'refs\/heads\/main'/, `${name}/${job} must remain restricted to main`)
  }
  for (const name of ['docker', 'docs-site', 'downstream', 'export-kits', 'site']) {
    const push = pushBlock(workflow(name))
    assert.match(push, /branches:\s*\[\s*main\s*\]/, `${name} must remain restricted to main`)
  }
  assert.match(jobBlock(workflow('release'), 'verify-source'), /git merge-base --is-ancestor .*origin\/main/)
  for (const job of ['build-js-bundles', 'build-standalone-linux', 'build-standalone-macos', 'build-standalone-windows', 'build-shader-bundle']) {
    assert.match(jobBlock(workflow('release'), job), /needs:.*verify-source/, `release/${job} must require source verification`)
  }
  assert.match(pushBlock(workflow('release')), /tags:/)
  assert.doesNotMatch(pushBlock(workflow('release')), /branches:/)
  assert.match(jobBlock(workflow('dependabot-auto-merge'), 'auto-merge'), /workflow_run\.event == 'pull_request'/)
})

// The downstream notice goes out only for a 1.x tree: a 2.x tree pushed to main by mistake queues no port work.
const notifySteps = () => [...jobBlock(workflow('downstream'), 'notify').matchAll(/\n {6}- name: ([^\n]+)\n([\s\S]*?)(?=\n {6}- name:|\n {6}#|$)/g)]
  .map(([, name, body]) => ({ name, body }))
const guardStep = () => notifySteps().find(step => step.name === 'Require a 1.x tree')
const guardScript = () => {
  const lines = guardStep().body.split('\n'), start = lines.findIndex(line => /^ {8}run: \|$/.test(line))
  return lines.slice(start + 1).filter(line => line.startsWith('          ') || line === '').map(line => line.slice(10)).join('\n')
}

// The guard reads the version with python3 and tomllib, which Python 3.11 added. CI's python3 has it; a developer's
// python3 can be older (macOS ships 3.9). The guard runs here with the first interpreter on PATH that has tomllib,
// under the name python3, so the script under test is the workflow's own.
const PYTHONS = ['python3', ...Array.from({ length: 10 }, (_, i) => `python3.${20 - i}`)]
const pythonWithTomllib = (env = process.env) => {
  for (const name of PYTHONS) {
    const found = spawnSync('bash', ['-c', `command -v ${name}`], { encoding: 'utf8', env, timeout: 10000 }).stdout?.trim() ?? ''
    if (found.startsWith('/') && spawnSync(found, ['-c', 'import tomllib'], { env, timeout: 10000 }).status === 0) return found
  }
  return null
}

test('the guard\'s interpreter is the first on PATH that imports tomllib', t => {
  const dir = mkdtempSync(join(tmpdir(), 'downstream-python-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  // Each name the search tries is a stand-in here, so the host's own interpreters are never reached. A stand-in answers
  // only the probe, `-c import tomllib`, with its status, and any other call with 3.
  const shim = (name, status) => {
    writeFileSync(join(dir, name), `#!/bin/sh\n[ "$1" = "-c" ] && [ "$2" = "import tomllib" ] && exit ${status}\nexit 3\n`)
    chmodSync(join(dir, name), 0o755)
  }
  const env = { PATH: `${dir}:/bin` }
  for (const name of PYTHONS) shim(name, 1)
  assert.equal(pythonWithTomllib(env), null, 'none has tomllib')
  shim('python3.12', 127)
  shim('python3.11', 0)
  assert.equal(pythonWithTomllib(env), join(dir, 'python3.11'), 'a broken interpreter is passed over')
  shim('python3.12', 0)
  assert.equal(pythonWithTomllib(env), join(dir, 'python3.12'), 'the newest that has it, after python3')
  shim('python3', 0)
  assert.equal(pythonWithTomllib(env), join(dir, 'python3'), 'python3 first, when it has it')
})

test('the downstream guard reads the pushed version and refuses any major other than 1', t => {
  const dir = mkdtempSync(join(tmpdir(), 'downstream-guard-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const python = pythonWithTomllib()
  assert.ok(python, `the guard needs Python 3.11 or later, which has tomllib; none of ${PYTHONS.join(', ')} on PATH has it`)
  writeFileSync(join(dir, 'python3'), `#!/bin/sh\nexec '${python.replaceAll("'", "'\\''")}' "$@"\n`)
  chmodSync(join(dir, 'python3'), 0o755)
  // A stand-in for curl: it serves the fixture only for pyproject.toml at the pushed commit, and fails as an unreachable file does.
  const sha = 'a'.repeat(40)
  writeFileSync(join(dir, 'curl'), `#!/bin/sh\nfor last; do :; done\n[ "$last" = "https://raw.githubusercontent.com/owner/repository/${sha}/pyproject.toml" ] || exit 22\n[ -f "$FIXTURE" ] || exit 22\ncat "$FIXTURE"\n`)
  chmodSync(join(dir, 'curl'), 0o755)
  const run = metadata => {
    const fixture = join(dir, 'pyproject.toml')
    rmSync(fixture, { force: true })
    if (metadata !== null) writeFileSync(fixture, metadata)
    return spawnSync('bash', ['-c', guardScript()], { encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FIXTURE: fixture, GITHUB_REPOSITORY: 'owner/repository', GITHUB_SHA: sha } })
  }
  const project = version => `[project]\nname = "noisemaker"\nversion = "${version}"\n\n[tool.mypy]\npython_version = "3.11"\n`
  for (const version of ['1.0', '1.5']) assert.equal(run(project(version)).status, 0, `${version} notifies`)
  const refused = run(project('2.0'))
  assert.notEqual(refused.status, 0)
  assert.match(refused.stdout, /declares version 2\.0, of major 2/)
  for (const [name, metadata] of [['a missing version', '[project]\nname = "noisemaker"\n'], ['an unreadable version', project('two')],
    ['a file that is not TOML', 'version = "1.0\n'], ['an unreadable file', null]]) {
    const result = run(metadata)
    assert.notEqual(result.status, 0, `${name} is refused`)
    assert.match(result.stdout, /no downstream notice is sent/, name)
  }
})

test('the downstream guard runs before the token and the notice, every time', () => {
  const names = notifySteps().map(step => step.name)
  const guard = names.indexOf('Require a 1.x tree')
  assert.ok(guard >= 0, 'the guard step exists')
  assert.ok(guard < names.indexOf('Mint GitHub App token'), 'the guard is before the token step')
  assert.ok(guard < names.indexOf('Notify'), 'the guard is before the notice')
  assert.doesNotMatch(guardStep().body, /^ {8}(if|continue-on-error):/m, 'the guard has no condition and cannot be skipped')
})
