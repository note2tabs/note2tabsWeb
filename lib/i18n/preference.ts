import {ALL_LOCALES, normalizeLocale, type AppLocale} from "./locale";
export const LANGUAGE_CHOICE_COOKIE="n2t_locale_choice";
export const LANGUAGE_STORAGE_KEY="n2t:preferred-locale";
const YEAR=365*24*60*60;
export function validLocale(value:unknown):AppLocale|null {
 return typeof value==="string" && ALL_LOCALES.some(locale=>locale.toLowerCase()===value.toLowerCase()) ? normalizeLocale(value) : null;
}
export function cookieValue(cookie:string,name:string) {
 return cookie.split(";").map(part=>part.trim()).find(part=>part.startsWith(name+"="))?.slice(name.length+1);
}
export function savedLanguageChoice(cookie:string):AppLocale|null {
 return cookieValue(cookie,LANGUAGE_CHOICE_COOKIE)==="1" ? validLocale(cookieValue(cookie,"n2t_locale")) : null;
}
export function quickLanguageOptions(device:AppLocale,enabled:(locale:AppLocale)=>boolean):AppLocale[] {
 return device!=="en" && enabled(device) ? ["en",device] : ["en"];
}
export function settingsLanguageOptions(enabled:(locale:AppLocale)=>boolean):AppLocale[] {
 return ALL_LOCALES.filter(enabled);
}
export function saveLanguageChoice(locale:AppLocale) {
 document.cookie=`n2t_locale=${locale}; Path=/; Max-Age=${YEAR}; SameSite=Lax`;
 document.cookie=`${LANGUAGE_CHOICE_COOKIE}=1; Path=/; Max-Age=${YEAR}; SameSite=Lax`;
 try {window.localStorage.setItem(LANGUAGE_STORAGE_KEY,locale);}catch{/* Cookie works when storage is blocked. */}
 window.dispatchEvent(new Event("note2tabs:locale-changed"));
}
export function browserLanguageChoice():AppLocale|null {
 const choice=savedLanguageChoice(document.cookie);
 if(choice)return choice;
 try{return validLocale(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));}catch{return null;}
}
/** Restore expired cookies and migrate prior explicit language selections. */
export function restoreLanguageChoice():AppLocale|null {
 const cookieChoice=savedLanguageChoice(document.cookie);
 if(cookieChoice){
  try {window.localStorage.setItem(LANGUAGE_STORAGE_KEY,cookieChoice);}catch{/* Keep the saved cookie. */}
  return cookieChoice;
 }
 let stored:AppLocale|null=null;
 try {stored=validLocale(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));}catch{/* Device language works without storage. */}
 if(stored)saveLanguageChoice(stored);
 return stored;
}
