# Cosine palette collection. Thanks to @rustysniper1 on Twitter for putting this together.
# https://iquilezles.org/www/articles/palettes/palettes.htm

import json
import os

_SHARE_DIR = os.path.join(os.path.dirname(__file__), "..", "share")
_PALETTES_FILE = os.path.join(_SHARE_DIR, "palettes.json")

with open(_PALETTES_FILE) as f:
    PALETTES: dict[str, dict[str, list[float]]] = json.load(f)
