const {readFileSync,readdirSync,writeFileSync,existsSync} = require("node:fs");
const {join,relative,resolve} = require("node:path");
const {createHash} = require("node:crypto");
const root = resolve(__dirname,"../public/sound_samples");
const versions = {};
function walk(dir) {
  for (const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path = join(dir,entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".opus")) versions[relative(root,path).split("\\").join("/")] = createHash("sha256").update(readFileSync(path)).digest("hex").slice(0,12);
  }
}
walk(root);
const output = resolve(__dirname,"../lib/gteSampleVersions.json"), content = JSON.stringify(versions,null,2)+"\n";
if (!existsSync(output) || readFileSync(output,"utf8") !== content) writeFileSync(output,content);
console.log(`Versioned ${Object.keys(versions).length} sound samples`);
