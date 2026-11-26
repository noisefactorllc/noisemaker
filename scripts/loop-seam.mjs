#!/usr/bin/env node
/**
 * Measure the loop seam of one program: how much its frame at phase 1 differs
 * from its frame at phase 0, on WebGL2 and on WebGPU.
 *
 *   node scripts/loop-seam.mjs <program.dsl> [--backend webgl2|webgpu|both]
 *       [--size <width>x<height>] [--frames <N>] [--warmup-loops <n>] [--out <directory>]
 *
 * It writes one JSON line for the run, then one for each backend. It exits 0
 * when it measures every requested backend, whatever the seam: a check sets
 * its own bound. It exits 1 when the program fails to compile or to render, or
 * when a requested backend is not available, and it names the cause.
 */
import fs from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { DEFAULT_FRAMES, DEFAULT_SIZE, measureLoopSeam } from './lib/loop-seam.mjs'

function parseSize(text) {
    const match = /^(\d+)x(\d+)$/.exec(text)
    if (!match) throw new Error(`--size must be <width>x<height>, not ${text}`)
    return { width: Number(match[1]), height: Number(match[2]) }
}

function parseInteger(name, text) {
    if (!/^\d+$/.test(text)) throw new Error(`--${name} must be a whole number, not ${text}`)
    return Number(text)
}

try {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            backend: { type: 'string', default: 'both' },
            size: { type: 'string', default: `${DEFAULT_SIZE.width}x${DEFAULT_SIZE.height}` },
            frames: { type: 'string', default: String(DEFAULT_FRAMES) },
            'warmup-loops': { type: 'string', default: '0' },
            out: { type: 'string' },
        },
    })
    if (positionals.length !== 1) throw new Error('Usage: node scripts/loop-seam.mjs <program.dsl> [--backend webgl2|webgpu|both] [--size <width>x<height>] [--frames <N>] [--warmup-loops <n>] [--out <directory>]')
    const dsl = await fs.readFile(positionals[0], 'utf8')
    const { run, backends } = await measureLoopSeam(dsl, {
        backend: values.backend,
        ...parseSize(values.size),
        frames: parseInteger('frames', values.frames),
        warmupLoops: parseInteger('warmup-loops', values['warmup-loops']),
        out: values.out,
    })
    for (const line of [run, ...backends]) process.stdout.write(`${JSON.stringify(line)}\n`)
} catch (error) {
    process.stderr.write(`loop-seam: ${error.message}\n`)
    process.exitCode = 1
}
