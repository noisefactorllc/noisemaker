import { chromium } from 'playwright';

async function test() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Capture console output
    page.on('console', msg => {
        if (msg.type() === 'error') console.log('BROWSER ERROR:', msg.text());
    });
    
    await page.goto('http://localhost:8081/demo/shaders/index.html');
    await page.waitForLoadState('networkidle');
    await new Promise(r => setTimeout(r, 2000));
    
    // Click the code button to show the DSL editor
    await page.click('#pipeline-code-btn');
    await new Promise(r => setTimeout(r, 500));
    
    // Put DSL in editor and run
    const dsl = `search synth, filter, render

let o = osc(type: sine, min: 0, max: 100)

noise(xScale: 11.48)
  .loopBegin(alpha: o, intensity: 95)
  .warp()
  .loopEnd()
  .write(o0)

render(o0)`;

    await page.fill('#dsl-editor', dsl);
    await page.click('#dsl-run-btn');
    await new Promise(r => setTimeout(r, 2000));
    
    // Check the renderer's currentDsl and compiled state
    const result = await page.evaluate(() => {
        const renderer = window.__noisemakerCanvasRenderer;
        if (!renderer) return { error: 'No renderer' };
        
        // Get the current DSL
        const dsl = renderer.currentDsl;
        
        // Check the pipeline graph
        const pipeline = window.__noisemakerRenderingPipeline;
        const passes = pipeline?.graph?.passes || [];
        
        // Find the loopBegin pass
        const loopBeginPass = passes.find(p => p.effectKey === 'render.loopBegin');
        
        return {
            currentDsl: dsl?.slice(0, 300),
            alphaValue: loopBeginPass?.uniforms?.alpha,
            alphaType: typeof loopBeginPass?.uniforms?.alpha,
            alphaIsOsc: loopBeginPass?.uniforms?.alpha?.oscillator === true
        };
    });
    
    console.log('Result:', JSON.stringify(result, null, 2));
    
    await browser.close();
    process.exit(0);
}

test().catch(e => { console.error(e); process.exit(1); });
