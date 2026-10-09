/** Render legacy generated names locally; never rewrite project or track data. */
export function editorName(name:string|null|undefined,t:(source:string,values?:Record<string,string|number>)=>string) {
 if(!name)return t("Untitled");
 if(["Untitled","Untitled tab","Untitled track"].includes(name))return t(name);
 const imported=name.match(/^(MusicXML part|MIDI track) (\d+)$/);
 if(imported)return t(`${imported[1]} {value1}`,{value1:imported[2]});
 const match=name.match(/^(Tab|Track|Editor|Bass|Drums|Chords) (\d+)$/);
 if(match)return match[1]==="Tab" || match[1]==="Track" ? t(`${match[1]} {value1}`,{value1:match[2]}) : `${t(match[1])} ${match[2]}`;
 return name;
}
