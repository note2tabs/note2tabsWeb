Place repo-bundled `.sf2` files in this folder and expose the presets you want in `manifest.json`.

Example:

```json
[
  {
    "id": "acoustic-guitar",
    "label": "Acoustic Guitar",
    "file": "/soundfonts/GeneralUserGS.sf2",
    "bank": 0,
    "preset": 24,
    "gain": 0.9
  },
  {
    "id": "electric-clean",
    "label": "Electric Guitar Clean",
    "file": "/soundfonts/GeneralUserGS.sf2",
    "bank": 0,
    "preset": 27,
    "gain": 0.85
  }
]
```

The `preset` and `bank` values need to match the preset inside the SF2 file you add.
