import {readFileSync} from "node:fs";
import ts from "typescript";
import {describe,it,expect} from "vitest";
import {ALL_LOCALES} from "../../lib/i18n/locale";
import {translate,registerEditorCatalog} from "../../lib/i18n/translate";
import {TOOL_SELECTION_LABELS} from "../../lib/gteToolSelection";

const files=["components/GteWorkspace.tsx","components/GteOptimizeDialog.tsx","components/GtePropertiesInspector.tsx","components/GteScaleModeMenu.tsx","components/HoverSettingsDropdown.tsx","pages/gte/[editor_id].tsx"];
const notation=new Set(["x","o","i","C","J","S","G","H","L","B","K","M","T","{value1}/{value2}","1/{value1}","L{value1}","R{value1}","{value1} {value2}"]);
const messages=new Set<string>([...Object.values(TOOL_SELECTION_LABELS),"Deselect all"]);
function collectMessage(node:ts.Node){
 if(ts.isStringLiteral(node)){const key=node.text.trim();if(!notation.has(key))messages.add(key);}
 else if(ts.isConditionalExpression(node)){collectMessage(node.whenTrue);collectMessage(node.whenFalse);}
}
for(const file of files){
 const source=ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const visit=(node:ts.Node)=>{
  if(ts.isCallExpression(node)&&node.expression.getText(source)==="t"&&node.arguments[0])collectMessage(node.arguments[0]);
  ts.forEachChild(node,visit);
 };visit(source);
}
// Selection-rule hints and optimization errors are translated at presentation time.
for(const file of ["lib/gteToolSelection.ts","lib/gteOptimization.ts","lib/gteSnapSelectionToKey.ts"]){
 const source=ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true);
 const visit=(node:ts.Node)=>{
  if(ts.isCallExpression(node)&&node.expression.getText(source)==="result"){
   const collect=(value:ts.Node)=>{if(ts.isStringLiteral(value))messages.add(value.text);else if(ts.isConditionalExpression(value)){collect(value.whenTrue);collect(value.whenFalse);}};
   if(node.arguments[1])collect(node.arguments[1]);
  }
  if(ts.isNewExpression(node)&&node.expression.getText(source)==="Error"&&node.arguments?.[0]&&ts.isStringLiteral(node.arguments[0]))messages.add(node.arguments[0].text);
  ts.forEachChild(node,visit);
 };visit(source);
}
describe("new editor design localization",()=>{
 it.each(ALL_LOCALES)("covers every inspector, generation dialog and workspace message in %s",locale=>{
  const catalog=JSON.parse(readFileSync(`lib/i18n/editor/${locale}.json`,"utf8"));
  for(const key of messages)expect(catalog[key],`${locale}: ${key}`).toBeTypeOf("string");
 });
 it.each(ALL_LOCALES.filter(locale=>locale!=="en"))("renders the new %s properties and validation without English fallback",locale=>{
  const catalog=JSON.parse(readFileSync(`lib/i18n/editor/${locale}.json`,"utf8"));registerEditorCatalog(locale,catalog);
  for(const key of ["Note properties","Chord properties","Generate fret positions","Move properties panel","Choose a valid fret position.","Select chords only.","Other keys"]){
   expect(translate(key,locale)).toBe(catalog[key]);expect(translate(key,locale)).not.toBe(key);
  }
  expect(translate("{value1} string · Fret {value2}",locale,{value1:"E",value2:12})).not.toMatch(/\{value\d+\}|string|Fret/);
  const nested=translate("{value1} selection",locale,{value1:translate("Transpose",locale)});
  expect(nested).toContain(catalog.Transpose);
  expect(nested).not.toMatch(/\bTranspose\b/);
 });
});
