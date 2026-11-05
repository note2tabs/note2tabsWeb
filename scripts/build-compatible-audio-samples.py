"""Regenerate committed MP3 fallbacks with ffmpeg; not run during deployment."""
import concurrent.futures
import json
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[1] / "public" / "sound_samples"
manifest = json.loads((root / "manifest.json").read_text())
sources = {
    root / entry["folder"] / filename
    for entry in manifest
    for filename in entry["samples"].values()
    if not filename.startswith("mute_")
}
sources.update(root / "drum1" / f"{stem}.opus" for stem in
               ("cymbal", "closed_hi_hat", "open_hi_hat", "bass", "snare", "kick"))

def convert(source):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(source),
                    "-map_metadata", "-1", "-c:a", "libmp3lame", "-q:a", "2",
                    str(source.with_suffix(".mp3"))], check=True)

if __name__ == "__main__":
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(convert, sorted(sources)))
    print(f"Generated {len(sources)} MP3 fallbacks")
