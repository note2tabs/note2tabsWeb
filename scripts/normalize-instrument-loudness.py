"""Offline loudness matching; changes manifest gains, never audio or user volume.

Requires local ffmpeg/ffprobe and NumPy. Default is read-only. --write applies
the calibration; --report writes measurements for review. No deployment hook.
"""
import argparse
import concurrent.futures
import hashlib
import json
import math
import pathlib
import re
import statistics
import subprocess
import tempfile

import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("--write", action="store_true")
parser.add_argument("--report", type=pathlib.Path)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1] / "public/sound_samples"
manifest_path = root / "manifest.json"
banks = json.loads(manifest_path.read_text())
cache_dir = pathlib.Path(tempfile.gettempdir()) / "n2t-instrument-loudness-v1"
cache_dir.mkdir(exist_ok=True)
rate = 48000

def include_fallback_peak(measured, path, cached):
    fallback = path.with_suffix(".mp3")
    digest = hashlib.sha256(fallback.read_bytes()).hexdigest()
    if measured.get("mp3Digest") != digest:
        result = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(fallback), "-ar", str(rate), "-f", "f32le", "pipe:1"], capture_output=True, check=True)
        if result.stderr:
            raise ValueError(f"Corrupt fallback {fallback}: {result.stderr.decode(errors='replace')}")
        decoded = result.stdout
        measured["opusPeak"] = measured.get("opusPeak", measured["peak"])
        measured["mp3Peak"] = float(np.max(np.abs(np.frombuffer(decoded, dtype="<f4"))))
        measured["mp3Digest"] = digest
        measured["peak"] = max(measured["opusPeak"], measured["mp3Peak"])
        cached.write_text(json.dumps(measured))
    return measured

def measure(job):
    bank, midi, filename = job
    path = root / bank["folder"] / filename
    loop = bank.get("loops", {}).get(midi)
    digest = hashlib.sha256(path.read_bytes() + json.dumps(loop).encode()).hexdigest()
    cached = cache_dir / f"{digest}.json"
    if cached.exists():
        return bank["id"], midi, include_fallback_peak(json.loads(cached.read_text()), path, cached)
    probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "stream=channels", "-of", "json", str(path)]))
    channels = int(probe["streams"][0]["channels"])
    decoded = subprocess.check_output(["ffmpeg", "-nostdin", "-v", "error", "-i", str(path), "-ar", str(rate), "-f", "f32le", "pipe:1"])
    samples = np.frombuffer(decoded, dtype="<f4").reshape(-1, channels)
    # Web Audio copies a mono buffer into both stereo output channels.
    if channels == 1:
        samples = np.repeat(samples, 2, axis=1)
    if samples.shape[1] != 2 or not len(samples):
        raise ValueError(f"Invalid channel layout: {path}")
    levels = {}
    for duration in (.25, .75, 2):
        length = round((duration + .08) * rate)
        indexes = np.arange(length)
        if loop:
            start, end = [round(point * rate) for point in loop]
            end = min(end, len(samples))
            if end <= start:
                raise ValueError(f"Invalid loop: {path}")
            indexes = np.where(indexes >= end, start + (indexes - start) % (end - start), indexes)
        note = np.zeros((length, 2), dtype="<f4")
        valid = indexes < len(samples)
        note[valid] = samples[indexes[valid]]
        time = np.arange(length) / rate
        envelope = np.minimum(1, time / .005) * np.clip((duration + .08 - time) / .08, 0, 1)
        note *= envelope[:, None]
        # A short repeated passage provides enough gated windows even for 1/16s.
        passage = np.tile(np.vstack((note, np.zeros((round(.10 * rate), 2), dtype="<f4"))), (4, 1))
        result = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-f", "f32le", "-ar", str(rate), "-ac", "2", "-i", "pipe:0", "-af", "ebur128=framelog=verbose", "-f", "null", "-"], input=passage.tobytes(), capture_output=True, check=True)
        matches = re.findall(r"I:\s*(-?[\d.]+) LUFS", result.stderr.decode(errors="replace"))
        if not matches or float(matches[-1]) <= -69:
            raise ValueError(f"No measurable note loudness: {path}")
        levels[str(duration)] = float(matches[-1])
    measured = {"levels": levels, "peak": float(np.max(np.abs(samples)))}
    return bank["id"], midi, include_fallback_peak(measured, path, cached)

jobs = [(bank, midi, filename) for bank in banks for midi, filename in bank["samples"].items()]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    rows = list(pool.map(measure, jobs))

def combined(row):
    # Favor ordinary notes; retain some weight for sustained material. The fast
    # profile is reported independently rather than overboosting slow attacks.
    levels = row["levels"]
    return 10 * math.log10(.7 * 10 ** (levels["0.75"] / 10) + .3 * 10 ** (levels["2"] / 10))

reference = next(bank for bank in banks if bank["id"] == "acoustic")
# Fixed existing acoustic-guitar reference, independent of previously applied
# calibrations, so repeated runs are idempotent and do not drift the master level.
target = statistics.median(combined(row) for bank, midi, row in rows if bank == reference["id"])
report = {"reference": "Acoustic Guitar, original unity gain", "targetLufs": round(target, 2), "banks": []}
for bank in banks:
    measured = [(midi, row) for name, midi, row in rows if name == bank["id"]]
    median = statistics.median(combined(row) for midi, row in measured)
    bank_gain = min(8, 10 ** ((target - median) / 20))
    old_gain = bank["gain"]
    old_sample_gains = bank.get("sampleGains", {})
    sample_gains = {}
    before, after, profiles = [], [], {"0.25": [], "0.75": [], "2": []}
    for midi, row in measured:
        # Limit register corrections to +/-6 dB; keep natural attacks and decay.
        adjustment = max(.5, min(2, 10 ** ((median - combined(row)) / 20)))
        adjustment = min(adjustment, .80 / (row["peak"] * bank_gain))
        sample_gains[midi] = round(adjustment, 6)
        before.append(combined(row) + 20 * math.log10(old_gain * old_sample_gains.get(midi, 1)))
        effective = bank_gain * sample_gains[midi]
        after.append(combined(row) + 20 * math.log10(effective))
        for duration in profiles:
            profiles[duration].append(row["levels"][duration] + 20 * math.log10(effective))
    bank["gain"] = round(bank_gain, 6)
    bank["sampleGains"] = sample_gains
    entry = {"id": bank["id"], "roots": len(measured), "beforeLufs": round(statistics.median(before), 2), "afterLufs": round(statistics.median(after), 2), "gain": bank["gain"], "profileLufs": {duration: round(statistics.median(levels), 2) for duration, levels in profiles.items()}}
    report["banks"].append(entry)
    print(f"{bank['id']}: {entry['beforeLufs']:.1f} -> {entry['afterLufs']:.1f} LUFS; gain {bank['gain']:.3f}")
if args.write:
    manifest_path.write_text(json.dumps(banks, indent=2) + "\n")
if args.report:
    args.report.write_text(json.dumps(report, indent=2) + "\n")
print(f"Matched {len(banks)} banks to {target:.2f} LUFS reference. {'Applied' if args.write else 'Read-only'}.")
