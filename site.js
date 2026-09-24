const SHADER_CDN = 'https://shaders.noisedeck.app/1';

// The strip's solid color IS the site's primary-button pink: the --nm-magenta token defined in
// site.css. Read the token instead of hardcoding a second copy that drifts when the theme changes.
function stripPink() {
  return getComputedStyle(document.documentElement).getPropertyValue('--nm-magenta').trim();
}

function stripDsl(pink) {
  return `search synth, filter, mixer

cell(
  shape: triangle,
  scale: 100,
  cellScale: 100,
  variation: 100
)
  .write(o0)

solid(color: ${pink})
  .blendMode(
    tex: read(o0),
    mode: overlay,
    mix: -10.59
  )
  .lighting(
    normalStrength: 5,
    smoothing: 1.6,
    specularIntensity: 1.68,
    shininess: 94,
    ambientColor: #000000ff,
    lightDirection: vec3(0.733, 0.367, 0.573),
    reflection: 27,
    refraction: 37,
    aberration: 27.8
  )
  .write(o1)

render(o1)`;
}

function sizeStripCanvas(canvas) {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(160, Math.floor(rect.width * dpr));
  const height = Math.max(24, Math.floor(rect.height * dpr));
  canvas.width = width;
  canvas.height = height;
  return { width, height };
}

async function startStripShader() {
  const canvas = document.getElementById('nm-strip-canvas');
  if (!canvas) return;

  const pink = stripPink();
  if (!/^#[0-9a-fA-F]{3,8}$/.test(pink)) {
    console.error('Noisemaker strip: --nm-magenta did not resolve to a hex color:', JSON.stringify(pink));
    return;
  }
  const STRIP_DSL = stripDsl(pink);

  try {
    const size = sizeStripCanvas(canvas);
    const module = await import(`${SHADER_CDN}/noisemaker-shaders-core.esm.min.js`);
    const { CanvasRenderer, extractEffectNamesFromDsl } = module;
    const renderer = new CanvasRenderer({
      canvas,
      width: size.width,
      height: size.height,
      preferWebGPU: false,
      useBundles: true,
      basePath: SHADER_CDN,
      bundlePath: `${SHADER_CDN}/effects`
    });

    await renderer.loadManifest();
    const effectData = extractEffectNamesFromDsl(STRIP_DSL, renderer.manifest || {});
    const effectIds = effectData.map((effect) => effect.effectId);
    if (effectIds.length > 0) {
      await renderer.loadEffects(effectIds);
    }

    await renderer.compile(STRIP_DSL);
    renderer.setLoopDuration(15);
    renderer.start();

    window.addEventListener('resize', () => {
      const next = sizeStripCanvas(canvas);
      renderer.resize(next.width, next.height);
    });
  } catch (error) {
    console.error('Noisemaker strip shader failed:', error);
  }
}

startStripShader();
