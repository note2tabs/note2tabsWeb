const fs = require("fs");
const path = require("path");

const SOURCE_ROOT = path.join(process.cwd(), "data", "chord-fingers-json");
const OUTPUT_PATH = path.join(process.cwd(), "data", "chord-fingerings-index.json");
const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const index = {};

ROOTS.forEach((root) => {
  const rootPath = path.join(SOURCE_ROOT, root);
  if (!fs.existsSync(rootPath)) {
    throw new Error(`Missing chord fingering root folder: ${root}`);
  }

  fs.readdirSync(rootPath)
    .filter((fileName) => fileName.endsWith(".json") && !fileName.includes("_"))
    .sort()
    .forEach((fileName) => {
      const type = path.basename(fileName, ".json");
      const filePath = path.join(rootPath, fileName);
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!Array.isArray(parsed.positions)) return;
      index[`${root}:${type}`] = parsed.positions;
    });
});

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(index)}\n`, "utf8");
console.log(`Wrote ${Object.keys(index).length} chord definitions to ${OUTPUT_PATH}`);
