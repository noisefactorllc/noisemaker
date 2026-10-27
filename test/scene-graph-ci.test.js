import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
