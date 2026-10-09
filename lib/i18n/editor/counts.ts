import type { AppLocale } from "../locale";
type CountUnit="bars"|"notes"|"chords"|"hits";
const forms: Record<"en"|"pt-BR"|"es"|"pl",Record<CountUnit,readonly string[]>>={
 en:{bars:["bar","bars"],notes:["note","notes"],chords:["chord","chords"],hits:["hit","hits"]},
 "pt-BR":{bars:["compasso","compassos"],notes:["nota","notas"],chords:["acorde","acordes"],hits:["batida","batidas"]},
 es:{bars:["compás","compases"],notes:["nota","notas"],chords:["acorde","acordes"],hits:["golpe","golpes"]},
 pl:{bars:["takt","takty","taktów"],notes:["nuta","nuty","nut"],chords:["akord","akordy","akordów"],hits:["uderzenie","uderzenia","uderzeń"]},
};
export function editorCount(count:number,unit:CountUnit,locale:AppLocale):string {
 const number=new Intl.NumberFormat(locale,{numberingSystem:"latn"}).format(count);
 if(locale==="zh-Hans")return `${number}${{bars:" 个小节",notes:" 个音符",chords:" 个和弦",hits:" 个鼓点"}[unit]}`;
 if(locale==="ja")return unit==="bars" ? `${number}小節` : `${{notes:"音符",chords:"コード",hits:"ドラムヒット"}[unit]}${number}個`;
 if(locale==="ko")return unit==="bars" ? `${number}마디` : `${{notes:"음표",chords:"코드",hits:"드럼 타격"}[unit]} ${number}개`;
 if(locale==="ar")return `${{bars:"الموازير",notes:"النغمات",chords:"الكوردات",hits:"الضربات"}[unit]}: ${number}`;
 const plural=new Intl.PluralRules(locale).select(count);
 const index=plural==="one" ? 0 : locale==="pl" && plural!=="few" ? 2 : 1;
 return `${number} ${forms[locale][unit][index]}`;
}
