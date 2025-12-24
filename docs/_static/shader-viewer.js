/**
 * Embedded Shader Viewer for Shaders docs
 * Uses CanvasRenderer from the core bundle for proper effect handling
 * Matches demo/shaders/index.html patterns exactly
 */

(function() {
    'use strict';

    // Resolve base paths relative to the current page
    // basePath must point to the directory containing effects/ folder
    // bundlePath must point to the effects/ folder itself
    function getBasePath() {
        const baseUrl = new URL('./', window.location.href).href;
        return baseUrl + '_static';
    }
    
    function getBundlePath() {
        const baseUrl = new URL('./', window.location.href).href;
        return baseUrl + '_static/effects';
    }
    
    const BASE_PATH = getBasePath();
    const BUNDLE_PATH = getBundlePath();
    
    // Namespace order - matches demo/shaders/index.html loadEffects() exactly
    const EFFECT_DIRS = [
        { namespace: 'filter' },
        { namespace: 'mixer' },
        { namespace: 'synth' },
        { namespace: 'render' },
        { namespace: 'points' },
        { namespace: 'synth3d' },
        { namespace: 'filter3d' },
        { namespace: 'classicNoisedeck' },
        { namespace: 'classicNoisemaker' }
    ];
    
    let NoisemakerShaders = null;

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function ensureCoreBundleLoaded() {
        let attempts = 0;
        while (!window.NoisemakerShadersCore && attempts < 50) {
            await delay(100);
            attempts++;
        }
        
        if (!window.NoisemakerShadersCore) {
            throw new Error('Noisemaker Shaders core not loaded');
        }
        
        NoisemakerShaders = window.NoisemakerShadersCore;
        return NoisemakerShaders;
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function camelToSpaceCase(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .toLowerCase();
    }

    function createControl(container, key, spec, currentValue, onChange) {
        const wrapper = document.createElement('div');
        wrapper.className = 'shader-live-control';

        const label = document.createElement('label');
        label.textContent = camelToSpaceCase(key);
        wrapper.appendChild(label);

        let input;
        const type = spec.type || 'float';

        if (spec.choices) {
            input = document.createElement('select');
            for (const [name, value] of Object.entries(spec.choices)) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = name;
                if (value === currentValue) option.selected = true;
                input.appendChild(option);
            }
            input.addEventListener('change', () => onChange(key, parseInt(input.value)));
            wrapper.appendChild(input);
        } else if (type === 'boolean') {
            input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = !!currentValue;
            input.addEventListener('change', () => onChange(key, input.checked));
            wrapper.appendChild(input);
        } else if (type === 'int' || type === 'float') {
            const rangeWrapper = document.createElement('div');
            rangeWrapper.style.display = 'flex';
            rangeWrapper.style.alignItems = 'center';
            rangeWrapper.style.gap = '8px';
            rangeWrapper.style.flex = '1';

            input = document.createElement('input');
            input.type = 'range';
            input.min = spec.min ?? 0;
            input.max = spec.max ?? (type === 'int' ? 10 : 1);
            input.step = type === 'int' ? 1 : ((spec.max ?? 1) - (spec.min ?? 0)) / 100 || 0.01;
            input.value = currentValue ?? spec.default ?? 0;
            input.style.flex = '1';

            const valueDisplay = document.createElement('span');
            valueDisplay.className = 'control-value';
            valueDisplay.textContent = type === 'int' ? Math.round(input.value) : parseFloat(input.value).toFixed(2);

            input.addEventListener('input', () => {
                const val = type === 'int' ? parseInt(input.value) : parseFloat(input.value);
                valueDisplay.textContent = type === 'int' ? val : val.toFixed(2);
                onChange(key, val);
            });

            rangeWrapper.appendChild(input);
            rangeWrapper.appendChild(valueDisplay);
            wrapper.appendChild(rangeWrapper);
        } else {
            return null;
        }

        container.appendChild(wrapper);
        return wrapper;
    }

    function buildControlsForEffect(container, effect, onChange) {
        container.innerHTML = '';

        if (!effect || !effect.globals) {
            const msg = document.createElement('div');
            msg.className = 'no-params-message';
            msg.textContent = 'No adjustable parameters';
            container.appendChild(msg);
            return { values: {}, uniformMap: {} };
        }

        const values = {};
        const uniformMap = {};  // Maps control key to uniform name
        const globals = effect.globals;

        for (const [key, spec] of Object.entries(globals)) {
            if (spec.ui && spec.ui.control === false) continue;
            if (spec.type === 'surface') continue;

            values[key] = spec.default;
            uniformMap[key] = spec.uniform || key;  // Use spec.uniform if available

            createControl(container, key, spec, values[key], (k, v) => {
                values[k] = v;
                onChange(values, uniformMap);
            });
        }

        if (Object.keys(values).length === 0) {
            const msg = document.createElement('div');
            msg.className = 'no-params-message';
            msg.textContent = 'No adjustable parameters';
            container.appendChild(msg);
        }

        return { values, uniformMap };
    }

    async function initShaderViewer(container) {
        const canvas = container.querySelector('.shader-viewer-canvas');
        const select = container.querySelector('.shader-viewer-select');
        const paramsContainer = container.querySelector('.shader-viewer-params');
        const loadingIndicator = container.querySelector('.shader-viewer-loading');
        const randomButton = container.querySelector('.shader-viewer-random');
        const dslOverlay = container.querySelector('.shader-viewer-dsl-overlay');

        if (!canvas || !select || !paramsContainer) {
            console.error('Shader viewer: missing required elements');
            return;
        }

        if (loadingIndicator) {
            loadingIndicator.textContent = 'Loading shaders...';
            loadingIndicator.style.display = 'block';
        }

        try {
            await ensureCoreBundleLoaded();
        } catch (e) {
            console.error('Failed to load shader core:', e);
            paramsContainer.innerHTML = `<div class="shader-viewer-error">Failed to load shader library: ${e.message}</div>`;
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            return;
        }

        // Create CanvasRenderer - matches demo/shaders/index.html exactly
        const CanvasRenderer = NoisemakerShaders.CanvasRenderer;
        if (!CanvasRenderer) {
            paramsContainer.innerHTML = '<div class="shader-viewer-error">CanvasRenderer not available</div>';
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            return;
        }

        let renderer = null;
        let currentEffect = null;
        let currentUniforms = {};

        try {
            // Matches demo: basePath for manifest, bundlePath for effect bundles
            renderer = new CanvasRenderer({
                canvas: canvas,
                width: canvas.width,
                height: canvas.height,
                basePath: BASE_PATH,
                preferWebGPU: false,
                useBundles: true,
                bundlePath: BUNDLE_PATH
            });
        } catch (e) {
            console.error('Failed to create renderer:', e);
            paramsContainer.innerHTML = `<div class="shader-viewer-error">Failed to create renderer: ${e.message || e}</div>`;
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            return;
        }

        // Load manifest using renderer.loadManifest() - matches demo exactly
        try {
            await renderer.loadManifest();
        } catch (e) {
            console.error('Failed to load manifest:', e);
            paramsContainer.innerHTML = `<div class="shader-viewer-error">Failed to load effects manifest: ${e.message}</div>`;
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            return;
        }

        // Build effects list - matches demo/shaders/index.html loadEffects() exactly
        const effects = [];
        for (const dir of EFFECT_DIRS) {
            const effectNames = renderer.getEffectsFromManifest(dir.namespace);
            for (const effectName of effectNames) {
                const effectId = `${dir.namespace}/${effectName}`;
                effects.push({
                    namespace: dir.namespace,
                    name: effectName,
                    description: renderer.getEffectDescription(effectId),
                    instance: null,
                    loaded: false
                });
            }
        }

        // Populate effect selector - matches demo-ui.js populateEffectSelector() exactly
        select.innerHTML = '';
        
        const grouped = {};
        effects.forEach(effect => {
            if (!grouped[effect.namespace]) {
                grouped[effect.namespace] = [];
            }
            grouped[effect.namespace].push(effect);
        });

        // Sort namespaces: non-classic first, then classic - matches demo-ui.js exactly
        const sortedNamespaces = Object.keys(grouped).sort((a, b) => {
            const aIsClassic = a.startsWith('classic');
            const bIsClassic = b.startsWith('classic');
            if (aIsClassic && !bIsClassic) return 1;
            if (!aIsClassic && bIsClassic) return -1;
            return a.localeCompare(b);
        });

        sortedNamespaces.forEach(namespace => {
            const effectList = grouped[namespace];
            const optgroup = document.createElement('optgroup');
            optgroup.label = camelToSpaceCase(namespace);
            
            effectList.sort((a, b) => a.name.localeCompare(b.name)).forEach(effect => {
                const option = document.createElement('option');
                option.value = `${namespace}/${effect.name}`;
                option.textContent = camelToSpaceCase(effect.name);
                if (effect.description) {
                    option.classList.add('tooltip');
                    option.dataset.title = effect.description;
                }
                optgroup.appendChild(option);
            });
            
            select.appendChild(optgroup);
        });

        // Get helper functions from core bundle
        const isStarterEffect = NoisemakerShaders.isStarterEffect;
        const hasTexSurfaceParam = NoisemakerShaders.hasTexSurfaceParam;
        const is3dGenerator = NoisemakerShaders.is3dGenerator;
        const is3dProcessor = NoisemakerShaders.is3dProcessor;
        
        // These helpers may not be in older bundles, define inline as fallback
        const hasExplicitTexParam = NoisemakerShaders.hasExplicitTexParam || function(effect) {
            if (!effect || !effect.instance || !effect.instance.globals) {
                return false;
            }
            const texSpec = effect.instance.globals.tex;
            return texSpec && texSpec.type === 'surface' && texSpec.default !== 'inputTex';
        };
        const getVolGeoParams = NoisemakerShaders.getVolGeoParams || function(effect) {
            if (!effect || !effect.instance || !effect.instance.globals) {
                return { volParam: null, geoParam: null };
            }
            let volParam = null;
            let geoParam = null;
            for (const [key, spec] of Object.entries(effect.instance.globals)) {
                if (spec.type === 'volume' && !volParam) {
                    volParam = key;
                }
                if (spec.type === 'geometry' && !geoParam) {
                    geoParam = key;
                }
            }
            return { volParam, geoParam };
        };

        /**
         * Extract effect names from DSL - copied exactly from demo-ui.js
         */
        function extractEffectNamesFromDsl(dsl, manifest) {
            const effects = [];
            if (!dsl || typeof dsl !== 'string') return effects;

            const lines = dsl.split('\n');
            let searchNamespaces = [];
            
            for (const line of lines) {
                const trimmed = line.trim();
                
                if (trimmed.startsWith('search ')) {
                    searchNamespaces = trimmed.slice(7).split(',').map(s => s.trim());
                    continue;
                }
                
                if (!trimmed || trimmed.startsWith('//')) continue;
                
                const callPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\s*\(/g;
                let match;
                
                while ((match = callPattern.exec(trimmed)) !== null) {
                    const fullName = match[1];
                    let namespace = null;
                    let name = fullName;
                    
                    if (fullName.includes('.')) {
                        const parts = fullName.split('.');
                        namespace = parts[0];
                        name = parts[1];
                    }
                    
                    const builtins = ['src', 'out', 'vec2', 'vec3', 'vec4'];
                    if (builtins.includes(name)) continue;
                    
                    if (!namespace && searchNamespaces.length > 0) {
                        for (const ns of searchNamespaces) {
                            const testId = `${ns}/${name}`;
                            if (manifest[testId]) {
                                namespace = ns;
                                break;
                            }
                        }
                    }
                    
                    if (!namespace) {
                        for (const ns of ['classicNoisemaker', 'classicNoisedeck', 'filter', 'mixer', 'synth', 'sim']) {
                            const testId = `${ns}/${name}`;
                            if (manifest[testId]) {
                                namespace = ns;
                                break;
                            }
                        }
                    }
                    
                    if (namespace) {
                        const effectId = `${namespace}/${name}`;
                        if (!effects.find(e => e.effectId === effectId)) {
                            effects.push({ effectId, namespace, name });
                        }
                    }
                }
            }

            return effects;
        }

        /**
         * Build DSL from effect - copied exactly from demo-ui.js buildDslSource()
         * Simplified to use default values only (no _parameterValues)
         */
        function buildDslSource(effect) {
            if (!effect || !effect.instance) {
                return '';
            }

            // Build search directive
            // Classic namespaces stay in their lane - no cross-namespace search
            // classicNoisemaker needs synth for noise() starter (it has no noise module)
            // Points effects need render namespace for pointsEmit/pointsRender
            let searchNs = effect.namespace;
            if (effect.namespace === 'classicNoisemaker') {
                searchNs = 'classicNoisemaker, synth';
            } else if (['filter', 'mixer'].includes(effect.namespace)) {
                searchNs = `${effect.namespace}, synth`;
            } else if (effect.namespace === 'points') {
                searchNs = 'synth, points, render';
            } else if (effect.namespace === 'render') {
                searchNs = 'synth, filter, render';
            }
            const searchDirective = searchNs ? `search ${searchNs}\n\n` : '';
            const funcName = effect.instance.func;

            // Special case: pointsEmit and pointsRender must be paired together
            if (funcName === 'pointsEmit' || funcName === 'pointsRender') {
                return `search points, synth, render\n\nnoise()\n  .write(o0)\n\npointsEmit(\n  tex: read(o0)\n)\n  .physical()\n  .pointsRender()\n  .write(o1)\n\nrender(o1)`;
            }

            const starter = isStarterEffect(effect);
            const hasTex = hasTexSurfaceParam(effect);
            const hasExplicitTex = hasExplicitTexParam(effect);
            const { volParam, geoParam } = getVolGeoParams(effect);
            const hasVolGeo = volParam && geoParam;

            // Standard noise starter call
            const noiseCall = 'noise(seed: 1, ridges: true)';

            // 3D volume generators
            if (is3dGenerator(effect)) {
                // If generator has vol/geo params, generate 3D input for seeding
                if (hasVolGeo) {
                    return `search synth3d, filter3d, render\n\nnoise3d(volumeSize: x32)\n  .write3d(vol0, geo0)\n\n${funcName}(${volParam}: read3d(vol0, geo0), ${geoParam}: read3d(vol0, geo0))\n  .render3d()\n  .write(o0)\n\nrender(o0)`;
                }
                return `search synth3d, filter3d, render\n\n${funcName}()\n  .render3d()\n  .write(o0)\n\nrender(o0)`;
            }

            // Effects with explicit vol/geo parameters (not pipeline inputs)
            // Generate 3D input and pass to vol/geo params
            if (hasVolGeo) {
                return `search synth3d, filter3d, render\n\nnoise3d(volumeSize: x32)\n  .write3d(vol0, geo0)\n\n${funcName}(${volParam}: read3d(vol0, geo0), ${geoParam}: read3d(vol0, geo0))\n  .render3d()\n  .write(o0)\n\nrender(o0)`;
            }

            // Effects with explicit tex param (not inputTex default) - generate input
            // Starters with explicit tex can stand alone; filters need to chain from input
            if (hasExplicitTex) {
                if (starter) {
                    // Starter with explicit tex param - standalone chain
                    return `${searchDirective}${noiseCall}\n  .write(o0)\n\n${funcName}(tex: read(o0))\n  .write(o1)\n\nrender(o1)`;
                } else {
                    // Filter with explicit tex param - chain from second noise
                    return `${searchDirective}${noiseCall}\n  .write(o0)\n\nnoise(seed: 2, ridges: true)\n  .${funcName}(tex: read(o0))\n  .write(o1)\n\nrender(o1)`;
                }
            }

            if (starter) {
                if (hasTex) {
                    // First chain writes to o0, effect reads from o0 and writes to o1
                    const sourceSurface = 'o0';
                    const outputSurface = 'o1';
                    return `${searchDirective}${noiseCall}\n  .write(${sourceSurface})\n\n${funcName}(tex: read(${sourceSurface}))\n  .write(${outputSurface})\n\nrender(${outputSurface})`;
                }
                return `${searchDirective}${funcName}()\n  .write(o0)\n\nrender(o0)`;
            } else if (hasTex) {
                // First chain writes to o0, second chain writes through effect to o1
                return `${searchDirective}${noiseCall}\n  .write(o0)\n\nnoise(seed: 2, ridges: true)\n  .${funcName}(tex: read(o0))\n  .write(o1)\n\nrender(o1)`;
            } else if (is3dProcessor(effect)) {
                // render3d IS the renderer - don't append another .render3d() call
                const renderSuffix = funcName === 'render3d' ? '' : '\n  .render3d()';
                return `search synth3d, filter3d, render\n\nnoise3d(volumeSize: x32)\n  .${funcName}()${renderSuffix}\n  .write(o0)\n\nrender(o0)`;
            } else {
                return `${searchDirective}${noiseCall}\n  .${funcName}()\n  .write(o0)\n\nrender(o0)`;
            }
        }

        async function selectEffect(effectPath) {
            const [namespace, name] = effectPath.split('/');
            
            const placeholderEntry = effects.find(e => e.namespace === namespace && e.name === name);
            
            if (!placeholderEntry) {
                paramsContainer.innerHTML = `<div class="shader-viewer-error">Effect ${effectPath} not found</div>`;
                return;
            }

            if (loadingIndicator) {
                loadingIndicator.textContent = `Loading ${name}...`;
                loadingIndicator.style.display = 'block';
            }
            canvas.style.opacity = '0.5';

            try {
                // Load the effect using CanvasRenderer
                const effectId = `${namespace}/${name}`;
                const loadedEffect = await renderer.loadEffect(effectId);
                
                placeholderEntry.instance = loadedEffect.instance;
                placeholderEntry.loaded = true;
                currentEffect = placeholderEntry;

                // Build controls
                const controlResult = buildControlsForEffect(paramsContainer, currentEffect.instance, (newValues, uniformMap) => {
                    currentUniforms = newValues;
                    // Update renderer uniforms using the correct uniform names
                    if (renderer._pipeline) {
                        for (const [k, v] of Object.entries(newValues)) {
                            const uniformName = uniformMap[k] || k;
                            renderer._pipeline.setUniform(uniformName, v);
                        }
                    }
                });
                currentUniforms = controlResult.values;

                // Dispose old pipeline before building new one - matches demo exactly
                await renderer.dispose({ loseContext: false, resetCanvas: false });

                // Build and run DSL - matches demo exactly
                const dsl = buildDslSource(currentEffect);

                // Update DSL overlay - wrap each line in a span for per-line background
                if (dslOverlay) {
                    const lines = dsl.split('\n').filter(l => l.trim());
                    dslOverlay.innerHTML = lines.map(line => `<span>${escapeHtml(line)}</span>`).join('<br>');
                }

                // Load any dependencies in the DSL - matches demo exactly
                const effectsInDsl = extractEffectNamesFromDsl(dsl, renderer.manifest);
                const effectIdsToLoad = effectsInDsl
                    .map(e => e.effectId)
                    .filter(id => !renderer.loadedEffects.has(id) && renderer.manifest[id]);
                
                if (effectIdsToLoad.length > 0) {
                    if (loadingIndicator) {
                        loadingIndicator.textContent = `Loading dependencies...`;
                    }
                    await renderer.loadEffects(effectIdsToLoad);
                }

                if (loadingIndicator) {
                    loadingIndicator.textContent = `Compiling shaders...`;
                }
                
                await renderer.compile(dsl);
                renderer.start();

                canvas.style.opacity = '1';
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }

            } catch (e) {
                console.error('Failed to load effect:', e);
                let errorMsg;
                if (e && e.message) {
                    errorMsg = e.message;
                } else if (typeof e === 'object') {
                    errorMsg = JSON.stringify(e);
                } else {
                    errorMsg = String(e);
                }
                paramsContainer.innerHTML = `<div class="shader-viewer-error">Error: ${errorMsg}</div>`;
                canvas.style.opacity = '1';
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }
            }
        }

        select.addEventListener('change', () => {
            selectEffect(select.value);
        });

        if (randomButton) {
            randomButton.addEventListener('click', () => {
                // Reseed all effects in the chain
                if (renderer._pipeline && renderer._pipeline.graph && renderer._pipeline.graph.passes) {
                    for (const pass of renderer._pipeline.graph.passes) {
                        if (pass.uniforms && 'seed' in pass.uniforms) {
                            const newSeed = Math.random() * 100;
                            pass.uniforms.seed = newSeed;
                        }
                    }
                }

                // Also update the global seed uniform if the current effect has one
                if (currentEffect && currentEffect.instance && currentEffect.instance.globals && currentEffect.instance.globals.seed) {
                    const newSeed = Math.random() * 100;
                    currentUniforms.seed = newSeed;
                    if (renderer._pipeline) {
                        renderer._pipeline.setUniform('seed', newSeed);
                    }
                }

                // Reset sim effects by setting resetState uniform
                // Sim effects check this uniform to reinitialize their state
                if (renderer._pipeline && renderer._pipeline.graph && renderer._pipeline.graph.passes) {
                    for (const pass of renderer._pipeline.graph.passes) {
                        if (pass.uniforms && 'resetState' in pass.uniforms) {
                            pass.uniforms.resetState = true;
                        }
                    }
                }
                if (renderer._pipeline) {
                    renderer._pipeline.setUniform('resetState', true);
                }

                // Clear resetState after one frame so it doesn't keep resetting
                requestAnimationFrame(() => {
                    if (renderer._pipeline && renderer._pipeline.graph && renderer._pipeline.graph.passes) {
                        for (const pass of renderer._pipeline.graph.passes) {
                            if (pass.uniforms && 'resetState' in pass.uniforms) {
                                pass.uniforms.resetState = false;
                            }
                        }
                    }
                    if (renderer._pipeline) {
                        renderer._pipeline.setUniform('resetState', false);
                    }
                });
            });
        }

        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        
        // Default to first effect - matches demo exactly
        const defaultEffect = effects.length > 0 ? `${effects[0].namespace}/${effects[0].name}` : null;
        if (defaultEffect) {
            await selectEffect(defaultEffect);
        }
    }

    function initAll() {
        const viewers = document.querySelectorAll('.shader-viewer-container');
        viewers.forEach(viewer => {
            initShaderViewer(viewer);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAll);
    } else {
        initAll();
    }

})();
