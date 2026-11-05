"""Decode sample banks in both formats and check silence, duration and loops.

Requires local ffmpeg. Does not alter assets or run during deployment.
Usage: python scripts/audit-playback-samples.py [--all] [--output report.json]
"""
import argparse
import array
import concurrent.futures
import json
import math
import pathlib
import statistics
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--all", action="store_true")
parser.add_argument("--output", type=pathlib.Path)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1] / "public/sound_samples"
banks = [bank for bank in json.loads((root / "manifest.json").read_text()) if args.all or bank.get("family")]

def audit(job):
    bank, midi, filename, extension = job
    path = (root / bank["folder"] / filename).with_suffix(extension)
    decoded = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", "16000", "pipe:1"], capture_output=True, check=True)
    samples = array.array("f")
    samples.frombytes(decoded.stdout)
    duration = len(samples) / 16000
    peak = max(map(abs, samples), default=0)
    onset = samples[800:12800]
    rms = math.sqrt(sum(value * value for value in onset) / max(1, len(onset)))
    loop = bank.get("loops", {}).get(midi)
    if not samples or peak < 0.001 or not math.isfinite(peak):
        raise ValueError(f"Silent/invalid sample: {path}")
    if loop and not 0 <= loop[0] < loop[1] <= duration + .002:
        raise ValueError(f"Invalid sustain loop: {path}: {loop}, duration={duration}")
    return {"bank": bank["id"], "root": midi, "format": extension, "seconds": duration, "peak": peak, "onsetRms": rms, "gain": bank["gain"], "bytes": path.stat().st_size}

jobs = [(bank, midi, filename, extension) for bank in banks for midi, filename in bank["samples"].items() for extension in (".opus", ".mp3")]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    results = list(pool.map(audit, jobs))
for bank in banks:
    rows = [row for row in results if row["bank"] == bank["id"]]
    print(f"{bank['id']}: {len(rows)} files, median onset RMS after gain {statistics.median(row['onsetRms'] * row['gain'] for row in rows):.3f}, max decoded peak after gain {max(row['peak'] * row['gain'] for row in rows):.3f}")
if args.output:
    args.output.write_text(json.dumps(results, indent=2))
print(f"PASS: decoded {len(results)} files from {len(banks)} banks; no silent files or invalid loops")
