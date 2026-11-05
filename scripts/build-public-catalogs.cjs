const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const locales = ["en", "pt-BR", "es", "ja", "ko", "pl", "ar", "zh-Hans", "fr", "it"];
const directory = path.join(root, "public/i18n/public");
fs.mkdirSync(directory, {recursive:true});
const manifest = {};
for (const locale of locales) {
  let messages = JSON.parse(fs.readFileSync(path.join(root, `lib/i18n/${locale}.json`), "utf8"));
  if (locale === "en") messages = Object.fromEntries(Object.entries(messages).filter(([key,value]) => key !== value));
  const source = "window.__note2tabsPublicMessages=" + JSON.stringify({locale,messages}).replace(/</g, "\\u003c") + ";\n";
  const hash = crypto.createHash("sha256").update(source).digest("hex").slice(0,16);
  const name = `${locale}.${hash}.js`;
  fs.writeFileSync(path.join(directory,name),source);
  manifest[locale] = `/i18n/public/${name}`;
}
fs.writeFileSync(path.join(root,"lib/i18n/publicCatalogAssets.json"),JSON.stringify(manifest,null,2)+"\n");
