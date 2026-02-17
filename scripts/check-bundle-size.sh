#!/usr/bin/env bash
set -euo pipefail

BASELINE_PATH=".bundlesize.baseline.json"
REPORT_PATH=".bundlesize.report.json"
ASSETS_DIR="dist/assets"

export BASELINE_PATH REPORT_PATH ASSETS_DIR

python3 - <<'PY'
import json
import os
import re
import sys
from datetime import datetime, timezone

baseline_path = os.environ.get("BASELINE_PATH", ".bundlesize.baseline.json")
report_path = os.environ.get("REPORT_PATH", ".bundlesize.report.json")
assets_dir = os.environ.get("ASSETS_DIR", "dist/assets")

PER_CHUNK_WARN = 0.20
PER_CHUNK_FAIL = 0.50
TOTAL_WARN = 0.15
TOTAL_FAIL = 0.30

if not os.path.isfile(baseline_path):
    print(f"Missing baseline: {baseline_path}")
    sys.exit(1)

if not os.path.isdir(assets_dir):
    print(f"Missing assets dir: {assets_dir}")
    sys.exit(1)

with open(baseline_path, "r", encoding="utf-8") as handle:
    baseline = json.load(handle)

baseline_chunks_raw = baseline.get("chunks", {})


def normalize(name: str) -> str:
    base, ext = os.path.splitext(name)
    match = re.match(r"^(.*?)(?:-[A-Z0-9])?-[A-Za-z0-9_-]{6,}$", base)
    if match:
        base = match.group(1)
    return base + ext


baseline_chunks = {}
for name, size in baseline_chunks_raw.items():
    baseline_chunks[name] = baseline_chunks.get(name, 0) + int(size)

current_chunks = {}
current_sources = {}
for name in os.listdir(assets_dir):
    if not (name.endswith(".js") or name.endswith(".css")):
        continue
    path = os.path.join(assets_dir, name)
    if not os.path.isfile(path):
        continue
    size = os.path.getsize(path)
    norm = normalize(name)
    current_chunks[norm] = current_chunks.get(norm, 0) + size
    current_sources.setdefault(norm, []).append(name)

baseline_total = sum(baseline_chunks.values())
current_total = sum(current_chunks.values())

chunk_reports = {}
chunk_statuses = []
all_chunks = sorted(set(baseline_chunks) | set(current_chunks))

for name in all_chunks:
    baseline_size = baseline_chunks.get(name, 0)
    current_size = current_chunks.get(name, 0)
    delta_bytes = current_size - baseline_size

    if baseline_size > 0:
        delta_pct = delta_bytes / baseline_size
        increase_ratio = delta_pct
    else:
        delta_pct = None
        increase_ratio = 1.0 if current_size > 0 else 0.0

    status = "ok"
    if current_size > baseline_size:
        if increase_ratio >= PER_CHUNK_FAIL:
            status = "fail"
        elif increase_ratio >= PER_CHUNK_WARN:
            status = "warn"

    chunk_statuses.append(status)
    chunk_reports[name] = {
        "baselineBytes": baseline_size,
        "currentBytes": current_size,
        "deltaBytes": delta_bytes,
        "deltaPct": delta_pct,
        "status": status,
        "sources": sorted(current_sources.get(name, [])),
    }

total_delta_bytes = current_total - baseline_total
if baseline_total > 0:
    total_delta_pct = total_delta_bytes / baseline_total
    total_increase_ratio = total_delta_pct
else:
    total_delta_pct = None
    total_increase_ratio = 1.0 if current_total > 0 else 0.0

total_status = "ok"
if current_total > baseline_total:
    if total_increase_ratio >= TOTAL_FAIL:
        total_status = "fail"
    elif total_increase_ratio >= TOTAL_WARN:
        total_status = "warn"

status = "ok"
if "fail" in chunk_statuses or total_status == "fail":
    status = "fail"
elif "warn" in chunk_statuses or total_status == "warn":
    status = "warn"

report = {
    "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "status": status,
    "thresholds": {
        "perChunk": {"warn": PER_CHUNK_WARN, "fail": PER_CHUNK_FAIL},
        "total": {"warn": TOTAL_WARN, "fail": TOTAL_FAIL},
    },
    "baseline": {"totalBytes": baseline_total, "chunks": baseline_chunks},
    "current": {"totalBytes": current_total, "chunks": current_chunks},
    "diff": {
        "total": {
            "deltaBytes": total_delta_bytes,
            "deltaPct": total_delta_pct,
            "status": total_status,
        },
        "chunks": chunk_reports,
    },
}

with open(report_path, "w", encoding="utf-8") as handle:
    json.dump(report, handle, indent=2, sort_keys=False)
    handle.write("\n")

print(f"Bundle size status: {status}")
if status != "ok":
    print(f"Report written to {report_path}")

sys.exit(1 if status == "fail" else 0)
PY
