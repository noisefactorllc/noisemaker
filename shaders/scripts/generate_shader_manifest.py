#!/usr/bin/env python3
"""Generate a single top-level shader manifest for all effects."""

import json
import re
from pathlib import Path

# Resolve paths relative to this script's location
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent.parent  # shaders/scripts -> shaders -> project root
EFFECTS_ROOT = PROJECT_ROOT / "shaders" / "effects"
OUTPUT_FILE = EFFECTS_ROOT / "manifest.json"

# Regex to extract description from definition.js
DESCRIPTION_RE = re.compile(r'description:\s*["\']([^"\']*)["\']')

# Known pipeline inputs that indicate a non-starter effect
PIPELINE_INPUTS = {
    'inputTex', 'inputTex3d',
    'o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'
}


def extract_description(effect_dir):
    """Extract description from definition.js."""
    definition_file = effect_dir / "definition.js"
    if not definition_file.exists():
        return None
    try:
        content = definition_file.read_text(encoding="utf-8")
        match = DESCRIPTION_RE.search(content)
        if match:
            return match.group(1)
    except Exception:
        pass
    return None


def is_starter_effect(effect_dir):
    """
    Determine if an effect is a starter effect.

    A starter effect is one that doesn't require pipeline input - it generates
    its own output without needing inputTex, inputTex3d, or output surfaces.

    Returns True if starter, False if filter/non-starter, None if can't determine.
    """
    definition_file = effect_dir / "definition.js"
    if not definition_file.exists():
        return None

    try:
        content = definition_file.read_text(encoding="utf-8")

        # Look for passes array
        # This is a simplified parse - look for inputs in passes
        passes_match = re.search(r'passes:\s*\[', content)
        if not passes_match:
            # No passes = starter effect (or not properly defined)
            return True

        # Find the passes section and check for pipeline inputs
        # Look for patterns like: inputTex: "inputTex" or inputTex: 'inputTex'
        # Also check for input keys that reference pipeline surfaces
        for pipeline_input in PIPELINE_INPUTS:
            # Check for input bindings like: inputTex: "inputTex"
            pattern1 = rf'\binputs:\s*\{{[^}}]*{pipeline_input}\s*:'
            if re.search(pattern1, content):
                return False

            # Check for input values like: someInput: "inputTex"
            pattern2 = rf':\s*["\']?{pipeline_input}["\']?\s*[,\}}]'
            # Only count if it's in an inputs block
            inputs_section = re.findall(r'inputs:\s*\{[^}]*\}', content)
            for inputs in inputs_section:
                if re.search(pattern2, inputs):
                    return False

        # No pipeline inputs found in any pass
        return True

    except Exception:
        return None


def scan_effect(effect_dir):
    """Scan shader files for a single effect."""
    result = {"glsl": {}, "wgsl": {}}
    
    glsl_dir = effect_dir / "glsl"
    if glsl_dir.exists():
        for f in glsl_dir.iterdir():
            if f.suffix == ".glsl":
                result["glsl"][f.stem] = "combined"
            elif f.suffix == ".vert":
                if f.stem not in result["glsl"]:
                    result["glsl"][f.stem] = {}
                if isinstance(result["glsl"][f.stem], dict):
                    result["glsl"][f.stem]["v"] = 1
            elif f.suffix == ".frag":
                if f.stem not in result["glsl"]:
                    result["glsl"][f.stem] = {}
                if isinstance(result["glsl"][f.stem], dict):
                    result["glsl"][f.stem]["f"] = 1
    
    wgsl_dir = effect_dir / "wgsl"
    if wgsl_dir.exists():
        for f in wgsl_dir.iterdir():
            if f.suffix == ".wgsl":
                result["wgsl"][f.stem] = 1
    
    # Clean up empty dicts
    if not result["glsl"]:
        del result["glsl"]
    if not result["wgsl"]:
        del result["wgsl"]
    
    # Return empty dict for effects with no shaders (e.g., texture-only effects like render3d)
    # This allows them to be registered in the manifest even without shader files
    return result

def main():
    manifest = {}
    
    for namespace in ["classicBasics", "classicNoisedeck", "classicNoisemaker", "filter", "mixer", "synth", "stateful", "vol"]:
        ns_dir = EFFECTS_ROOT / namespace
        if not ns_dir.exists():
            continue
        
        for effect_dir in sorted(ns_dir.iterdir()):
            if not effect_dir.is_dir():
                continue
            if not (effect_dir / "definition.js").exists():
                continue
            
            effect_id = f"{namespace}/{effect_dir.name}"
            effect_manifest = scan_effect(effect_dir)
            # Extract and include description if available
            description = extract_description(effect_dir)
            if description:
                effect_manifest["description"] = description
            # Check if this is a starter effect
            starter = is_starter_effect(effect_dir)
            if starter is not None:
                effect_manifest["starter"] = starter
            # Include all effects that have a definition.js, even if they have no shaders
            manifest[effect_id] = effect_manifest
    
    with open(OUTPUT_FILE, "w") as f:
        json.dump(manifest, f, separators=(',', ':'), sort_keys=True)
    
    print(f"Generated {OUTPUT_FILE} ({len(manifest)} effects)")

if __name__ == "__main__":
    main()
