#!/usr/bin/env python3
import json
import os
import re
from datetime import datetime, timezone

ASSETS_DIR = "dist/assets"
BASELINE_PATH = ".bundlesize.baseline.json"

def normalize(name: str) -> str:
    """Normalize filename by removing hash."""
    base, ext = os.path.splitext(name)
    # Match pattern: basename-HASH.ext -> basename.ext
    match = re.match(r"^(.*?)(?:-[A-Z0-9])?-[A-Za-z0-9_-]{6,}$", base)
    if match:
        base = match.group(1)
    return base + ext

def main():
    if not os.path.isdir(ASSETS_DIR):
        print(f"Error: {ASSETS_DIR} not found. Run 'bun run build' first.")
        return 1
    
    chunks = {}
    for name in os.listdir(ASSETS_DIR):
        if not (name.endswith(".js") or name.endswith(".css")):
            continue
        path = os.path.join(ASSETS_DIR, name)
        if not os.path.isfile(path):
            continue
        size = os.path.getsize(path)
        norm = normalize(name)
        chunks[norm] = chunks.get(norm, 0) + size
    
    baseline = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "chunks": chunks,
        "total": sum(chunks.values())
    }
    
    with open(BASELINE_PATH, "w", encoding="utf-8") as f:
        json.dump(baseline, f, indent=2, sort_keys=True)
    
    print(f"✓ Baseline generated: {BASELINE_PATH}")
    print(f"  Total chunks: {len(chunks)}")
    print(f"  Total size: {baseline['total']:,} bytes")
    return 0

if __name__ == "__main__":
    exit(main())
