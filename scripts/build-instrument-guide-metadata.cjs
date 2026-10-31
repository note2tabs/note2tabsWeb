// Run after editing localized guide content; --check is suitable for CI/review.
const fs = require('node:fs');
const path = require('node:path');
const directory = path.join(__dirname, '../data/instrument-guides/localized');
const metadata = Object.fromEntries(fs.readdirSync(directory).filter(file => file.endsWith('.json')).sort().map(file => [
  file.slice(0, -5), Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'))).map(([slug, row]) => [slug, {
    title: row.title, excerpt: row.excerpt, sourceUpdatedAt: row.sourceUpdatedAt,
  }])),
]));
const target = path.join(__dirname, '../lib/i18n/instrumentGuides/metadata.json');
const content = JSON.stringify(metadata, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) throw new Error('Run node scripts/build-instrument-guide-metadata.cjs');
} else fs.writeFileSync(target, content);

const tools = Object.fromEntries(Object.keys(metadata).map(locale => {
  const copy = JSON.parse(fs.readFileSync(path.join(__dirname, `../lib/i18n/instruments/${locale}.json`), 'utf8'));
  const publicCopy = JSON.parse(fs.readFileSync(path.join(__dirname, `../lib/i18n/${locale}.json`), 'utf8'));
  return [locale, Object.fromEntries(['piano', 'bass', 'drums', 'ukulele'].map(instrument => {
    const transcribe = {piano:0, drums:2, ukulele:5}[instrument];
    const editor = {piano:1, drums:3, ukulele:4}[instrument];
    return [instrument, {
      transcribe: {label: instrument === 'bass' ? copy.hub[9] : copy.actions[transcribe], description: instrument === 'bass' ? copy.hub[7] : copy.descriptions[transcribe]},
      editor: {label: instrument === 'bass' ? publicCopy['Bass tab editor'] : copy.actions[editor], description: instrument === 'bass' ? copy.hub[7] : copy.descriptions[editor]},
    }];
  }))];
}));
const toolTarget = path.join(__dirname, '../lib/i18n/instrumentGuides/tools.json');
const toolContent = JSON.stringify(tools, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(toolTarget) || fs.readFileSync(toolTarget, 'utf8') !== toolContent) throw new Error('Regenerate instrument tool labels');
} else fs.writeFileSync(toolTarget, toolContent);
