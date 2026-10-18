import {useEffect,useState} from "react";
import {useLocale} from "../lib/i18n/react";
import type {AppLocale} from "../lib/i18n/locale";
const copy:Record<AppLocale,readonly string[]>={
 en:["Email reminders","Receive occasional reminders to return to your music, including when your credits refresh. You can unsubscribe at any time.","Enable reminders","Disable reminders","Could not update reminders. Please try again."],
 fr:["Rappels par e-mail","Recevez des rappels occasionnels pour reprendre votre musique, notamment lorsque vos crédits sont renouvelés. Vous pouvez vous désinscrire à tout moment.","Activer les rappels","Désactiver les rappels","Impossible de modifier les rappels. Veuillez réessayer."],
 it:["Promemoria via email","Ricevi promemoria occasionali per tornare alla tua musica, anche quando i tuoi crediti si rinnovano. Puoi annullare l’iscrizione in qualsiasi momento.","Attiva i promemoria","Disattiva i promemoria","Impossibile aggiornare i promemoria. Riprova."],
 es:["Recordatorios por correo","Recibe recordatorios ocasionales para retomar tu música, también cuando se renueven tus créditos. Puedes darte de baja en cualquier momento.","Activar recordatorios","Desactivar recordatorios","No se pudieron actualizar los recordatorios. Inténtalo de nuevo."],
 "pt-BR":["Lembretes por e-mail","Receba lembretes ocasionais para voltar à sua música, inclusive quando seus créditos forem renovados. Você pode cancelar a qualquer momento.","Ativar lembretes","Desativar lembretes","Não foi possível atualizar os lembretes. Tente novamente."],
 ja:["メールリマインダー","クレジット更新時などに、音楽の続きを楽しむためのリマインダーを受け取ります。いつでも配信を停止できます。","リマインダーを有効にする","リマインダーを無効にする","リマインダーを更新できませんでした。もう一度お試しください。"],
 ko:["이메일 알림","크레딧이 갱신될 때 등 음악 작업을 이어갈 수 있도록 가끔 알림을 받습니다. 언제든 수신을 거부할 수 있습니다.","알림 활성화","알림 비활성화","알림 설정을 변경하지 못했습니다. 다시 시도해 주세요."],
 pl:["Przypomnienia e-mail","Otrzymuj okazjonalne przypomnienia o powrocie do swojej muzyki, także po odnowieniu kredytów. W każdej chwili możesz zrezygnować.","Włącz przypomnienia","Wyłącz przypomnienia","Nie udało się zmienić ustawień przypomnień. Spróbuj ponownie."],
 ar:["تذكيرات بالبريد الإلكتروني","تلقَّ تذكيرات من حين لآخر للعودة إلى موسيقاك، بما في ذلك عند تجديد رصيدك. يمكنك إلغاء الاشتراك في أي وقت.","تفعيل التذكيرات","إيقاف التذكيرات","تعذّر تحديث التذكيرات. يُرجى المحاولة مجددًا."],
 "zh-Hans":["邮件提醒","偶尔接收提醒，继续您的音乐创作，包括额度更新时的通知。您可以随时取消订阅。","开启提醒","关闭提醒","无法更新提醒设置，请重试。"],
};
export default function ReminderEmailPreference(){
 const {locale}=useLocale();const c=copy[locale];
 const [allowed,setAllowed]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{let active=true;void fetch('/api/account/reminder-permission',{signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():null).then(r=>{if(active&&r?.mode==='active')setAllowed(r.allowed===true);}).catch(()=>{});return()=>{active=false;};},[]);
 if(allowed===null)return null;
 return <div className="card-outline stack"><strong>{c[0]}</strong><p className="muted text-small">{c[1]}</p>
 <button type="button" className="settingsButton settingsButtonSecondary" disabled={busy} aria-pressed={allowed} onClick={async()=>{
  setBusy(true);setError(false);try{const r=await fetch('/api/account/reminder-permission',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({allowed:!allowed}),signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error();const data=await r.json();if(data.mode!=='active'||data.allowed===allowed)throw new Error();setAllowed(data.allowed);}catch{setError(true);}finally{setBusy(false);}
 }}>{allowed?c[3]:c[2]}</button>{error&&<p role="alert">{c[4]}</p>}</div>;
}
