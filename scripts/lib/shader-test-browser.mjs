import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

/** A real WebGL2/WebGPU test browser, with a reproducible Linux Vulkan driver. */
export function shaderTestBrowserOptions() {
    const options = {
        headless: true,
        args: [
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan',
            process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=vulkan',
        ],
    }
    if (process.platform === 'linux') {
        // Playwright installs the driver with Chromium. Ambient system ICD
        // discovery can select an incompatible driver in otherwise supported
        // CI images. The bundled driver executes both shader languages.
        const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json')
        if (!fs.existsSync(icd)) throw new Error('Chromium Vulkan driver is missing; run playwright install chromium')
        options.env = { ...process.env, VK_ICD_FILENAMES: icd }
    }
    return options
}
