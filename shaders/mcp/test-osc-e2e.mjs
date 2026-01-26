/**
 * End-to-end test for oscillator automation in the demo UI.
 * Verifies that osc() bindings work correctly from DSL to shader.
 */
import { chromium } from 'playwright';

async function test() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    let hasError = false;
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.error('[BROWSER ERROR]:', msg.text());
            hasError = true;
        }
    });
    
    await page.goto('http://localhost:8081/demo/shaders/index.html');
    await page.waitForLoadState('networkidle');
    await new Promise(r => setTimeout(r, 3000));
    
    // Click the code button to show the DSL editor
    await page.click('#pipeline-code-btn');
    await new Promise(r => setTimeout(r, 500));
    
    // Put oscillator DSL in editor and run
    const dsl = `search synth, filter, render

let o = osc(type: sine, speed: 100, min: 0, max: 100)

noise(xScale: o, ridges: true)
  .loopBegin(alpha: o, intensity: o)
  .warp()
  .loopEnd()
  .write(o0)

render(o0)`;

    await page.fill('#dsl-editor', dsl);
    await page.click('#dsl-run-btn');
    await new Promise(r => setTimeout(r, 2000));
    
    // Verify oscillators are stored and evaluated correctly
    const result = await page.evaluate(() => {
        const pipeline = window.__noisemakerRenderingPipeline;
        if (!pipeline) return { error: 'No pipeline' };
        
        const passes = pipeline.graph?.passes || [];
        
        // Find noise pass (step 0) and loopBegin pass (step 1)
        const noisePass = passes.find(p => p.id === 'node_0_pass_0');
        const loopBeginPass = passes.find(p => p.id === 'node_1_pass_0');
        
        // Check oscillators are in uniforms
        const noiseHasOsc = noisePass?.uniforms?.xScale?.oscillator === true;
        const loopHasAlphaOsc = loopBeginPass?.uniforms?.alpha?.oscillator === true;
        const loopHasIntensityOsc = loopBeginPass?.uniforms?.intensity?.oscillator === true;
        
        // Evaluate oscillators at different times
        const values = [];
        for (let frame = 0; frame < 6; frame++) {
            const t = frame / 60 / 10; // 60fps, 10 second animation
            const resolved = pipeline.resolvePassUniforms(noisePass, t);
            values.push(Math.round(resolved.uniforms?.xScale));
        }
        
        return {
            noiseHasOsc,
            loopHasAlphaOsc,
            loopHasIntensityOsc,
            values
        };
    });
    
    console.log('\n=== OSCILLATOR TEST RESULTS ===');
    console.log(JSON.stringify(result, null, 2));
    
    // Validate results
    let passed = true;
    
    if (!result.noiseHasOsc) {
        console.error('FAIL: noise xScale should be oscillator');
        passed = false;
    }
    
    if (!result.loopHasAlphaOsc) {
        console.error('FAIL: loopBegin alpha should be oscillator');
        passed = false;
    }
    
    if (!result.loopHasIntensityOsc) {
        console.error('FAIL: loopBegin intensity should be oscillator');
        passed = false;
    }
    
    // With speed=100, values should cycle 0→25→75→100→75→25 every 6 frames
    const expected = [0, 25, 75, 100, 75, 25];
    if (JSON.stringify(result.values) !== JSON.stringify(expected)) {
        console.error(`FAIL: oscillator values incorrect. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(result.values)}`);
        passed = false;
    }
    
    if (hasError) {
        console.error('FAIL: Browser console had errors');
        passed = false;
    }
    
    if (passed) {
        console.log('\n✓ All oscillator tests passed!');
    } else {
        console.error('\n✗ Some tests failed');
    }
    
    await browser.close();
    process.exit(passed && !hasError ? 0 : 1);
}

test().catch(e => { console.error(e); process.exit(1); });
