import json
import sys

try:
    with open('.bundlesize.report.json', 'r') as f:
        report = json.load(f)
    
    baseline = report.get('baseline', {})
    current = report.get('current', {})
    
    total_baseline = baseline.get('totalBytes', 0)
    total_current = current.get('totalBytes', 0)
    total_delta = total_current - total_baseline
    total_delta_pct = total_delta / total_baseline if total_baseline > 0 else 0
    
    print(f'Overall status: {report.get("status", "unknown")}')
    print(f'Total baseline: {total_baseline:,} bytes')
    print(f'Total current: {total_current:,} bytes')
    print(f'Total delta: {total_delta:,} bytes ({total_delta_pct:.1%})')
    print()
    print('Failing/Warning chunks:')
    
    chunks = report.get('chunks', {})
    failing_chunks = []
    for name, chunk in chunks.items():
        if chunk.get('status') in ['fail', 'warn']:
            failing_chunks.append((name, chunk))
    
    # Sort by absolute delta descending to see biggest offenders
    failing_chunks.sort(key=lambda x: abs(x[1].get('currentBytes', 0) - x[1].get('baselineBytes', 0)), reverse=True)
    
    for name, chunk in failing_chunks[:50]:
        status = chunk['status']
        baseline_bytes = chunk.get('baselineBytes', 0)
        current_bytes = chunk.get('currentBytes', 0)
        delta = current_bytes - baseline_bytes
        delta_pct = chunk.get('deltaPct', 0)
        print(f"  {name}: {status} - {baseline_bytes:,} -> {current_bytes:,} ({delta:+,} bytes, {delta_pct:.1%})")

except Exception as e:
    print(f'Error reading report: {e}')
