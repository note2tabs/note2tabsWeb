"""Offline build of the GeneralUser acoustic bass and Meatbass pizzicato banks.

Requires ffmpeg and FluidSynth locally, never during deployment. Sources are
provided explicitly; no production services or database are used.
"""
import argparse
import array
import concurrent.futures
import json
import math
import pathlib
import re
import statistics
import struct
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("--soundfont", required=True, type=pathlib.Path)
parser.add_argument("--fluidsynth", required=True, type=pathlib.Path)
parser.add_argument("--meatbass", required=True, type=pathlib.Path)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1] / "public/sound_samples"

def variable_length(number):
    values = [number & 127]
    while number >> 7:
        number >>= 7
        values.insert(0, (number & 127) | 128)
    return bytes(values)

with tempfile.TemporaryDirectory(prefix="n2t-bass-render-") as temp:
    temp = pathlib.Path(temp)
    # Render the complete preset, including layered zones, tuning, envelopes and
    # filters. Extracting raw SF2 PCM would lose those parts of the bass sound.
    roots = list(range(21, 73, 3))
    events = bytearray(b"\0\xff\x51\x03\x07\xa1\x20\0\xc0\x20")
    for index, midi in enumerate(roots):
        events += variable_length(1920 if index else 0) + bytes([0x90, midi, 100])
        events += variable_length(3840) + bytes([0x80, midi, 0])
    events += variable_length(1920) + b"\xff\x2f\0"
    midi_file = temp / "acoustic-bass.mid"
    midi_file.write_bytes(b"MThd" + struct.pack(">IHHH", 6, 0, 1, 480) + b"MTrk" + struct.pack(">I", len(events)) + events)
    rendered = temp / "acoustic-bass.wav"
    subprocess.run([str(args.fluidsynth), "-ni", "-q", "-R", "0", "-C", "0", "-g", "0.8", "-r", "44100", "-F", str(rendered), str(args.soundfont), str(midi_file)], check=True)
    banks = [
        {"id": "bass_acoustic", "label": "Acoustic Bass", "family": "Bass", "folder": "bass_acoustic", "gain": 1, "samples": {}},
        {"id": "bass_upright", "label": "Upright Bass", "family": "Bass", "folder": "bass_upright", "gain": 1, "samples": {}},
    ]
    jobs = []
    for index, midi in enumerate(roots):
        jobs.append((banks[0], midi, rendered, index * 6, 5))
    # At the fixed editor velocity of 100, use the SFZ's 97–127 layer and first
    # round robin. Exclude the percussion/noise key switches from pitched roots.
    sfz = (args.meatbass / "pizz_basic_map.sfz").read_text()
    for group in sfz.split("<group>")[1:]:
        fields = dict(re.findall(r"(\w+)=([^\s]+)", group.split("<region>")[0]))
        if "pitch_keycenter" not in fields or not int(fields.get("lovel", 0)) <= 100 <= int(fields.get("hivel", 127)):
            continue
        filename = re.search(r"sample=(.*)", group).group(1).strip().replace("\\", "/").split("/")[-1]
        if not re.match(r"^(a|c|eb|gb)\d+_vl4_rr1\.wav$", filename):
            continue
        jobs.append((banks[1], int(fields["pitch_keycenter"]), args.meatbass / filename, 0, None))
    if not any(job[0] is banks[1] for job in jobs):
        raise ValueError("No pitched pizzicato regions found")

    def encode(job):
        bank, midi, source, start, length = job
        directory = root / bank["folder"]
        directory.mkdir(exist_ok=True)
        for extension, codec in [("opus", ["-c:a", "libopus", "-b:a", "80k"]), ("mp3", ["-c:a", "libmp3lame", "-q:a", "3"])]:
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(start), "-i", str(source), *(["-t", str(length)] if length else []), "-map_metadata", "-1", *codec, str(directory / f"{midi}.{extension}")], check=True)
        return bank["id"], midi

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(encode, jobs))
    for bank, midi, *_ in jobs:
        bank["samples"][str(midi)] = f"{midi}.opus"
    for bank in banks:
        levels, peaks = [], []
        for filename in bank["samples"].values():
            data = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(root / bank["folder"] / filename), "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1"])
            samples = array.array("f")
            samples.frombytes(data)
            onset = samples[800:12800]
            levels.append(math.sqrt(sum(value * value for value in onset) / len(onset)))
            peaks.append(max(map(abs, samples)))
        bank["gain"] = round(min(8, .12 / statistics.median(levels), .85 / max(peaks)), 3)
        print(f"{bank['id']}: {len(bank['samples'])} roots, gain {bank['gain']}")
    manifest = json.loads((root / "manifest.json").read_text())
    manifest = [entry for entry in manifest if entry["id"] not in {bank["id"] for bank in banks}]
    manifest.extend(banks)
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
