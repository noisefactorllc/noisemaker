.. _releases:

Releases
========

Noisemaker is a monorepo with three release tracks: Python, JavaScript, and Shaders. The project version is defined in ``pyproject.toml`` (currently pre-1.0).

Workflows
---------

Python (``python.yml``)
^^^^^^^^^^^^^^^^^^^^^^^

Runs on push/PR to ``main`` when ``noisemaker/``, ``pyproject.toml``, or related files change.

- **Verify only** -- tests (pytest across Python 3.10-3.12 on Linux/macOS/Windows), lint (black, ruff), and type-check (mypy).
- No publishing step. Python releases are repo-only for now.

JavaScript (``js.yml``)
^^^^^^^^^^^^^^^^^^^^^^^^

Runs on push/PR to ``main`` when ``js/``, ``scripts/``, or related files change.

- **PR / push**: lint (ESLint) and tests run in parallel.
- **Push to main** (after tests pass): builds browser bundles (``noisemaker.bundle.js``, ``.min.js``, ``.esm.js``, ``.cjs``), a CLI bundle, and standalone executables for Linux x64, macOS arm64, and Windows x64.
- **Snapshot release**: a GitHub pre-release tagged ``{version}-SNAPSHOT`` is created (or replaced) with all JS bundles and platform executables. The snapshot is updated on every qualifying push to ``main``.

Shaders (``shaders.yml``)
^^^^^^^^^^^^^^^^^^^^^^^^^^

Runs on push/PR to ``main`` when ``shaders/``, ``scripts/``, ``demo/``, or related files change.

- **PR / push**: DSL language tests, Playwright render tests (WebGL2), and structure tests.
- **Push to main** (after tests pass): builds shader bundles and packages them as ``noisemaker-shaders.tar.gz``.
- **Site deploy**: the demo site is built and synced to S3 with a CloudFront invalidation.

Tagged release (``release.yml``)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Triggered by pushing a ``v*`` tag.

- Builds all artifacts in parallel: JS browser bundles, CLI bundle, standalone executables (Linux/macOS/Windows), and shader bundles.
- Creates a GitHub release with auto-generated notes and attaches all artifacts.

Downstream triggers (``trigger-noisedeck.yml``)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Runs on push to ``main``/``master`` when ``shaders/`` or ``demo/shaders/`` change. Also supports manual dispatch.

- Sends ``repository_dispatch`` events to downstream noisedeck repos (noisedeck, shade, sharing, polymorphic, foundry, layers) so they can pull the latest noisemaker changes.

Release Artifacts
-----------------

.. list-table::
   :header-rows: 1
   :widths: 30 25 20

   * - Artifact
     - Format
     - Included in
   * - Browser bundles
     - ``.bundle.js``, ``.min.js``, ``.esm.js``, ``.cjs``
     - Snapshot, Tagged
   * - CLI bundle
     - built via ``build:cli``
     - Snapshot, Tagged
   * - Standalone CLI (Linux x64)
     - ``.tar.gz``
     - Snapshot, Tagged
   * - Standalone CLI (macOS arm64)
     - ``.tar.gz``
     - Snapshot, Tagged
   * - Standalone CLI (Windows x64)
     - ``.zip``
     - Snapshot, Tagged
   * - Shader bundle
     - ``.tar.gz``
     - Tagged

Release Cadence
---------------

- **Python**: repo-only (CI verification). No published packages yet.
- **JavaScript snapshots**: updated automatically on every push to ``main``.
- **Tagged releases** (all artifacts including shader bundles): released at significant intervals during the pre-1.0 period. Once the project reaches 1.0, tagged releases will be cut on every commit.
