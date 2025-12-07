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
        { namespace: 'stateful' },
        { namespace: 'vol' },
        { namespace: 'classicBasics' },
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
            return {};
        }

        const values = {};
        const globals = effect.globals;

        for (const [key, spec] of Object.entries(globals)) {
            if (spec.ui && spec.ui.control === false) continue;
            if (spec.type === 'surface') continue;

            values[key] = spec.default;

            createControl(container, key, spec, values[key], (k, v) => {
                values[k] = v;
                onChange(values);
            });
        }

        if (Object.keys(values).length === 0) {
            const msg = document.createElement('div');
            msg.className = 'no-params-message';
            msg.textContent = 'No adjustable parameters';
            container.appendChild(msg);
        }

        return values;
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
                    option.title = effect.description;
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
                        for (const ns of ['classicBasics', 'classicNoisemaker', 'classicNoisedeck', 'filter', 'mixer', 'synth', 'stateful']) {
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

            // Build search directive - always include synth for noise() starter
            let searchNs = effect.namespace;
            if (effect.namespace === 'classicNoisemaker') {
                searchNs = 'classicNoisemaker, classicBasics, synth';
            } else if (['filter', 'mixer', 'stateful'].includes(effect.namespace)) {
                searchNs = `${effect.namespace}, synth`;
            }
            const searchDirective = searchNs ? `search ${searchNs}\n` : '';
            const funcName = effect.instance.func;

            const starter = isStarterEffect(effect);
            const hasTex = hasTexSurfaceParam(effect);

            // 3D volume generators
            if (is3dGenerator(effect)) {
                return `search vol\n${funcName}().render3d().write(o0)`;
            }

            if (starter) {
                if (hasTex) {
                    const sourceSurface = 'o1';
                    const outputSurface = 'o0';
                    return `${searchDirective}noise(seed: 1, ridges: true).write(${sourceSurface})\n${funcName}(tex: src(${sourceSurface})).write(${outputSurface})`;
                }
                return `${searchDirective}${funcName}().write(o0)`;
            } else if (hasTex) {
                return `${searchDirective}noise(seed: 1, ridges: true).write(o1)\nnoise(seed: 2, ridges: true).${funcName}(tex: src(o1)).write(o0)`;
            } else if (is3dProcessor(effect)) {
                const generatorDsl = `noise3d(volumeSize: x32)`;
                const renderSuffix = funcName === 'render3d' ? '' : '.render3d()';
                return `search vol\n${generatorDsl}.${funcName}()${renderSuffix}.write(o0)`;
            } else {
                return `${searchDirective}noise(seed: 1, ridges: true).${funcName}().write(o0)`;
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
                currentUniforms = buildControlsForEffect(paramsContainer, currentEffect.instance, (newValues) => {
                    currentUniforms = newValues;
                    // Update renderer uniforms
                    if (renderer._pipeline) {
                        for (const [k, v] of Object.entries(newValues)) {
                            renderer._pipeline.setUniform(k, v);
                        }
                    }
                });

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
                if (currentEffect && currentEffect.instance && currentEffect.instance.globals && currentEffect.instance.globals.seed) {
                    const newSeed = Math.random() * 100;
                    currentUniforms.seed = newSeed;
                    if (renderer._pipeline) {
                        renderer._pipeline.setUniform('seed', newSeed);
                    }
                }
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
