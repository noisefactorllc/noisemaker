const SHADER_CDN = 'https://shaders.noisedeck.app/1';

const STRIP_DSL = `search synth, filter, mixer

perlin(
  scale: 87.6,
  dimensions: 3,
  ridges: true
)
  .tetraColorArray(
    color0: #010000,
    color1: #111111,
    color2: #fd01c0,
    color3: #fb31c9,
    color4: #32ff03,
    rotation: fwd,
    alpha: 0.38,
    smoothness: 0.94
  )
  .write(o0)

read(o0)
  .lighting(
    normalStrength: 4.84,
    smoothing: 5.8,
    specularIntensity: 0.51,
    shininess: 70,
    reflection: 23.7,
    refraction: 18.2,
    aberration: 19
  )
  .focusBlur(
    tex: read(o0),
    focalDistance: 39.33,
    aperture: 2.54,
    sampleBias: 41.51
  )
  .adjust(brightness: 1.1, contrast: 0.625)
  .write(o1)

render(o1)`;

function sizeStripCanvas(canvas) {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = (window.devicePixelRatio || 1) * 0.5;
  const width = Math.max(160, Math.floor(rect.width * dpr));
  const height = Math.max(24, Math.floor(rect.height * dpr));
  canvas.width = width;
  canvas.height = height;
  return { width, height };
}

async function startStripShader() {
  const canvas = document.getElementById('nm-strip-canvas');
  if (!canvas) return;

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
