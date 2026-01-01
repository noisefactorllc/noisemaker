.. _shader-effect-reference:

Effect Reference
================

Interactive reference for all shader effects. Select an effect to view its documentation, parameters, and a live demo with DSL usage examples.

.. raw:: html

   <div class="effect-reference-container">
     <div class="effect-reference-header">
       <div class="effect-select-wrapper">
         <label for="effect-ref-select">Effect</label>
         <select id="effect-ref-select">
           <option>Loading effects...</option>
         </select>
       </div>
     </div>
     
     <div class="effect-reference-main">
       <div class="effect-reference-info">
         <h2 id="effect-ref-title">Select an effect</h2>
         <p id="effect-ref-description" class="effect-description"></p>
         
         <div id="effect-ref-help-content" class="effect-help-content">
           <!-- Rendered markdown help will appear here -->
         </div>
         
         <h3>DSL Usage</h3>
         <p class="dsl-usage-intro">Use this effect in your Polymorphic DSL programs:</p>
         <pre id="effect-ref-dsl-example" class="dsl-example"></pre>
       </div>
       
       <div class="effect-reference-demo">
         <div class="effect-ref-canvas-wrapper">
           <canvas id="effect-ref-canvas" width="384" height="384"></canvas>
           <button id="effect-ref-random" class="effect-ref-random-btn">Random</button>
           <div id="effect-ref-loading" class="effect-ref-loading">Loading...</div>
         </div>
         <div id="effect-ref-params" class="effect-ref-params">
           <!-- Dynamic controls will appear here -->
         </div>
       </div>
     </div>
   </div>
   
   <style>
   .effect-reference-container {
     margin: 1.5rem 0;
   }
   
   .effect-reference-header {
     margin-bottom: 1.5rem;
   }
   
   .effect-select-wrapper {
     display: flex;
     align-items: center;
     gap: 1rem;
   }
   
   .effect-select-wrapper label {
     font-weight: 600;
     color: var(--color-content-foreground, #333);
   }
   
   .effect-select-wrapper select {
     flex: 1;
     max-width: 400px;
     padding: 0.5rem;
     font-size: 1rem;
     border: 1px solid var(--color-foreground-border, #ccc);
     border-radius: 4px;
     background: var(--color-background-secondary, #f8f8f8);
     color: var(--color-content-foreground, #333);
   }
   
   .effect-select-wrapper select:focus {
     outline: 2px solid var(--color-brand-primary, #0066cc);
     outline-offset: 1px;
   }
   
   .effect-select-wrapper select option {
     background: var(--color-background-primary, #fff);
     color: var(--color-content-foreground, #333);
   }
   
   .effect-select-wrapper select optgroup {
     font-weight: 600;
     color: var(--color-content-foreground, #333);
   }
   
   .effect-reference-main {
     display: grid;
     grid-template-columns: 1fr 400px;
     gap: 2rem;
     align-items: start;
   }
   
   @media (max-width: 900px) {
     .effect-reference-main {
       grid-template-columns: 1fr;
     }
     .effect-reference-demo {
       order: -1;
     }
   }
   
   .effect-reference-info {
     min-width: 0;
   }
   
   #effect-ref-title {
     margin-top: 0;
     margin-bottom: 0.5rem;
     font-size: 1.5rem;
   }
   
   .effect-description {
     color: #666;
     font-style: italic;
     margin-bottom: 1.5rem;
   }
   
   .effect-help-content {
     margin-bottom: 2rem;
     line-height: 1.6;
   }
   
   .effect-help-content h2 {
     font-size: 1.25rem;
     margin-top: 1.5rem;
     margin-bottom: 0.75rem;
   }
   
   .effect-help-content h3 {
     font-size: 1.1rem;
     margin-top: 1.25rem;
     margin-bottom: 0.5rem;
   }
   
   .effect-help-content table {
     width: 100%;
     border-collapse: collapse;
     margin: 1rem 0;
     font-size: 0.9rem;
   }
   
   .effect-help-content th,
   .effect-help-content td {
     border: 1px solid #ddd;
     padding: 0.5rem 0.75rem;
     text-align: left;
   }
   
   .effect-help-content th {
     background: #f5f5f5;
     font-weight: 600;
   }
   
   .effect-help-content code {
     background: #f5f5f5;
     padding: 0.1rem 0.3rem;
     border-radius: 3px;
     font-size: 0.9em;
   }
   
   .effect-help-content pre {
     background: #f5f5f5;
     padding: 1rem;
     border-radius: 4px;
     overflow-x: auto;
   }
   
   .effect-help-content pre code {
     background: none;
     padding: 0;
   }
   
   .dsl-usage-intro {
     margin-bottom: 0.5rem;
     color: #666;
   }
   
   .dsl-example {
     background: #1e1e1e;
     color: #d4d4d4;
     padding: 1rem;
     border-radius: 4px;
     overflow-x: auto;
     font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
     font-size: 0.875rem;
     line-height: 1.5;
   }
   
   .effect-reference-demo {
     position: sticky;
     top: 1rem;
   }
   
   .effect-ref-canvas-wrapper {
     position: relative;
     border-radius: 4px;
     overflow: hidden;
     background: #000;
   }
   
   #effect-ref-canvas {
     display: block;
     width: 100%;
     height: auto;
   }
   
   .effect-ref-random-btn {
     position: absolute;
     bottom: 8px;
     right: 8px;
     padding: 0.375rem 0.75rem;
     background: rgba(255, 255, 255, 0.9);
     border: none;
     border-radius: 4px;
     font-size: 0.75rem;
     font-weight: 600;
     cursor: pointer;
     transition: background 0.15s;
   }
   
   .effect-ref-random-btn:hover {
     background: #fff;
   }
   
   .effect-ref-loading {
     position: absolute;
     top: 50%;
     left: 50%;
     transform: translate(-50%, -50%);
     background: rgba(0, 0, 0, 0.8);
     color: #fff;
     padding: 0.5rem 1rem;
     border-radius: 4px;
     font-size: 0.875rem;
     display: none;
   }
   
   .effect-ref-params {
     margin-top: 1rem;
     max-height: 300px;
     overflow-y: auto;
   }
   
   .effect-ref-params .shader-live-control {
     display: flex;
     align-items: center;
     gap: 0.75rem;
     margin-bottom: 0.5rem;
     font-size: 0.875rem;
   }
   
   .effect-ref-params .shader-live-control label {
     min-width: 100px;
     text-transform: capitalize;
     color: #666;
   }
   
   .effect-ref-params .shader-live-control input[type="range"] {
     flex: 1;
   }
   
   .effect-ref-params .control-value {
     min-width: 50px;
     text-align: right;
     font-family: monospace;
     font-size: 0.8rem;
     color: #888;
   }
   
   .effect-ref-params .no-params-message {
     color: #888;
     font-style: italic;
   }
   </style>
   
   <script src="../_static/noisemaker-shaders-core.min.js"></script>
   <script src="../_static/marked.min.js"></script>
   <script src="../_static/effect-reference.js"></script>

