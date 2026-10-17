import type {AppLocale} from "./locale";

type EmailCopy = {
 greeting: string;
 verification: {subject:string; title:string; body:string; expiry:string};
 reset: {subject:string; title:string; body:string; code:string; expiry:string};
 completion: {subject:string; title:string; body:string; action:string; fallbackLabel:string};
};
/** Full phrases keep languages with different word orders out of English fragments. */
const copies: Record<Exclude<AppLocale,"en">, EmailCopy> = {
 es: {
  greeting:"Hola",
  verification:{subject:"Verifica tu cuenta de Note2Tabs",title:"Verifica tu correo",body:"Verifica tu correo para terminar de crear tu cuenta y empezar a transcribir.",expiry:"Este enlace caduca en 24 horas. Si no creaste esta cuenta, ignora este correo."},
  reset:{subject:"Restablece tu contraseña de Note2Tabs",title:"Restablece tu contraseña",body:"Recibimos una solicitud para restablecer tu contraseña. Usa el enlace y el código que aparecen a continuación.",code:"Código de restablecimiento",expiry:"El enlace y el código caducan en una hora. Si no lo solicitaste, ignora este correo."},
  completion:{subject:"Tu transcripción de Note2Tabs está lista",title:"Tu tablatura está lista",body:"La tablatura de «{label}» está lista. Ábrela en el editor para escucharla, editarla, practicar y exportarla.",action:"Abrir en el editor",fallbackLabel:"Tu transcripción"},
 },
 "pt-BR": {
  greeting:"Olá",
  verification:{subject:"Confirme sua conta do Note2Tabs",title:"Confirme seu e-mail",body:"Confirme seu e-mail para concluir a criação da conta e começar a transcrever.",expiry:"Este link expira em 24 horas. Se você não criou esta conta, ignore este e-mail."},
  reset:{subject:"Redefina sua senha do Note2Tabs",title:"Redefina sua senha",body:"Recebemos uma solicitação para redefinir sua senha. Use o link e o código abaixo.",code:"Código de redefinição",expiry:"O link e o código expiram em uma hora. Se você não fez essa solicitação, ignore este e-mail."},
  completion:{subject:"Sua transcrição do Note2Tabs está pronta",title:"Sua tablatura está pronta",body:"A tablatura de “{label}” está pronta. Abra no editor para ouvir, editar, praticar e exportar.",action:"Abrir no editor",fallbackLabel:"Sua transcrição"},
 },
 ja: {
  greeting:"こんにちは",
  verification:{subject:"Note2Tabsのメールアドレスを確認してください",title:"メールアドレスを確認",body:"アカウントの作成を完了して採譜を利用するには、メールアドレスを確認してください。",expiry:"このリンクは24時間で無効になります。登録にお心当たりがない場合は、このメールを無視してください。"},
  reset:{subject:"Note2Tabsのパスワード再設定",title:"パスワードを再設定",body:"パスワード再設定のリクエストを受け付けました。以下のリンクとコードを使用してください。",code:"再設定コード",expiry:"リンクとコードは1時間で無効になります。お心当たりがない場合は、このメールを無視してください。"},
  completion:{subject:"Note2Tabsの採譜が完了しました",title:"TAB譜が完成しました",body:"「{label}」のTAB譜が完成しました。エディターで開き、再生・編集・練習・書き出しができます。",action:"エディターで開く",fallbackLabel:"採譜結果"},
 },
 fr: {
  greeting:"Bonjour",
  verification:{subject:"Confirmez votre compte Note2Tabs",title:"Confirmez votre adresse e-mail",body:"Confirmez votre adresse e-mail pour terminer la création de votre compte et commencer à transcrire.",expiry:"Ce lien expire dans 24 heures. Si vous n’avez pas créé ce compte, ignorez cet e-mail."},
  reset:{subject:"Réinitialisez votre mot de passe Note2Tabs",title:"Réinitialisez votre mot de passe",body:"Nous avons reçu une demande de réinitialisation de votre mot de passe. Utilisez le lien et le code ci-dessous.",code:"Code de réinitialisation",expiry:"Le lien et le code expirent dans une heure. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail."},
  completion:{subject:"Votre transcription Note2Tabs est prête",title:"Votre tablature est prête",body:"La tablature de « {label} » est prête. Ouvrez-la dans l’éditeur pour l’écouter, la modifier, vous entraîner et l’exporter.",action:"Ouvrir dans l’éditeur",fallbackLabel:"Votre transcription"},
 },
 it: {
  greeting:"Ciao",
  verification:{subject:"Conferma il tuo account Note2Tabs",title:"Conferma il tuo indirizzo e-mail",body:"Conferma il tuo indirizzo e-mail per completare la creazione dell’account e iniziare a trascrivere.",expiry:"Questo link scade tra 24 ore. Se non hai creato questo account, ignora questa e-mail."},
  reset:{subject:"Reimposta la password di Note2Tabs",title:"Reimposta la password",body:"Abbiamo ricevuto una richiesta di reimpostazione della password. Usa il link e il codice qui sotto.",code:"Codice di reimpostazione",expiry:"Il link e il codice scadono tra un’ora. Se non hai richiesto la reimpostazione, ignora questa e-mail."},
  completion:{subject:"La tua trascrizione Note2Tabs è pronta",title:"La tua tablatura è pronta",body:"La tablatura di «{label}» è pronta. Aprila nell’editor per ascoltarla, modificarla, esercitarti ed esportarla.",action:"Apri nell’editor",fallbackLabel:"La tua trascrizione"},
 },
 ko: {
  greeting: "안녕하세요",
  verification:{subject:"Note2Tabs 이메일을 인증해 주세요",title:"이메일 인증",body:"계정 생성을 완료하고 채보 기능을 사용하려면 이메일을 인증해 주세요.",expiry:"이 링크는 24시간 후 만료됩니다. 가입한 적이 없다면 이 이메일을 무시하세요."},
  reset:{subject:"Note2Tabs 비밀번호 재설정",title:"비밀번호 재설정",body:"비밀번호 재설정 요청을 받았습니다. 아래 링크와 코드를 사용하세요.",code:"재설정 코드",expiry:"링크와 코드는 1시간 후 만료됩니다. 요청한 적이 없다면 이 이메일을 무시하세요."},
  completion:{subject:"Note2Tabs 채보가 완료되었습니다",title:"타브 악보가 완성되었습니다",body:"{label}의 타브 악보가 완성되었습니다. 에디터에서 재생·편집·연습·내보내기를 이용하세요.",action:"에디터에서 열기",fallbackLabel:"채보 결과"},
 },
 pl: {
  greeting:"Cześć",
  verification:{subject:"Potwierdź konto Note2Tabs",title:"Potwierdź e-mail",body:"Potwierdź adres e-mail, aby dokończyć tworzenie konta i korzystać z transkrypcji.",expiry:"Link wygasa po 24 godzinach. Jeśli to konto nie zostało utworzone przez Ciebie, zignoruj tę wiadomość."},
  reset:{subject:"Zresetuj hasło Note2Tabs",title:"Zresetuj hasło",body:"Otrzymaliśmy prośbę o zresetowanie hasła. Użyj poniższego linku i kodu.",code:"Kod resetowania",expiry:"Link i kod wygasają po godzinie. Jeśli prośba o resetowanie nie pochodziła od Ciebie, zignoruj tę wiadomość."},
  completion:{subject:"Twoja transkrypcja Note2Tabs jest gotowa",title:"Tabulatura jest gotowa",body:"Tabulatura „{label}” jest gotowa. Otwórz ją w edytorze, aby odtwarzać, edytować, ćwiczyć i eksportować.",action:"Otwórz w edytorze",fallbackLabel:"Twoja transkrypcja"},
 },
 ar: {
  greeting:"مرحبًا",
  verification:{subject:"أكّد حسابك في Note2Tabs",title:"أكّد بريدك الإلكتروني",body:"أكّد بريدك الإلكتروني لإكمال إنشاء الحساب واستخدام خدمة تحويل الصوت إلى تابلاتشر.",expiry:"تنتهي صلاحية هذا الرابط خلال 24 ساعة. إذا لم تنشئ هذا الحساب، فتجاهل هذه الرسالة."},
  reset:{subject:"إعادة تعيين كلمة مرور Note2Tabs",title:"إعادة تعيين كلمة المرور",body:"تلقّينا طلبًا لإعادة تعيين كلمة المرور. استخدم الرابط والرمز أدناه.",code:"رمز إعادة التعيين",expiry:"تنتهي صلاحية الرابط والرمز خلال ساعة. إذا لم تطلب ذلك، فتجاهل هذه الرسالة."},
  completion:{subject:"تفريغ الغيتار في Note2Tabs جاهز",title:"التابلاتشر جاهز",body:"أصبح تابلاتشر «{label}» جاهزًا. افتحه في المحرّر للاستماع والتعديل والتدرّب والتصدير.",action:"افتح في المحرّر",fallbackLabel:"تفريغ الغيتار"},
 },
 "zh-Hans": {
  greeting:"您好",
  verification:{subject:"请验证您的 Note2Tabs 账户",title:"验证邮箱",body:"请验证您的邮箱，以完成账户创建并使用转录功能。",expiry:"此链接将在 24 小时后失效。如果您未创建此账户，请忽略此邮件。"},
  reset:{subject:"重置您的 Note2Tabs 密码",title:"重置密码",body:"我们收到了您的密码重置请求。请使用下方的链接和验证码。",code:"密码重置验证码",expiry:"链接和验证码将在 1 小时后失效。如果您未提出此请求，请忽略此邮件。"},
  completion:{subject:"您的 Note2Tabs 转录已完成",title:"六线谱已生成",body:"《{label}》的六线谱已生成。在编辑器中打开，即可播放、编辑、练习并导出。",action:"在编辑器中打开",fallbackLabel:"您的转录结果"},
 },
};
export function localizedEmailCopy(locale: AppLocale) {return locale === "en" ? undefined : copies[locale];}
