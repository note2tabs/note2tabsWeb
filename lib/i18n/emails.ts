import type {AppLocale} from "./locale";

type EmailCopy = {
 greeting: string;
 verification: {subject:string; title:string; body:string; expiry:string};
 reset: {subject:string; title:string; body:string; code:string; expiry:string};
 completion: {subject:string; title:string; body:string; action:string; fallbackLabel:string};
};
/** Full phrases keep languages with different word orders out of English fragments. */
const copies: Partial<Record<AppLocale, EmailCopy>> = {
 ko: {
  greeting: "안녕하세요",
  verification:{subject:"Note2Tabs 이메일을 인증해 주세요",title:"이메일 인증",body:"계정 생성을 완료하고 채보 기능을 사용하려면 이메일을 인증해 주세요.",expiry:"이 링크는 24시간 후 만료됩니다. 가입한 적이 없다면 이 이메일을 무시하세요."},
  reset:{subject:"Note2Tabs 비밀번호 재설정",title:"비밀번호 재설정",body:"비밀번호 재설정 요청을 받았습니다. 아래 링크와 코드를 사용하세요.",code:"재설정 코드",expiry:"링크와 코드는 1시간 후 만료됩니다. 요청한 적이 없다면 이 이메일을 무시하세요."},
  completion:{subject:"Note2Tabs 채보가 완료되었습니다",title:"타브 악보가 완성되었습니다",body:"{label}의 타브 악보가 완성되었습니다. 편집기에서 재생하고 편집하고 연습하고 내보낼 수 있습니다.",action:"편집기에서 열기",fallbackLabel:"채보 결과"},
 },
 pl: {
  greeting:"Cześć",
  verification:{subject:"Potwierdź konto Note2Tabs",title:"Potwierdź e-mail",body:"Potwierdź adres e-mail, aby dokończyć tworzenie konta i korzystać z transkrypcji.",expiry:"Link wygasa po 24 godzinach. Jeśli nie zakładasz tego konta, zignoruj tę wiadomość."},
  reset:{subject:"Zresetuj hasło Note2Tabs",title:"Zresetuj hasło",body:"Otrzymaliśmy prośbę o zresetowanie hasła. Użyj poniższego linku i kodu.",code:"Kod resetowania",expiry:"Link i kod wygasają po godzinie. Jeśli nie wysyłasz tej prośby, zignoruj tę wiadomość."},
  completion:{subject:"Twoja transkrypcja Note2Tabs jest gotowa",title:"Tabulatura jest gotowa",body:"Tabulatura „{label}” jest gotowa. Otwórz ją w edytorze, aby odtwarzać, edytować, ćwiczyć i eksportować.",action:"Otwórz w edytorze",fallbackLabel:"Twoja transkrypcja"},
 },
 ar: {
  greeting:"مرحبًا",
  verification:{subject:"أكّد حسابك في Note2Tabs",title:"أكّد بريدك الإلكتروني",body:"أكّد بريدك الإلكتروني لإكمال إنشاء الحساب واستخدام خدمة تحويل الصوت إلى تابلاتشر.",expiry:"تنتهي صلاحية هذا الرابط خلال 24 ساعة. إذا لم تنشئ هذا الحساب، فتجاهل هذه الرسالة."},
  reset:{subject:"إعادة تعيين كلمة مرور Note2Tabs",title:"إعادة تعيين كلمة المرور",body:"تلقّينا طلبًا لإعادة تعيين كلمة المرور. استخدم الرابط والرمز أدناه.",code:"رمز إعادة التعيين",expiry:"تنتهي صلاحية الرابط والرمز خلال ساعة. إذا لم تطلب ذلك، فتجاهل هذه الرسالة."},
  completion:{subject:"نتيجة النسخ في Note2Tabs جاهزة",title:"التابلاتشر جاهز",body:"أصبح تابلاتشر «{label}» جاهزًا. افتحه في المحرّر للاستماع والتعديل والتدرّب والتصدير.",action:"افتح في المحرّر",fallbackLabel:"نتيجة النسخ"},
 },
 "zh-Hans": {
  greeting:"您好",
  verification:{subject:"请验证您的 Note2Tabs 账户",title:"验证邮箱",body:"请验证您的邮箱，以完成账户创建并使用转录功能。",expiry:"此链接将在 24 小时后失效。如果您未创建此账户，请忽略此邮件。"},
  reset:{subject:"重置您的 Note2Tabs 密码",title:"重置密码",body:"我们收到了您的密码重置请求。请使用下方的链接和验证码。",code:"密码重置验证码",expiry:"链接和验证码将在 1 小时后失效。如果您未提出此请求，请忽略此邮件。"},
  completion:{subject:"您的 Note2Tabs 转录已完成",title:"六线谱已生成",body:"《{label}》的六线谱已生成。在编辑器中打开，即可播放、编辑、练习并导出。",action:"在编辑器中打开",fallbackLabel:"您的转录结果"},
 },
};
export function localizedEmailCopy(locale: AppLocale) {return copies[locale];}
