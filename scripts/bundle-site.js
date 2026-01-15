#!/usr/bin/env node
/**
 * Bundle the Noisemaker demo site for deployment.
 *
 * Creates a self-contained site in dist/site/ with:
 * - index.html (landing page)
 * - demo/common.css, demo/common-colors.css, demo/common-layout.css
 * - demo/font/Nunito/ (fonts)
 * - demo/js/ (JS demo, pointing at bundled noisemaker.min.js)
 * - demo/shaders/ (Shaders demo, pointing at bundled shader libs with ?bundles=1 default)
 * - lib/ (bundled JS and shader libraries)
 * - effects/ (mini-bundled shader effects)
 *
 * Usage:
 *   node scripts/bundle-site.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const distDir = path.join(repoRoot, 'dist')
const siteDir = path.join(distDir, 'site')

/**
 * Copy a file, creating directories as needed
 */
function copyFile(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
}

/**
 * Copy a directory recursively, excluding .DS_Store files
 */
function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true })
    const entries = fs.readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
        // Skip .DS_Store files
        if (entry.name === '.DS_Store') continue

        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath)
        } else {
            copyFile(srcPath, destPath)
        }
    }
}

/**
 * Transform index.html for bundled site
 */
function transformIndexHtml() {
    const srcPath = path.join(repoRoot, 'index.html')
    const destPath = path.join(siteDir, 'index.html')

    let html = fs.readFileSync(srcPath, 'utf8')

    // Remove the comment about launching local server
    html = html.replace(/<!--[\s\S]*?To view the Noisemaker demos[\s\S]*?-->\s*/, '')

    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.writeFileSync(destPath, html)
    console.log('  ✓ index.html')
}

/**
 * Transform JS demo index.html for bundled site
 */
function transformJsDemoHtml() {
    const srcPath = path.join(repoRoot, 'demo', 'js', 'index.html')
    const destPath = path.join(siteDir, 'demo', 'js', 'index.html')

    let html = fs.readFileSync(srcPath, 'utf8')

    // Replace module imports with bundled version
    // The bundled version exposes everything on the Noisemaker global
    // Wrap in async IIFE since the original uses top-level await
    const importPattern = /<script type="module">\s*import \{ Context \} from '[^']+context\.js';\s*import \{ render, Preset \} from '[^']+composer\.js';\s*import \{ ColorSpace \} from '[^']+constants\.js';\s*import PRESETS from '[^']+presets\.js';\s*import \{ random, setSeed \} from '[^']+util\.js';\s*import \{ yieldToMain \} from '[^']+asyncHelpers\.js';/

    if (importPattern.test(html)) {
        html = html.replace(
            importPattern,
            `<script src="../../lib/noisemaker.min.js"></script>
    <script>
    (async () => {
    const { Context, render, Preset, ColorSpace, PRESETS, random, setSeed, yieldToMain, getPresetsSource } = Noisemaker;`
        )

        // Replace the fetch for presets.dsl with getPresetsSource()
        html = html.replace(
            /const dslSource = await fetch\('[^']+presets\.dsl'\)\.then\(\(r\) => r\.text\(\)\);/,
            `const dslSource = getPresetsSource();`
        )

        // Close the async IIFE at the end of the script
        html = html.replace(
            /(\s*}\);\s*)(<\/script>\s*<\/body>)/,
            `$1})();
  </script>

</body>`
        )
    } else {
        console.warn('  ⚠ Could not transform JS demo imports - pattern not found')
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.writeFileSync(destPath, html)
    console.log('  ✓ demo/js/index.html')
}

/**
 * Transform Shaders demo index.html for bundled site
 */
function transformShadersDemoHtml() {
    const srcPath = path.join(repoRoot, 'demo', 'shaders', 'index.html')
    const destPath = path.join(siteDir, 'demo', 'shaders', 'index.html')

    let html = fs.readFileSync(srcPath, 'utf8')

    // Replace importmap to point at bundled core
    html = html.replace(
        /<script type="importmap">[\s\S]*?<\/script>/,
        `<script type="importmap">
    {
        "imports": {
            "noisemaker/shader-effects": "../../lib/shaders/noisemaker-shaders-core.esm.min.js"
        }
    }
    </script>`
    )

    // Replace the dynamic import pattern with static imports from bundled core
    // The source now uses dynamic imports based on useBundles, but for the bundled
    // site we always use static imports from the bundled library
    const dynamicImportPattern = /\/\/ Check for bundles mode BEFORE importing\s*\n\s*const params = new URLSearchParams\(window\.location\.search\);\s*\n\s*const useBundles = params\.get\('bundles'\) === '1' \|\| params\.get\('bundles'\) === 'true';\s*\n\s*\n\s*\/\/ Dynamic imports based on bundles mode\s*\n\s*const corePath = useBundles[\s\S]*?const \{ MidiInputManager, AudioInputManager \} = externalInputModule;\s*\n\s*const \{[\s\S]*?getEffectFromURL\s*\n\s*\} = demoUiModule;/

    html = html.replace(
        dynamicImportPattern,
        `// Bundled site - use static imports from bundled core
        import { CanvasRenderer, getEffect } from '../../lib/shaders/noisemaker-shaders-core.esm.min.js';
        import { EffectSelect } from '../../lib/shaders/noisemaker-shaders-core.esm.min.js';
        import { ToggleSwitch } from '../../lib/shaders/noisemaker-shaders-core.esm.min.js';
        import { MidiInputManager, AudioInputManager } from '../../lib/shaders/noisemaker-shaders-core.esm.min.js';
        import { 
            UIController, 
            extractEffectNamesFromDsl,
            getBackendFromURL,
            getUseBundlesFromURL,
            getEffectFromURL
        } from '../../lib/shaders/noisemaker-shaders-core.esm.min.js';
        
        // Always use bundles in deployed site (can be disabled with ?bundles=0)
        const params = new URLSearchParams(window.location.search);
        const useBundles = params.get('bundles') !== '0' && params.get('bundles') !== 'false';`
    )

    // Update basePath references to use bundled paths
    // Handle the conditional shaderBasePath
    html = html.replace(
        /const shaderBasePath = useBundles\s*\n?\s*\? new URL\('\.\.\/\.\.\/dist\/shaders', import\.meta\.url\)\.href\s*\n?\s*: new URL\('\.\.\/\.\.\/shaders', import\.meta\.url\)\.href;/,
        `const shaderBasePath = new URL('../../lib/shaders', import.meta.url).href;`
    )

    // Handle bundleBasePath
    html = html.replace(
        /const bundleBasePath = new URL\('\.\.\/\.\.\/dist\/effects', import\.meta\.url\)\.href;/,
        `const bundleBasePath = new URL('../../effects', import.meta.url).href;`
    )

    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.writeFileSync(destPath, html)
    console.log('  ✓ demo/shaders/index.html')
}

/**
 * Copy CSS files
 */
function copyCssFiles() {
    const cssFiles = [
        'demo/common.css',
        'demo/common-colors.css',
        'demo/common-layout.css',
        'demo/js/colors.css',
        'demo/js/layout.css',
        'demo/shaders/colors.css',
        'demo/shaders/layout.css'
    ]

    for (const cssFile of cssFiles) {
        const src = path.join(repoRoot, cssFile)
        const dest = path.join(siteDir, cssFile)
        if (fs.existsSync(src)) {
            copyFile(src, dest)
            console.log(`  ✓ ${cssFile}`)
        }
    }
}

/**
 * Copy font files
 */
function copyFonts() {
    const fontDir = path.join(repoRoot, 'demo', 'font')
    const destFontDir = path.join(siteDir, 'demo', 'font')

    if (fs.existsSync(fontDir)) {
        copyDir(fontDir, destFontDir)
        console.log('  ✓ demo/font/')
    }
}

/**
 * Copy and transform shader demo lib files (demo-ui.js, effect-select.js, toggle-switch.js)
 * Transforms imports to use bundled core library
 */
function copyShaderDemoLib() {
    const libDir = path.join(repoRoot, 'demo', 'shaders', 'lib')
    const destLibDir = path.join(siteDir, 'demo', 'shaders', 'lib')

    fs.mkdirSync(destLibDir, { recursive: true })

    // Copy effect-select.js as-is (no imports)
    const effectSelectSrc = path.join(libDir, 'effect-select.js')
    if (fs.existsSync(effectSelectSrc)) {
        copyFile(effectSelectSrc, path.join(destLibDir, 'effect-select.js'))
    }

    // Copy toggle-switch.js as-is (no imports)
    const toggleSwitchSrc = path.join(libDir, 'toggle-switch.js')
    if (fs.existsSync(toggleSwitchSrc)) {
        copyFile(toggleSwitchSrc, path.join(destLibDir, 'toggle-switch.js'))
    }

    // Copy control-factory.js as-is (no external imports)
    const controlFactorySrc = path.join(libDir, 'control-factory.js')
    if (fs.existsSync(controlFactorySrc)) {
        copyFile(controlFactorySrc, path.join(destLibDir, 'control-factory.js'))
    }

    // Transform demo-ui.js to use bundled imports
    const demoUiSrc = path.join(libDir, 'demo-ui.js')
    if (fs.existsSync(demoUiSrc)) {
        let content = fs.readFileSync(demoUiSrc, 'utf8')

        // Replace the lang import (match any named imports from lang/index.js)
        content = content.replace(
            /import \{[^}]+\} from '\.\.\/\.\.\/\.\.\/shaders\/src\/lang\/index\.js'/g,
            (match) => {
                // Extract the import names and rewrite to bundled path
                const names = match.match(/import \{([^}]+)\}/)[1]
                return `import {${names}} from '../../../lib/shaders/noisemaker-shaders-core.esm.min.js'`
            }
        )

        // Replace the canvas.js imports (match any named imports from canvas.js)
        content = content.replace(
            /import \{[^}]+\} from '\.\.\/\.\.\/\.\.\/shaders\/src\/renderer\/canvas\.js'/g,
            (match) => {
                const names = match.match(/import \{([^}]+)\}/)[1]
                return `import {${names}} from '../../../lib/shaders/noisemaker-shaders-core.esm.min.js'`
            }
        )

        // Replace the effect.js import (match any named imports from effect.js)
        content = content.replace(
            /import \{[^}]+\} from '\.\.\/\.\.\/\.\.\/shaders\/src\/runtime\/effect\.js'/g,
            (match) => {
                const names = match.match(/import \{([^}]+)\}/)[1]
                return `import {${names}} from '../../../lib/shaders/noisemaker-shaders-core.esm.min.js'`
            }
        )

        fs.writeFileSync(path.join(destLibDir, 'demo-ui.js'), content)
    }

    console.log('  ✓ demo/shaders/lib/')
}

/**
 * Copy shader demo images
 */
function copyShaderDemoImages() {
    const imgDir = path.join(repoRoot, 'demo', 'shaders', 'img')
    const destImgDir = path.join(siteDir, 'demo', 'shaders', 'img')

    if (fs.existsSync(imgDir)) {
        copyDir(imgDir, destImgDir)
        console.log('  ✓ demo/shaders/img/')
    }
}

/**
 * Copy logo image for landing page
 */
function copyLogoImage() {
    const src = path.join(repoRoot, 'noisemaker.png')
    const dest = path.join(siteDir, 'noisemaker.png')
    if (fs.existsSync(src)) {
        copyFile(src, dest)
        console.log('  ✓ noisemaker.png')
    }

    // Copy favicon
    const faviconSrc = path.join(repoRoot, 'favicon.ico')
    const faviconDest = path.join(siteDir, 'favicon.ico')
    if (fs.existsSync(faviconSrc)) {
        copyFile(faviconSrc, faviconDest)
        console.log('  ✓ favicon.ico')
    }
}

/**
 * Copy bundled libraries
 */
function copyBundledLibs() {
    // Copy JS bundle
    const jsBundle = path.join(distDir, 'noisemaker.min.js')
    if (fs.existsSync(jsBundle)) {
        copyFile(jsBundle, path.join(siteDir, 'lib', 'noisemaker.min.js'))
        console.log('  ✓ lib/noisemaker.min.js')
    } else {
        console.warn('  ⚠ noisemaker.min.js not found - run "npm run build" first')
    }

    // Copy shader core bundles
    const shaderDir = path.join(distDir, 'shaders')
    if (fs.existsSync(shaderDir)) {
        copyDir(shaderDir, path.join(siteDir, 'lib', 'shaders'))
        console.log('  ✓ lib/shaders/')
    } else {
        console.warn('  ⚠ dist/shaders not found - run "npm run build:shaders" first')
    }
}

/**
 * Copy effect mini-bundles
 */
function copyEffectBundles() {
    const effectsDir = path.join(distDir, 'effects')
    if (fs.existsSync(effectsDir)) {
        copyDir(effectsDir, path.join(siteDir, 'effects'))
        console.log('  ✓ effects/')
    } else {
        console.warn('  ⚠ dist/effects not found - run "npm run build:shaders" first')
    }
}

/**
 * Copy shader manifest (needed by CanvasRenderer)
 */
function copyShaderManifest() {
    const manifestSrc = path.join(repoRoot, 'shaders', 'effects', 'manifest.json')
    // The bundled site expects manifest in lib/shaders/effects/
    const manifestDest = path.join(siteDir, 'lib', 'shaders', 'effects', 'manifest.json')

    if (fs.existsSync(manifestSrc)) {
        copyFile(manifestSrc, manifestDest)
        console.log('  ✓ lib/shaders/effects/manifest.json')
    } else {
        console.warn('  ⚠ manifest.json not found - run "npm run build:shaders" first')
    }
}

/**
 * Main entry point
 */
async function main() {
    console.log('Building Noisemaker site bundle...\n')

    // Ensure bundles exist
    const jsBundle = path.join(distDir, 'noisemaker.min.js')
    const shaderBundle = path.join(distDir, 'shaders', 'noisemaker-shaders-core.esm.min.js')
    const effectsBundle = path.join(distDir, 'effects')

    if (!fs.existsSync(jsBundle)) {
        console.log('Building JS bundle...')
        execSync('node scripts/bundle.js', { cwd: repoRoot, stdio: 'inherit' })
    }

    if (!fs.existsSync(shaderBundle) || !fs.existsSync(effectsBundle)) {
        console.log('Building shader bundles...')
        execSync('node scripts/bundle-shaders.js', { cwd: repoRoot, stdio: 'inherit' })
    }

    // Clean and create site directory
    if (fs.existsSync(siteDir)) {
        fs.rmSync(siteDir, { recursive: true })
    }
    fs.mkdirSync(siteDir, { recursive: true })

    console.log('\nCopying and transforming files...')

    // Transform HTML files
    transformIndexHtml()
    transformJsDemoHtml()
    transformShadersDemoHtml()

    // Copy CSS
    copyCssFiles()

    // Copy fonts
    copyFonts()

    // Copy shader demo lib and images
    copyShaderDemoLib()
    copyShaderDemoImages()

    // Copy logo image
    copyLogoImage()

    // Copy bundled libraries
    copyBundledLibs()

    // Copy effect bundles
    copyEffectBundles()

    // Copy shader manifest
    copyShaderManifest()

    console.log('\n✓ Site bundle written to dist/site/')
    console.log('\nTo test locally:')
    console.log('  cd dist/site && python3 -m http.server 8080')
    console.log('  open http://localhost:8080/')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
