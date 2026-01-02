/**
 * Effect Reference Page - Interactive shader effect documentation
 * 
 * Displays effect description, help documentation, DSL examples, and live demo.
 * Uses the bundled effect versions which include help.md content.
 */

(function() {
    'use strict';

    // Resolve base paths relative to the current page
    function getBasePath() {
        const pathname = window.location.pathname;
        
        // Try to detect ReadTheDocs versioned path pattern (e.g., /en/latest/)
        const rtdMatch = pathname.match(/^(\/[a-z]{2}\/[^\/]+\/)/);
        if (rtdMatch) {
            return rtdMatch[1] + '_static';
        }
        
        return '/_static';
    }
    
    function getBundlePath() {
        return getBasePath() + '/effects';
    }
    
    const BASE_PATH = getBasePath();
    const BUNDLE_PATH = getBundlePath();
    
    // Namespace order for effect selection
    const EFFECT_DIRS = [
        { namespace: 'synth', label: 'Synth (Generators)' },
        { namespace: 'filter', label: 'Filter (Processors)' },
        { namespace: 'mixer', label: 'Mixer (Blend/Composite)' },
        { namespace: 'render', label: 'Render (Utilities)' },
        { namespace: 'points', label: 'Points (Particle/Agent)' },
        { namespace: 'synth3d', label: 'Synth 3D (Volumetric)' },
        { namespace: 'filter3d', label: 'Filter 3D (Volumetric)' },
        { namespace: 'classicNoisedeck', label: 'Classic Noisedeck' },
        { namespace: 'classicNoisemaker', label: 'Classic Noisemaker' }
    ];
    
    let NoisemakerShaders = null;
    let renderer = null;
    let effects = [];
    let currentEffect = null;
    let currentUniforms = {};

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

    function camelToTitleCase(str) {
        const spaced = camelToSpaceCase(str);
        return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    }

    /**
     * Create a control element for an effect parameter
     */
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

    /**
     * Build controls for an effect
     */
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
        const uniformMap = {};
        const globals = effect.globals;

        for (const [key, spec] of Object.entries(globals)) {
            if (spec.ui && spec.ui.control === false) continue;
            if (spec.type === 'surface') continue;

            values[key] = spec.default;
            uniformMap[key] = spec.uniform || key;

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

    /**
     * Get helper functions for DSL generation
     */
    function getHelpers() {
        const isStarterEffect = NoisemakerShaders.isStarterEffect;
        const hasTexSurfaceParam = NoisemakerShaders.hasTexSurfaceParam;
        const is3dGenerator = NoisemakerShaders.is3dGenerator;
        const is3dProcessor = NoisemakerShaders.is3dProcessor;
        
        const hasExplicitTexParam = NoisemakerShaders.hasExplicitTexParam || function(effect) {
            if (!effect || !effect.instance || !effect.instance.globals) return false;
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
                if (spec.type === 'volume' && !volParam) volParam = key;
                if (spec.type === 'geometry' && !geoParam) geoParam = key;
            }
            return { volParam, geoParam };
        };
        
        return { isStarterEffect, hasTexSurfaceParam, is3dGenerator, is3dProcessor, hasExplicitTexParam, getVolGeoParams };
    }

    /**
     * Build DSL source for an effect - matches demo/shaders patterns
     */
    function buildDslSource(effect) {
        if (!effect || !effect.instance) return '';

        const { isStarterEffect, hasTexSurfaceParam, is3dGenerator, is3dProcessor, hasExplicitTexParam, getVolGeoParams } = getHelpers();

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

        // Special case: pointsEmit and pointsRender must be paired
        if (funcName === 'pointsEmit' || funcName === 'pointsRender') {
            return `search points, synth, render\n\nnoise()\n  .pointsEmit()\n  .physical()\n  .pointsRender()\n  .write(o0)\n\nrender(o0)`;
        }

        // Points namespace behaviors need pointsEmit before and pointsRender after
        if (effect.namespace === 'points') {
            const pointsRenderArgs = funcName === 'attractor' ? 'viewMode: ortho' : '';
            return `search points, synth, render\n\nnoise()\n  .pointsEmit()\n  .${funcName}()\n  .pointsRender(${pointsRenderArgs})\n  .write(o0)\n\nrender(o0)`;
        }

        const starter = isStarterEffect(effect);
        const hasTex = hasTexSurfaceParam(effect);
        const hasExplicitTex = hasExplicitTexParam(effect);
        const { volParam, geoParam } = getVolGeoParams(effect);
        const hasVolGeo = volParam && geoParam;

        const noiseCall = 'noise(seed: 1, ridges: true)';

        // 3D volume generators
        if (is3dGenerator(effect)) {
            if (hasVolGeo) {
                return `search synth3d, filter3d, render\n\nnoise3d(volumeSize: x32)\n  .write3d(vol0, geo0)\n\n${funcName}(${volParam}: read3d(vol0, geo0), ${geoParam}: read3d(vol0, geo0))\n  .render3d()\n  .write(o0)\n\nrender(o0)`;
            }
            return `search synth3d, filter3d, render\n\n${funcName}()\n  .render3d()\n  .write(o0)\n\nrender(o0)`;
        }

        // Effects with explicit vol/geo parameters
        if (hasVolGeo) {
            return `search synth3d, filter3d, render\n\nnoise3d(volumeSize: x32)\n  .write3d(vol0, geo0)\n\n${funcName}(${volParam}: read3d(vol0, geo0), ${geoParam}: read3d(vol0, geo0))\n  .render3d()\n  .write(o0)\n\nrender(o0)`;
        }

        // Effects with explicit tex param
        if (hasExplicitTex) {
            if (starter) {
                return `${searchDirective}${noiseCall}\n  .write(o0)\n\n${funcName}(tex: read(o0))\n  .write(o1)\n\nrender(o1)`;
            } else {
                return `${searchDirective}${noiseCall}\n  .write(o0)\n\nnoise(seed: 2, ridges: true)\n  .${funcName}(tex: read(o0))\n  .write(o1)\n\nrender(o1)`;
            }
        }

        if (starter) {
            if (hasTex) {
                const sourceSurface = 'o0';
                const outputSurface = 'o1';
                return `${searchDirective}${noiseCall}\n  .write(${sourceSurface})\n\n${funcName}(tex: read(${sourceSurface}))\n  .write(${outputSurface})\n\nrender(${outputSurface})`;
            }
            return `${searchDirective}${funcName}()\n  .write(o0)\n\nrender(o0)`;
        } else if (hasTex) {
            return `${searchDirective}${noiseCall}\n  .write(o0)\n\nnoise(seed: 2, ridges: true)\n  .${funcName}(tex: read(o0))\n  .write(o1)\n\nrender(o1)`;
        } else if (is3dProcessor(effect)) {
            const renderSuffix = funcName === 'render3d' ? '' : '\n  .render3d()';
            return `search synth3d, filter3d, render\n\nnoise3d(volumeSize: x32)\n  .${funcName}()${renderSuffix}\n  .write(o0)\n\nrender(o0)`;
        } else {
            return `${searchDirective}${noiseCall}\n  .${funcName}()\n  .write(o0)\n\nrender(o0)`;
        }
    }

    /**
     * Extract effect names from DSL for loading dependencies
     */
    function extractEffectNamesFromDsl(dsl, manifest) {
        const effectsList = [];
        if (!dsl || typeof dsl !== 'string') return effectsList;

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
                    if (!effectsList.find(e => e.effectId === effectId)) {
                        effectsList.push({ effectId, namespace, name });
                    }
                }
            }
        }

        return effectsList;
    }

    /**
     * Render markdown help content to HTML
     */
    function renderHelp(markdown) {
        if (!markdown) return '<p><em>No documentation available for this effect.</em></p>';
        
        // Use marked.js if available
        if (window.marked && window.marked.parse) {
            return window.marked.parse(markdown);
        }
        
        // Fallback: very basic markdown rendering
        return '<pre>' + escapeHtml(markdown) + '</pre>';
    }

    /**
     * Select and display an effect
     */
    async function selectEffect(effectPath) {
        const select = document.getElementById('effect-ref-select');
        const titleEl = document.getElementById('effect-ref-title');
        const descriptionEl = document.getElementById('effect-ref-description');
        const helpContentEl = document.getElementById('effect-ref-help-content');
        const dslExampleEl = document.getElementById('effect-ref-dsl-example');
        const paramsContainer = document.getElementById('effect-ref-params');
        const canvas = document.getElementById('effect-ref-canvas');
        const loadingEl = document.getElementById('effect-ref-loading');

        const [namespace, name] = effectPath.split('/');
        
        const placeholderEntry = effects.find(e => e.namespace === namespace && e.name === name);
        
        if (!placeholderEntry) {
            helpContentEl.innerHTML = `<p class="error">Effect ${effectPath} not found</p>`;
            return;
        }

        // Show loading state
        loadingEl.style.display = 'block';
        loadingEl.textContent = `Loading ${name}...`;
        canvas.style.opacity = '0.5';

        try {
            // Load the effect using CanvasRenderer
            const effectId = `${namespace}/${name}`;
            const loadedEffect = await renderer.loadEffect(effectId);
            
            placeholderEntry.instance = loadedEffect.instance;
            placeholderEntry.loaded = true;
            // Help is attached to the instance by the bundle loader
            placeholderEntry.help = loadedEffect.instance.help || null;
            currentEffect = placeholderEntry;

            // Update title
            titleEl.textContent = camelToTitleCase(name);
            
            // Update description from effect definition
            const description = currentEffect.instance.description || 
                               renderer.getEffectDescription(effectId) ||
                               `${camelToTitleCase(namespace)} effect`;
            descriptionEl.textContent = description;
            
            // Render help documentation
            helpContentEl.innerHTML = renderHelp(placeholderEntry.help);

            // Build DSL example
            const dsl = buildDslSource(currentEffect);
            dslExampleEl.textContent = dsl;

            // Build controls
            const controlResult = buildControlsForEffect(paramsContainer, currentEffect.instance, (newValues, uniformMap) => {
                currentUniforms = newValues;
                if (renderer._pipeline) {
                    for (const [k, v] of Object.entries(newValues)) {
                        const uniformName = uniformMap[k] || k;
                        renderer._pipeline.setUniform(uniformName, v);
                    }
                }
            });
            currentUniforms = controlResult.values;

            // Dispose old pipeline and build new one
            await renderer.dispose({ loseContext: false, resetCanvas: false });

            // Load dependencies
            const effectsInDsl = extractEffectNamesFromDsl(dsl, renderer.manifest);
            const effectIdsToLoad = effectsInDsl
                .map(e => e.effectId)
                .filter(id => !renderer.loadedEffects.has(id) && renderer.manifest[id]);
            
            if (effectIdsToLoad.length > 0) {
                loadingEl.textContent = 'Loading dependencies...';
                await renderer.loadEffects(effectIdsToLoad);
            }

            loadingEl.textContent = 'Compiling shaders...';
            await renderer.compile(dsl);
            renderer.start();

            canvas.style.opacity = '1';
            loadingEl.style.display = 'none';

        } catch (e) {
            console.error('Failed to load effect:', e);
            helpContentEl.innerHTML = `<p class="error">Error loading effect: ${e.message || e}</p>`;
            canvas.style.opacity = '1';
            loadingEl.style.display = 'none';
        }
    }

    /**
     * Initialize the effect reference page
     */
    async function init() {
        const select = document.getElementById('effect-ref-select');
        const canvas = document.getElementById('effect-ref-canvas');
        const loadingEl = document.getElementById('effect-ref-loading');
        const randomBtn = document.getElementById('effect-ref-random');

        if (!select || !canvas) {
            console.error('Effect reference: missing required elements');
            return;
        }

        loadingEl.style.display = 'block';
        loadingEl.textContent = 'Loading shader library...';

        try {
            await ensureCoreBundleLoaded();
        } catch (e) {
            console.error('Failed to load shader core:', e);
            document.getElementById('effect-ref-help-content').innerHTML = 
                `<p class="error">Failed to load shader library: ${e.message}</p>`;
            loadingEl.style.display = 'none';
            return;
        }

        // Create renderer
        const CanvasRenderer = NoisemakerShaders.CanvasRenderer;
        if (!CanvasRenderer) {
            document.getElementById('effect-ref-help-content').innerHTML = 
                '<p class="error">CanvasRenderer not available</p>';
            loadingEl.style.display = 'none';
            return;
        }

        try {
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
            document.getElementById('effect-ref-help-content').innerHTML = 
                `<p class="error">Failed to create renderer: ${e.message || e}</p>`;
            loadingEl.style.display = 'none';
            return;
        }

        // Load manifest
        try {
            await renderer.loadManifest();
        } catch (e) {
            console.error('Failed to load manifest:', e);
            document.getElementById('effect-ref-help-content').innerHTML = 
                `<p class="error">Failed to load effects manifest: ${e.message}</p>`;
            loadingEl.style.display = 'none';
            return;
        }

        // Build effects list
        effects = [];
        for (const dir of EFFECT_DIRS) {
            const effectNames = renderer.getEffectsFromManifest(dir.namespace);
            for (const effectName of effectNames) {
                const effectId = `${dir.namespace}/${effectName}`;
                effects.push({
                    namespace: dir.namespace,
                    name: effectName,
                    description: renderer.getEffectDescription(effectId),
                    instance: null,
                    loaded: false,
                    help: null
                });
            }
        }

        // Populate select dropdown with optgroups
        select.innerHTML = '';
        
        const grouped = {};
        effects.forEach(effect => {
            if (!grouped[effect.namespace]) {
                grouped[effect.namespace] = [];
            }
            grouped[effect.namespace].push(effect);
        });

        // Sort: non-classic first, then classic
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
            
            // Find display label for namespace
            const dirInfo = EFFECT_DIRS.find(d => d.namespace === namespace);
            optgroup.label = dirInfo ? dirInfo.label : camelToTitleCase(namespace);
            
            effectList.sort((a, b) => a.name.localeCompare(b.name)).forEach(effect => {
                const option = document.createElement('option');
                option.value = `${namespace}/${effect.name}`;
                option.textContent = camelToTitleCase(effect.name);
                if (effect.description) {
                    option.title = effect.description;
                }
                optgroup.appendChild(option);
            });
            
            select.appendChild(optgroup);
        });

        // Event listeners
        select.addEventListener('change', () => {
            selectEffect(select.value);
        });

        if (randomBtn) {
            randomBtn.addEventListener('click', () => {
                const newSeed = Math.floor(Math.random() * 100) + 1;
                if (renderer._pipeline) {
                    renderer._pipeline.setUniform('seed', newSeed);
                }
            });
        }

        loadingEl.style.display = 'none';

        // Load default effect (noise is a good starting point)
        const defaultEffect = effects.find(e => e.namespace === 'synth' && e.name === 'noise') 
                           || effects[0];
        if (defaultEffect) {
            select.value = `${defaultEffect.namespace}/${defaultEffect.name}`;
            await selectEffect(`${defaultEffect.namespace}/${defaultEffect.name}`);
        }
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
