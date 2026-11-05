import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {createGuestSnapshot} from "../../lib/gteGuestDraft";
const source=ts.createSourceFile("editor.tsx",readFileSync("pages/gte/[editor_id].tsx","utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let expression:ts.Expression|undefined;
function visit(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==="hasSessionContent") expression=node.initializer;ts.forEachChild(node,visit);}
visit(source);
if(!expression)throw new Error("Guest restore guard missing");
const script="result="+expression.getText(source);
describe("guest editor browser recovery guard",()=>{
 it("does not let a named blank server session suppress the browser backup",()=>{
  const scope={normalized:{name:"My song",editors:[createGuestSnapshot()]},result:true};
  vm.runInNewContext(script,scope);expect(scope.result).toBe(false);
 });
 it.each(["notes","chords","rests","loops"])("recognizes server %s as content",kind=>{
  const lane=createGuestSnapshot();
  if(kind==="notes")lane.notes=[{} as any];
  if(kind==="chords")lane.chords=[{} as any];
  if(kind==="rests")lane.notation={rests:[{} as any]};
  if(kind==="loops")lane.drumLoops=[{} as any];
  const scope={normalized:{name:"Untitled",editors:[lane]},result:false};
  vm.runInNewContext(script,scope);expect(scope.result).toBe(true);
 });
});
