"""Rebuild attack samples accidentally replaced by SFZ release regions.

Run locally with --sources pointing to the extracted sample sources. Never run
during deployment. Keeps source pitch, tuning and loop points in the manifest.
"""
import argparse
import concurrent.futures
import json
import pathlib
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--sources", type=pathlib.Path, required=True)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1] / "public/sound_samples"
manifest = json.loads((root / "manifest.json").read_text())
presets = {
    "accordion": args.sources / "n2t-sources/accordion/Button Accordion HN SFZ+WAV-20240329/PRESET Button Accordion HN tuned.sfz",
    "harmonica": args.sources / "n2t-vcsl-src/harmonica/harmonica.sfz",
    "harpsichord": args.sources / "n2t-vcsl-src/harpsichord/harpsichord.sfz",
}
jobs = []
for bank, preset in presets.items():
    entry = next(row for row in manifest if row["id"] == bank)
    # These presets put the sustained attack group first, release noises second.
    attack = preset.read_text().split("<group>")[1]
    entry.pop("tuning", None)
    entry.pop("loops", None)
    seen = set()
    for region in attack.split("<region>")[1:]:
        fields = dict(re.findall(r"(\w+)=([^\r\n]*?)(?=\s+\w+=|[\r\n]|$)", region))
        midi = fields.get("pitch_keycenter")
        if not midi or midi in seen or midi not in entry["samples"]:
            continue
        seen.add(midi)
        source = preset.parent / fields["sample"].strip().replace("\\", "/")
        probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "stream=sample_rate", "-of", "json", str(source)]))
        rate = int(probe["streams"][0]["sample_rate"])
        if "tune" in fields:
            entry.setdefault("tuning", {})[midi] = float(fields["tune"])
        if "loop_start" in fields and "loop_end" in fields:
            entry.setdefault("loops", {})[midi] = [int(fields["loop_start"]) / rate, int(fields["loop_end"]) / rate]
        jobs.append((source, root / entry["folder"] / entry["samples"][midi], float(fields.get("volume", 0))))
    # Some roots exist only in the release group. Omit those recordings; playback
    # still renders every pitch using the nearest genuine attack sample.
    missing = set(entry["samples"]) - seen
    for midi in missing:
        del entry["samples"][midi]
    if missing:
        print(f"{bank}: omitted release-only roots {sorted(missing)}")

def encode(job):
    source, destination, volume = job
    for extension, codec in [(".opus", ["-c:a", "libopus", "-b:a", "80k"]), (".mp3", ["-c:a", "libmp3lame", "-q:a", "3"])]:
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(source), "-map_metadata", "-1", "-af", f"volume={volume}dB", *codec, str(destination.with_suffix(extension))], check=True)

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(encode, jobs))
(root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Rebuilt {len(jobs)} attack samples in Opus and MP3")
