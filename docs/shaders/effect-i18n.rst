.. _shader-effect-i18n:

Effect String Localization
==========================

Effect-facing text — display names, descriptions, parameter labels, and enum
option labels — can be translated without changing effect definitions, the
manifest, or any existing consumer. The English source of truth stays in the
definitions; translations ship as separate, optional catalogs that consumers
opt into at runtime.

How it works
------------

A generated **English base catalog** lists every human-facing effect string,
keyed by stable IDs derived from identifiers effects already use:

.. code-block:: text

   <namespace>/<effect>                        effect display name
   <namespace>/<effect>#desc                   description
   <namespace>/<effect>.<paramId>              parameter label
   <namespace>/<effect>.<paramId>.<choiceKey>  enum option label
   @ns/<namespace>                             namespace label

The catalog is written to ``shaders/effects/strings.en.json`` and copied to the
CDN next to ``manifest.json`` (``.../effects/strings.en.json``). A translator
copies it to ``strings.<locale>.json`` and translates the values; partial files
are fine — any missing key falls back to English. Names and labels keep the
definition's explicit casing (for example ``Adjust``).

Generating the base catalog
---------------------------

.. code-block:: bash

   npm run strings

Run this whenever you add or remove an effect, or change a ``name``,
``description``, ``ui.label``, or a ``choices`` key. The test
``npm run test:shaders:i18n`` fails if the committed ``strings.en.json`` is out
of date.

Consuming translations
----------------------

The localizer lives on ``CanvasRenderer`` and is **opt-in** — until a consumer
sets a locale, nothing changes and no catalog is fetched:

.. code-block:: javascript

   await renderer.setLocale('fr')              // fetches strings.fr.json (+ en base)
   renderer.getLocale()                         // 'fr'

   // generic lookup: active locale -> en base -> fallback
   renderer.localize('filter/adjust', 'adjust')            // effect name
   renderer.localize('filter/adjust.rotation', 'rotation') // parameter label

   // descriptions are localized transparently through the existing API
   renderer.getEffectDescription('filter/adjust')

   await renderer.setLocale(null)               // back to unchanged English

``localize(id, fallback)`` returns the active-locale value, then the English base
value, then ``fallback``. Pass the consumer's current English (for example the
``camelToSpaceCase`` display) as ``fallback`` so that with no locale set — or a
missing key — the output is exactly today's English.

Backward compatibility
----------------------

- ``manifest.json`` and effect definitions are unchanged.
- ``strings.<locale>.json`` are separate, optional downloads.
- With no locale set, every API returns its previous English value.
- A missing, empty, or unfetchable locale value degrades to the English base,
  then to the caller's fallback. To leave a string untranslated, omit the key
  (an empty value behaves the same — it falls back to English).

Adding a locale
---------------

1. Copy ``shaders/effects/strings.en.json`` to ``strings.<locale>.json``.
2. Translate the values (leave the keys/identifiers untouched).
3. Ship it — the bundler copies ``strings.*.json`` into ``dist``.
4. Consumers call ``renderer.setLocale('<locale>')``.

Not translated
--------------

Identifiers are part of the DSL / uniform contract and are never translated:
``namespace``, ``func``, parameter names, ``choices`` values, ``uniform`` names,
and ``tags``. Parameter ``category`` strings are grouping keys, so they are not
included in the catalog.
