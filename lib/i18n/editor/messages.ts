import english from "./en.json";
const templates = Object.keys(english).filter(source=>/\{value\d+\}/.test(source)).map(source=>{
  const names=Array.from(source.matchAll(/\{(value\d+)\}/g),match=>match[1]);
  const pattern=new RegExp("^"+source.split(/\{value\d+\}/g).map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("(.*?)")+"$");
  return {source,names,pattern};
});
/** Localize generated labels/errors at presentation time without changing stored names or IDs. */
export function editorTemplate(source:string): {source:string; values:Record<string,string>} | null {
  if(source.length<6||!/[a-z]/.test(source))return null;
  for(const template of templates){
    const match=source.match(template.pattern);
    if(match)return {source:template.source,values:Object.fromEntries(template.names.map((name,index)=>[name,match[index+1]]))};
  }
  return null;
}
