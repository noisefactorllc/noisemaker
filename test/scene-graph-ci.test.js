import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const workflow = name => readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8')
const pushBlock = text => text.match(/\n {2}push:\n([\s\S]*?)(?=\n {2}[a-z_]+:|\npermissions:|\njobs:)/)?.[1] ?? ''
const jobBlock = (text, name) => text.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [A-Za-z_][A-Za-z0-9_-]*:|$)`))?.[1] ?? ''

// The workflow contract of the 2.x line: what a 2.x push, tag or dispatch can run, and what it
// can never reach. Every file in the directory is read, so a new workflow is inside the contract.
const workflowsDir = new URL('../.github/workflows/', import.meta.url)
const workflowFiles = () => readdirSync(workflowsDir).filter(file => /\.ya?ml$/.test(file)).sort()
const workflowFile = file => readFileSync(new URL(file, workflowsDir), 'utf8')
const jobNames = text => [...(text.match(/\njobs:\n([\s\S]*)$/)?.[1] ?? '').matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_-]*):$/gm)].map(match => match[1])
const stepNames = block => [...block.matchAll(/\n {4}- name: ([^\n]+)/g)].map(match => match[1])
const MAIN_ONLY = /github\.ref == 'refs\/heads\/main'/
// Minting a token for the release repository, or naming one of its release workflows.
const RELEASE_REFERENCE = /\bsecrets\s*\.\s*(RELEASE_REPOSITORY|LIBRARY_RELEASE_WORKFLOW|STATIC_SITE_RELEASE_WORKFLOW|EXPORT_KIT_RELEASE_WORKFLOW)\b|library-release\.ya?ml|static-site-release\.ya?ml|export-kit-release/i
const RELEASE_FILES = ['docs-site.yml', 'export-kits.yml', 'shaders-2x.yml', 'shaders.yml', 'site.yml']
// The secrets the workflows read at the 2.x branch point, and no other.
const SECRETS = ['EHSRE_APP_PRIVATE_KEY', 'EXPORT_KIT_RELEASE_WORKFLOW', 'LIBRARY_RELEASE_WORKFLOW', 'NOISEDECK_APP_PRIVATE_KEY',
  'QUEUE_REPOSITORY', 'RELEASE_REPOSITORY', 'STATIC_SITE_RELEASE_WORKFLOW']

test('the JavaScript and Python suites run on 2.x pushes, and the JavaScript builds stay on main', () => {
  for (const name of ['js', 'python']) {
    assert.match(pushBlock(workflow(name)), /branches:\s*\[[^\]]*(?<![\w.-])2\.x(?![\w.-])[^\]]*\]/, `${name} must test 2.x pushes`)
  }
  for (const job of ['build-bundles', 'build-standalone-linux', 'build-standalone-macos', 'build-standalone-windows']) {
    assert.match(jobBlock(workflow('js'), job), MAIN_ONLY, `js/${job} must remain restricted to main`)
  }
})

test('shaders.yml is as main has it: its publishing jobs require main', () => {
  for (const job of ['bundle', 'deploy-site', 'deploy-shaders']) {
    assert.match(jobBlock(workflow('shaders'), job), MAIN_ONLY, `shaders/${job} must remain restricted to main`)
  }
  const branches = pushBlock(workflow('shaders')).match(/branches:\s*\[([^\]]*)\]/)?.[1].split(',').map(value => value.trim()) ?? []
  assert.ok(branches.length > 0 && branches.every(value => ['main', 'scene-graph'].includes(value)), `shaders.yml takes pushes only from main: ${branches}`)
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

test('the image, docs, downstream, kit and site workflows take pushes from main only', () => {
  for (const name of ['docker', 'docs-site', 'downstream', 'export-kits', 'site']) {
    assert.match(pushBlock(workflow(name)), /branches:\s*\[\s*main\s*\]/, `${name} must remain restricted to main`)
  }
})

test('every job that dispatches a release requires main, except the manual prerelease of 2.x', () => {
  const dispatching = []
  for (const file of workflowFiles()) {
    const text = workflowFile(file)
    for (const job of jobNames(text)) {
      const block = jobBlock(text, job)
      if (!RELEASE_REFERENCE.test(block)) continue
      dispatching.push(`${file}/${job}`)
      if (file === 'shaders-2x.yml' && job === 'prerelease') {
        assert.match(block, /\n {4}if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/2\.x'\n/, 'the prerelease runs only for a manual dispatch on 2.x')
        assert.doesNotMatch(block, MAIN_ONLY)
      } else {
        assert.match(block, MAIN_ONLY, `${file}/${job} dispatches a release, so it must require main`)
        assert.doesNotMatch(block, /refs\/heads\/(?!main\b)/, `${file}/${job} dispatches a release, so it names no ref but main`)
        const condition = block.match(/^ {4}if: ([^#\n]*)/m)?.[1] ?? ''
        assert.match(condition, MAIN_ONLY, `${file}/${job} requires main in its own condition`)
        assert.doesNotMatch(condition, /\|\||!|ref_name|startsWith|endsWith|contains|format\(/, `${file}/${job} cannot widen its condition beyond main`)
      }
    }
  }
  assert.deepEqual(dispatching.sort(), ['docs-site.yml/dispatch-release', 'export-kits.yml/dispatch', 'shaders-2x.yml/prerelease',
    'shaders.yml/deploy-shaders', 'shaders.yml/deploy-site', 'site.yml/dispatch-release'])
})

test('no other workflow mints a token for the release repository or names a release workflow', () => {
  for (const file of workflowFiles()) {
    if (!RELEASE_FILES.includes(file)) assert.doesNotMatch(workflowFile(file), RELEASE_REFERENCE, `${file} must not reach the release repository`)
  }
})

test('the workflows read only the known secrets, each by its name', () => {
  for (const file of workflowFiles()) {
    const text = workflowFile(file)
    assert.doesNotMatch(text, /toJSON\(\s*secrets\s*\)|\bsecrets\s*\[|\bsecrets\s*\.\s*\*|\bsecrets\s*:\s*inherit/i, `${file} must name each secret it reads`)
    assert.doesNotMatch(text, /(?:^|[\s[{,])[&*][A-Za-z0-9_][\w.-]*(?=[\s\]},]|$)/m, `${file} uses no YAML anchor or alias, so each job is read as written`)
    assert.doesNotMatch(text, /\bactions\s*:\s*write\b|permission-actions\s*:\s*write/, `${file} cannot dispatch a workflow with its own token`)
    for (const [, name] of text.matchAll(/\bsecrets\s*\.\s*([A-Za-z0-9_]+)/gi)) assert.ok(SECRETS.includes(name.toUpperCase()), `${file} reads secrets.${name}, which is not on the list`)
  }
})

test('the version metadata on 2.x is of major 2', () => {
  const pyproject = readFileSync(new URL('../pyproject.toml', import.meta.url), 'utf8').match(/^version = "([^"]+)"/m)?.[1] ?? ''
  assert.match(pyproject, /^2\.\d/, 'the release reads the series from pyproject.toml')
  assert.match(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version, /^2\.\d/)
})

test('shaders-2x.yml runs this test for every workflow change, on 2.x pushes and manual dispatches only', () => {
  const text = workflow('shaders-2x')
  const contract = jobBlock(text, 'test').match(/\n {4}- name: Verify the workflow contract of the 2\.x line\n([\s\S]*?)(?=\n {4}- name:|$)/)?.[1] ?? ''
  assert.match(contract, /^ {6}run: node --test test\/scene-graph-ci\.test\.js$/m)
  assert.doesNotMatch(contract, /^ {6}(if|continue-on-error):/m, 'the contract step cannot be skipped')
  assert.doesNotMatch(text, /continue-on-error:/, 'no job or step of shaders-2x.yml may fail and let the run succeed')
  const push = pushBlock(text)
  assert.match(push, /branches:\s*\[\s*2\.x\s*\]/)
  assert.match(push, /\n {6}- '\.github\/workflows\/\*\*'(\n|$)/)
  assert.match(text, /\n {2}workflow_dispatch:\n {4}inputs:\n {6}sha:\n/)
  assert.deepEqual([...(text.match(/\non:\n([\s\S]*?)\npermissions:/)?.[1] ?? '').matchAll(/^ {2}([a-z_]+):$/gm)].map(match => match[1]), ['push', 'workflow_dispatch'])
  assert.doesNotMatch(text, /STATIC_SITE_RELEASE_WORKFLOW|EXPORT_KIT_RELEASE_WORKFLOW|QUEUE_REPOSITORY|-f site=|\/dispatches\b/,
    'shaders-2x.yml dispatches no site, docs, export-kit or downstream release')
  const prerelease = jobBlock(text, 'prerelease')
  assert.match(prerelease, /\n {4}needs: \[bundle, docs\]\n/)
  assert.match(prerelease, /\[ "\$NAMED" != "\$GITHUB_SHA" \]/, 'the prerelease refuses a SHA other than the one the run checked out')
  assert.match(prerelease, /refs\/heads\/2\.x \| cut -f1\)\n[\s\S]*\[ "\$head" != "\$GITHUB_SHA" \]/, 'the prerelease refuses a SHA that is not the head of 2.x')
  assert.match(prerelease, /-f line=prerelease/)
})

test('shaders-2x.yml runs the steps of shaders.yml\'s test and GPU jobs, with no step limited to one branch', () => {
  const main = workflow('shaders'), line = workflow('shaders-2x')
  for (const job of ['test', 'gpu']) {
    const ours = stepNames(jobBlock(line, job))
    for (const name of stepNames(jobBlock(main, job))) assert.ok(ours.includes(name), `shaders-2x/${job} must run "${name}"`)
    assert.doesNotMatch(jobBlock(line, job).replace(/^[\s\S]*?\n {4}steps:\n/, ''), /^ {6}if:/m, `no step of shaders-2x/${job} is conditional`)
  }
  assert.match(jobBlock(line, 'gpu'), /\n {6}group: noisemaker-gpu\n/)
})

test('the 2.x release workflow skips prerelease tags, requires 2.x and never marks a Release Latest', () => {
  const text = workflow('release')
  assert.match(pushBlock(text), /\n {4}tags:\n {6}- 'v\*'\n {6}- '!v\*-pre\.\*'\n/)
  assert.doesNotMatch(pushBlock(text), /branches:/)
  assert.match(jobBlock(text, 'verify-source'), /git merge-base --is-ancestor .*refs\/remotes\/origin\/2\.x/)
  for (const job of ['build-js-bundles', 'build-standalone-linux', 'build-standalone-macos', 'build-standalone-windows', 'build-shader-bundle']) {
    assert.match(jobBlock(text, job), /needs:.*verify-source/, `release/${job} must require source verification`)
  }
  const create = text.slice(text.indexOf('gh release create'))
  assert.match(create.slice(0, create.indexOf('\n\n')), /\n {10}--latest=false \\\n/)
})

test('dependabot merges only pull requests', () => {
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

test('the downstream guard reads the pushed version and refuses any major other than 1', t => {
  const dir = mkdtempSync(join(tmpdir(), 'downstream-guard-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
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
