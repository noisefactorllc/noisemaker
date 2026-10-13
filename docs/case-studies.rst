Case Studies
============

These studies examine how applications use Noisemaker to deliver specific media workflows.
Each paper connects user requirements to the rendering interface, implementation decisions, and resulting product capabilities.
Developers can inspect the engine boundary.
Business decision makers can assess which parts of an application reuse the engine and which parts require product-specific work.

1. Scope and methods
--------------------

The collection covers all six Example apps at `demos.noisemaker.app <https://demos.noisemaker.app/>`_, checked on 13 October 2026.
It also covers the featured Noisedeck application, both engine demos, and the existing Shuffleset and Web Design integrations.
The demo index lists ports and source adapters separately, with their own documentation.

The studies use source inspection, current product documentation, and live page retrieval.
Public repository links identify the reviewed revision.
Public application modules provide evidence where repository links are unavailable.
The requirements describe the implemented workflows rather than a historical customer brief.
Results describe implemented capabilities, and product implications explain where those capabilities can apply.
The collection reports no new benchmarks, customer outcomes, or measured development savings.

2. Example applications
-----------------------

These applications use the engine for different tasks: effect exploration, live switching, document editing, camera capture, code-based authoring, and visual performance.
The papers examine the corresponding integration choices.

.. toctree::
   :maxdepth: 1

   case-studies/glitcher
   case-studies/hd4
   case-studies/layers
   case-studies/photobox
   case-studies/polymorphic
   case-studies/visualize

3. Engine authoring and evaluation
----------------------------------

Noisedeck demonstrates a complete creative product around visual and code-based editing.
The engine demos expose the rendering interfaces directly for an initial technical evaluation.

.. toctree::
   :maxdepth: 1

   case-studies/noisedeck
   case-studies/engine-demos

4. Other integrations
---------------------

Shuffleset adds audio-reactive graphics to an existing player.
The web integrations attach procedural graphics to conventional page components.
These cases show how a contained visual feature can use the engine within a broader application.

.. toctree::
   :maxdepth: 1

   case-studies/shuffleset
   case-studies/web-design

5. Reading the integration examples
-----------------------------------

The recurring shader interface consists of a canvas, a program, parameter values, and optional media or audio inputs.
The application selects effects and supplies user interaction, storage, and output policy.
More advanced editors also coordinate compiled graph structure and export resources.
Each paper identifies the responsibilities relevant to its use case.

Five selected JavaScript excerpts show actual integration methods or paths within them.
The examples retain source behavior, with formatting adjusted for the page.
Their surrounding text identifies required class state and omitted setup.
They illustrate specific boundaries and do not replace complete application initialization.

6. Evaluation criteria
----------------------

A product evaluation should define these quantities before comparing results:

* Frame time: elapsed time per rendered frame for a specified program and output size.
* Input latency: elapsed time from a source change to the corresponding visible output.
* Export correctness: complete output with the requested dimensions, duration, and media content.
* Recovery correctness: restored application state and media after a reload or interrupted operation.

Record the browser, device, active backend, engine revision, program, and output dimensions with each measurement.
For the Classic Composer, record the preset, seed, and time-related inputs as well.
Evaluate permissions, storage limits, recording formats, and external services against the intended workflow.
Check application licenses separately from Noisemaker's MIT license.
