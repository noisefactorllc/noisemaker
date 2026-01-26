/**
 * Browser-based test to verify "automatic" appears in UI for osc() parameters
 */

import { chromium } from '@playwright/test'
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')
const SERVER_PORT = process.argv.includes('--port') 
    ? parseInt(process.argv[process.argv.indexOf('--port') + 1]) 
    : 8081

async function main() {
    console.log(`Using server on port ${SERVER_PORT} (assuming already running)...`)

    let browser, context, page

    try {
        console.log('Launching browser...')
        browser = await chromium.launch({ headless: true })
        context = await browser.newContext()
        page = await context.newPage()

        // Collect console logs
        const consoleLogs = []
        page.on('console', msg => {
            consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
        })

        const url = `http://127.0.0.1:${SERVER_PORT}/demo/shaders/index.html`
        console.log(`Navigating to ${url}...`)
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

        // Wait for the app to initialize (controls container is visible)
        await page.waitForSelector('#effect-controls-container', { timeout: 10000 })

        // Enter DSL with osc() parameter
        const dsl = `search synth, filter, render
noise(ridges: true).loopBegin(alpha: osc(), intensity: 95).warp().loopEnd().write(o0)
render(o0)`

        console.log('Setting DSL:', dsl.replace(/\n/g, '\\n'))

        // Access the UI controller and set DSL programmatically via the DSL editor
        // First reveal DSL editor
        await page.evaluate(() => {
            const dslToggle = document.querySelector('#dsl-toggle-btn')
            if (dslToggle) dslToggle.click()
        })
        await page.waitForTimeout(200)

        // Set DSL text in editor
        await page.evaluate((dslText) => {
            const editor = document.querySelector('#dsl-editor')
            if (editor) {
                editor.value = dslText
            }
        }, dsl)

        // Click Run button
        await page.evaluate(() => {
            const runBtn = document.querySelector('#dsl-run-btn')
            if (runBtn) runBtn.click()
        })

        // Wait for controls to render
        await page.waitForTimeout(1000)

        // Debug: dump the actual structure from the ProgramState
        const stateDebug = await page.evaluate(async () => {
            const result = {
                currentDsl: window.__noisemakerCurrentDsl
            }

            // Try to import and check chain lengths
            try {
                const langModule = await import('../../shaders/src/lang/index.js')
                const dsl = window.__noisemakerCurrentDsl
                const tokens = langModule.lex(dsl)
                const ast = langModule.parse(tokens)
                const compiled = langModule.compile(dsl)

                // AST chain structure
                const astChain = []
                if (ast.plans) {
                    for (const plan of ast.plans) {
                        if (!plan.chain) continue
                        for (const step of plan.chain) {
                            astChain.push({
                                type: step.type,
                                name: step.name,
                                kwargsKeys: step.kwargs ? Object.keys(step.kwargs) : [],
                                alphaKwargType: step.kwargs?.alpha?.type
                            })
                        }
                    }
                }

                // Compiled chain structure
                const compiledChain = []
                if (compiled.plans) {
                    for (const plan of compiled.plans) {
                        if (!plan.chain) continue
                        for (const step of plan.chain) {
                            compiledChain.push({
                                op: step.op,
                                alphaArgType: step.args?.alpha?.type
                            })
                        }
                    }
                }

                result.astChainLength = astChain.length
                result.compiledChainLength = compiledChain.length
                result.astChain = astChain
                result.compiledChain = compiledChain
            } catch (err) {
                result.extractError = err.message
            }

            return result
        })
        console.log('stateDebug:', JSON.stringify(stateDebug, null, 2))

        // Check for "automatic" in the controls
        const automaticElements = await page.evaluate(() => {
            const elements = []
            const controlGroups = document.querySelectorAll('.control-group')
            for (const group of controlGroups) {
                const paramKey = group.dataset?.paramKey
                const text = group.textContent || ''
                if (text.includes('automatic')) {
                    elements.push({ paramKey, text: text.trim() })
                }
            }
            return elements
        })

        console.log('\n=== Control Groups with "automatic" ===')
        if (automaticElements.length === 0) {
            console.log('NONE FOUND!')

            // Debug: show all control groups
            const allGroups = await page.evaluate(() => {
                const groups = []
                const controlGroups = document.querySelectorAll('.control-group')
                for (const group of controlGroups) {
                    groups.push({
                        paramKey: group.dataset?.paramKey,
                        text: group.textContent?.trim().substring(0, 100)
                    })
                }
                return groups.slice(0, 20) // First 20
            })
            console.log('\nFirst 20 control groups:')
            for (const g of allGroups) {
                console.log(`  [${g.paramKey}]: ${g.text}`)
            }

            // Check alpha specifically
            const alphaGroup = await page.evaluate(() => {
                const groups = document.querySelectorAll('.control-group')
                for (const group of groups) {
                    if (group.dataset?.paramKey === 'alpha') {
                        return {
                            html: group.outerHTML,
                            text: group.textContent
                        }
                    }
                }
                return null
            })

            if (alphaGroup) {
                console.log('\n=== Alpha Control Group ===')
                console.log('Text:', alphaGroup.text)
                console.log('HTML:', alphaGroup.html)
            } else {
                console.log('\nNo alpha control group found!')
            }

            // Show console logs
            if (consoleLogs.length > 0) {
                console.log('\n=== Browser Console Logs ===')
                for (const log of consoleLogs.slice(-20)) {
                    console.log(log)
                }
            }

            console.log('\n❌ FAIL: No "automatic" found in UI')
            process.exitCode = 1
        } else {
            console.log('Found "automatic" in:')
            for (const el of automaticElements) {
                console.log(`  [${el.paramKey}]: ${el.text}`)
            }
            console.log('\n✅ PASS: "automatic" found in UI')
        }

    } catch (err) {
        console.error('Error:', err.message)
        process.exitCode = 1
    } finally {
        if (browser) await browser.close()
    }
}

main()
