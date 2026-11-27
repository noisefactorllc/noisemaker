/**
 * Tag-validity guard.
 *
 * Nothing enforces VALID_TAGS at runtime (it is only re-exported as public
 * API), so ad-hoc / mistyped tags silently slip into effect definitions and
 * drift away from TAG_DEFINITIONS in src/runtime/tags.js. This test closes
 * that gap: every tag used by an effect must be defined, and every defined
 * tag must be used by at least one effect.
 *
 * Tags come from each effect's metadata through the catalog reader
 * (scripts/lib/portable-catalog.mjs), as scripts/generate-shader-manifest.mjs
 * reads them, so this test agrees with what actually lands in the generated
 * manifest, from a definition.json or a legacy definition.js alike.
 */
import { readdirSync, existsSync, statSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { VALID_TAGS } from '../src/runtime/tags.js'
import { readCatalogMetadata } from '../../scripts/lib/portable-catalog.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EFFECTS_DIR = join(__dirname, '..', 'effects')

async function collectEffectTags() {
    const result = []
    for (const ns of readdirSync(EFFECTS_DIR)) {
        const nsDir = join(EFFECTS_DIR, ns)
        if (!statSync(nsDir).isDirectory()) continue
        for (const eff of readdirSync(nsDir)) {
            if (!existsSync(join(nsDir, eff, 'definition.js'))) continue
            const tags = (await readCatalogMetadata(join(nsDir, eff)))?.tags
            if (!Array.isArray(tags)) continue
            result.push({ effect: `${ns}/${eff}`, tags: tags.filter(Boolean) })
        }
    }
    return result
}

function test(name, fn) {
    try {
        console.log(`Running test: ${name}`)
        fn()
        console.log(`PASS: ${name}`)
    } catch (error) {
        console.error(`FAIL: ${name}`)
        console.error(error.message || error)
        process.exit(1)
    }
}

const validSet = new Set(VALID_TAGS)
const effectTags = await collectEffectTags()

test('every effect tag is defined in TAG_DEFINITIONS (VALID_TAGS)', () => {
    const violations = []
    for (const { effect, tags } of effectTags) {
        for (const tag of tags) {
            if (!validSet.has(tag)) violations.push(`${effect}: "${tag}"`)
        }
    }
    if (violations.length) {
        throw new Error(
            'Effects use tags not in VALID_TAGS. Add them to TAG_DEFINITIONS in ' +
            'src/runtime/tags.js, or fix the typo:\n  ' + violations.join('\n  ')
        )
    }
})

test('every defined tag is used by at least one effect (no dead tags)', () => {
    const used = new Set(effectTags.flatMap(e => e.tags))
    const dead = VALID_TAGS.filter(t => !used.has(t))
    if (dead.length) {
        throw new Error(
            'TAG_DEFINITIONS contains tags no effect uses. Remove them from ' +
            'src/runtime/tags.js, or tag an effect:\n  ' + dead.join(', ')
        )
    }
})

console.log(`\nChecked ${effectTags.length} effects against ${VALID_TAGS.length} valid tags.`)
