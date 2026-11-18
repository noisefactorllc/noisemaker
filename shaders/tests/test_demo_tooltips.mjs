#!/usr/bin/env node
// The shaders demo shows its controls' tooltips through handfish. Its controls
// carry .tooltip and data-title, which handfish shows only after
// initializeTooltips(); without that call no tooltip appeared at all. Hovering
// a control raises handfish's tooltip layer with the control's text, and no
// control carries a native title, which would add the browser's own tooltip.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const effectsDir = path.join(repoRoot, 'shaders', 'effects')

process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = repoRoot

const { acquireServer, releaseServer } = await import(pathToFileURL(path.join(repoRoot, 'vendor/shade-mcp/harness/index.js')).href)

async function main() {
    const baseUrl = await acquireServer(undefined, repoRoot, effectsDir)
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-gpu-sandbox',
            process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=egl',
        ],
    })

    try {
        const page = await browser.newPage()
        page.setDefaultTimeout(30000)
        await page.goto(`${baseUrl}/demo/shaders/index.html`)
        await page.waitForFunction(() => document.getElementById('app-container')?.style.display === 'block', null, { timeout: 120000 })

        const titles = await page.evaluate(() => [...document.querySelectorAll('body [title]')]
            .filter((el) => el.localName !== 'iframe')
            .map((el) => `${el.localName}#${el.id}: ${el.getAttribute('title')}`))
        assert.deepEqual(titles, [], 'no control carries a native title')

        const button = page.locator('#pause-play-btn')
        const text = await button.getAttribute('data-title')
        assert.equal(text, 'Pause/play animation')
        await button.hover()
        await page.waitForFunction((expected) => {
            const layer = document.getElementById('hf-tooltip-layer')
            return !!layer && !layer.hidden && layer.textContent === expected
        }, text, { timeout: 10000 })

        console.log('PASS the shaders demo shows its tooltips through handfish')
    } finally {
        await browser.close()
        await releaseServer()
    }
}

await main()
