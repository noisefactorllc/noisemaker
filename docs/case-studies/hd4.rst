HD4: four-channel video and audio control
=========================================

`Open HD4 <https://hd4.noisefactor.io/>`_

Abstract
--------

HD4 uses Noisemaker to give four video channels a common rendering interface. A channel can contain a camera, clip, image, or generated shader composition. The application combines these channels with preview and program controls, composite layouts, an audio mixer, and recording. This case demonstrates a compact engine boundary inside a larger media system. [H1]_ [H2]_

1. Use case and requirements
----------------------------

An operator prepares a source in preview while another source remains on the program output. The operator then selects CUT, MIX, or WIPE and transfers the prepared source to the program. Picture-in-picture, split, and quad layouts combine sources within the same output. Separate audio controls manage what the audience hears. [H1]_

The implemented workflow requires:

* A common channel interface for generated visuals and captured media.
* Independent preview and program selection.
* Consistent source proportions when cameras, images, and clips have different dimensions.
* Audio routing that can follow video selection or remain independent.
* A final output that the recorder can capture without understanding each source type. [H1]_ [H2]_ [H3]_

These requirements put source rendering below the switcher. Once a channel supplies a canvas, the switcher can work with its output without knowing how the channel produced it. [H2]_ [H3]_

2. Integration surface
----------------------

Each ``ChannelRenderer`` owns one Noisemaker ``CanvasRenderer``. Shader sources provide DSL directly. Camera, video, and image sources use a program with a ``media()`` input. The wrapper loads the required effects, compiles the program, and starts rendering. It reports compilation success or an error to its caller. [H2]_

.. list-table:: Channel boundary
   :header-rows: 1
   :widths: 25 40 35

   * - Input or action
     - Engine connection
     - Application responsibility
   * - Shader source
     - ``loadEffects()`` and ``compile()``
     - Select and retain the program.
   * - Camera, clip, or image
     - ``updateTextureFromSource()``
     - Acquire, decode, and fit the media.
   * - Changed dimensions
     - ``resize()`` and step parameters
     - Choose channel dimensions and fit mode.
   * - Channel output
     - An ordinary canvas
     - Select, compose, and record the program.

The wrapper discovers the media step from the program. It does not assume that every source uses the same texture index. This keeps source upload aligned with the compiled composition. [H2]_

3. Implementation decisions
---------------------------

Media sources first pass through an aspect-preserving fit operation. The application uses a canvas buffer to implement cover or contain behavior. It uploads that fitted image to the media step and updates ``imageSize`` when dimensions change. This gives the program compositor consistently sized channel frames without requiring a separate shader for each source format. [H2]_

``ProgramCompositor`` owns a 2D canvas for the final output. It draws channel frames, applies transitions or layouts, adds an optional key overlay, and applies output effects and fade. Noisemaker handles each channel's visual program. The application retains explicit control over the final composition and operator semantics. [H3]_

The audio mixer remains a separate subsystem. It supplies channel faders, equalization, dynamics, pan, delay, and effect sends. Audio-follow-video, gain sharing, and video-follow-audio provide different automatic behaviors. MIDI mappings, assignable buttons, and memory slots support repeatable operations. MediaRecorder captures the program with audio. [H1]_

4. Result and product implications
----------------------------------

The implemented console combines source preparation, switching, layouts, sound, and recording. Generated visuals participate as regular channels alongside cameras and clips. They do not require a separate output workflow. [H1]_ [H2]_

For a developer, the useful boundary is the rendered channel canvas. It allows a custom switcher to use procedural visuals while retaining its own controls and composition rules. For a product team, this supports tools with specialized operator workflows, such as event consoles or demonstration systems. The reusable engine surface stays concentrated in the channel wrapper, while audio and switching remain independently configurable. [H2]_ [H3]_

5. Operating limits
-------------------

Four channels can require concurrent media decoding, texture uploads, and shader execution. Final composition adds further work. Capacity depends on source types, effect programs, and output dimensions. Qualification for live use should measure switching latency, audio continuity, and synchronization in recorded output with all required channels active. [H2]_ [H3]_

6. References
-------------

.. [H1] `HD4 features and architecture <https://github.com/noisefactorllc/hd4/blob/90afc9759d34bf11c762f9b383514350d6830f6a/README.md>`_.

.. [H2] `Channel renderer <https://github.com/noisefactorllc/hd4/blob/90afc9759d34bf11c762f9b383514350d6830f6a/js/channelRenderer.js>`_.

.. [H3] `Program compositor <https://github.com/noisefactorllc/hd4/blob/90afc9759d34bf11c762f9b383514350d6830f6a/js/programCompositor.js>`_.
