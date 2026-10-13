Shuffleset: audio visualization within a media player
=====================================================

`Open Shuffleset <https://shuffleset.stream/>`_

Abstract
--------

Shuffleset adds a Noisemaker visualizer to a media player through the browser's audio analysis interface. The existing audio element supplies the sound. An analyzer provides frequency and waveform data to the engine, which renders a scope with feedback and lens effects. Playlist selection, playback controls, and cover art remain application features. This case demonstrates a contained graphics integration within an existing media workflow. [S1]_ [S2]_

1. Use case and requirements
----------------------------

A listener selects a set or shuffled playback and uses the player's normal transport controls. The visualizer responds to the track already playing. It shares the audio view with cover art and the track list, so visual output complements the playback workflow. [S1]_

The integration must:

* Analyze the same audio element that plays the selected track.
* Supply waveform and frequency data to effects that need them.
* Retain the player's track selection and transport behavior.
* Handle browser restrictions on starting an audio context.
* Release analysis and graphics resources when the view closes. [S1]_ [S2]_

These requirements favor an adapter around the existing player. The graphics engine needs audio data and a canvas. It does not need to own the playlist, media catalog, or playback controls. [S1]_ [S2]_

2. Integration surface
----------------------

``NoisemakerRenderer`` wraps ``CanvasRenderer``. It loads the effect manifest, resolves the effects referenced by the visual program, and compiles that program. Its audio adapter creates an ``AudioContext`` and an ``AnalyserNode``. The existing media element connects through the analyzer to the audio destination. [S2]_

The analyzer uses a 256-sample transform. The wrapper allocates arrays for 128 frequency bins and 256 waveform samples, then reuses them during analysis. The following excerpt shows the complete frame-update method after audio setup. [S2]_

.. code-block:: javascript
   :caption: Feed browser audio analysis into the engine

   _audioUpdate() {
       if (!this._audioEnabled) return
       this._audioState.updateFromAnalyser(this._audioAnalyser, 8)
       this._audioAnalyser.getByteFrequencyData(this._fftData)
       this._audioState.setSpectrum(this._fftData)
       this._audioAnalyser.getByteTimeDomainData(this._timeDomainData)
       this._audioState.setWaveform(this._timeDomainData)
       this._audioAnimId = requestAnimationFrame(() => this._audioUpdate())
   }

This method connects standard browser audio analysis to the engine's audio state. The visual program decides how to use that state. A change to the visual treatment can therefore remain a composition change rather than a change to the player's transport code. [S1]_ [S2]_

3. Implementation decisions
---------------------------

The current composition combines a scope with a feedback subchain, warp, and lens processing. Grouped effects let the application describe the treatment as one program. The player does not draw the scope or implement those image effects itself. [S1]_

Audio connection waits until playback starts. If the browser suspends the audio context, the wrapper attempts to resume it and installs a user-gesture fallback. This matters because audible playback passes through the connected context. Audio initialization is part of the media workflow, not merely an optional graphics detail. [S1]_ [S2]_

Visualizer initialization is optional at the view level. If setup fails, the player disposes the renderer and continues with the audio layout. Teardown stops the analysis loop, disconnects the source, closes the audio context, resets audio state, and disposes the rendering pipeline. The adapter owns the resources that the visualizer adds. [S1]_ [S2]_

4. Result and product implications
----------------------------------

The implementation combines reactive visuals with cover art, track lists, sequential playback, and shuffled playback. The visual composition can evolve while the existing player retains its controls and content model. [S1]_

For a developer, the reusable pattern is a small audio-to-engine adapter with a defined lifecycle. A product team can add a visual treatment to an audio experience without making the rendering engine responsible for media management. The separation also supports different compositions for the same player: the sound supplies analysis data, and the selected program determines the image. [S1]_ [S2]_

5. Operating limits
-------------------

A suspended audio context can interrupt audible playback after the source connects through it. Browser evaluation must therefore cover playback, seeking, track changes, and context resume as well as visual output. Shader complexity and canvas dimensions impose a separate rendering workload. The integration's fallback behavior does not replace these playback checks. [S1]_ [S2]_

6. References
-------------

.. [S1] `Audio player and current visualizer composition <https://shuffleset.stream/js/audio-view.js>`_.

.. [S2] `Audio-to-engine integration <https://shuffleset.stream/js/noisemaker/renderer.js>`_.
