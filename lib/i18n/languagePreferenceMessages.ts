import type {AppLocale} from "./locale";
const sources=[
 "Choose your preferred language. Your choice is saved in this browser.",
 "Device language: {language}",
 "Saved language: {language}",
 "Save language",
 "Language saved.",
 "Sign in to manage your account.",
 "Language",
] as const;
const translations:Record<AppLocale,readonly string[]>={
 en:sources,
 "pt-BR":["Escolha seu idioma preferido. Sua escolha fica salva neste navegador.","Idioma do dispositivo: {language}","Idioma salvo: {language}","Salvar idioma","Idioma salvo.","Entre para gerenciar sua conta.","Idioma"],
 es:["Elige tu idioma preferido. Tu elección se guarda en este navegador.","Idioma del dispositivo: {language}","Idioma guardado: {language}","Guardar idioma","Idioma guardado.","Inicia sesión para gestionar tu cuenta.","Idioma"],
 ja:["希望する言語を選んでください。選択はこのブラウザーに保存されます。","端末の言語：{language}","保存した言語：{language}","言語を保存","言語を保存しました。","アカウントの管理にはログインしてください。","言語"],
 ko:["원하는 언어를 선택하세요. 선택한 언어는 이 브라우저에 저장됩니다.","기기 언어: {language}","저장한 언어: {language}","언어 저장","언어가 저장되었습니다.","계정을 관리하려면 로그인하세요.","언어"],
 pl:["Wybierz preferowany język. Wybór zostanie zapisany w tej przeglądarce.","Język urządzenia: {language}","Zapisany język: {language}","Zapisz język","Język został zapisany.","Zaloguj się, aby zarządzać kontem.","Język"],
 ar:["اختر لغتك المفضّلة. يُحفظ اختيارك في هذا المتصفّح.","لغة الجهاز: {language}","اللغة المحفوظة: {language}","احفظ اللغة","حُفظت اللغة.","سجّل الدخول لإدارة حسابك.","اللغة"],
 "zh-Hans":["选择您的首选语言。您的选择会保存在此浏览器中。","设备语言：{language}","已保存的语言：{language}","保存语言","语言已保存。","请登录以管理账户。","语言"],
};
export const languagePreferenceMessages=Object.fromEntries(Object.entries(translations).map(([locale,copy])=>[locale,Object.fromEntries(sources.map((source,index)=>[source,copy[index]]))])) as Record<AppLocale,Record<string,string>>;
