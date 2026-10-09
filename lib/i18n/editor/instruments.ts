/** The synth preset "Strings" means an ensemble, distinct from guitar strings. */
export function editorInstrumentName(label:string,t:(source:string)=>string) {
 return t(label==="Strings" ? "String ensemble" : label);
}
