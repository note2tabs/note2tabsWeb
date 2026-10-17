import type { AppLocale } from "./locale";
/** Complete sentences, including billing conditions, translated together. */
export type ServiceEmailCopy = {
 updatePayment: string; greeting: string; transcribe: string; continue: string; settings: string; unsubscribe: string;
 signup: [string,string]; saved: [string,string]; pro: [string,string];
 trialStarted: [string,string]; trialEnding: [string,string]; features: string;
 payment: [string,string]; share: [string,string]; shareNew: string; signIn: string;
 createAccount: string; shareNotice: string; block: string; privacy: string;
};
export const serviceEmails: Record<AppLocale, ServiceEmailCopy> = {
 en: {
 updatePayment:"Update payment method", greeting:"Hi",transcribe:"Transcribe a song",continue:"Continue your tab",settings:"Review or cancel your subscription",unsubscribe:"Stop reminder emails",
 signup:["Still interested in transcribing a song?","You created a Note2Tabs account but have not started your first transcription yet. Upload a recording or paste a YouTube link to turn the song you want to learn into editable tabs. If now is not the right time, no worries."],
 saved:["Continue working on {label}","Your work on {label} is saved in Note2Tabs. Return whenever you want to play it, make changes, or keep practicing."],
 pro:["Your Note2Tabs Pro plan is active","You now have 250 monthly credits, rollover up to 500 credits, uploads up to 500 MB, and priority email support."],
 trialStarted:["Your Note2Tabs Premium trial has started","Your 7-day trial started on {start}. On {end}, your subscription renews at the price and billing interval confirmed at checkout unless you cancel before then."],
 trialEnding:["Your Note2Tabs trial ends {end}","Your Premium trial ends on {end}. After the trial, Premium renews at the price and billing interval confirmed at checkout unless you cancel before then."],
 features:"Premium includes 100 monthly transcription credits, rollover up to 200 credits, full-length audio-file transcription, and access to the Heavy model.",
 payment:["Please update your Note2Tabs payment method","We could not process your latest {plan} payment. Your {plan} access remains available for 14 days while you update your payment method. If payment is not resolved, {plan} ends automatically. Your account and tabs remain available on the Free plan."],
 share:["{inviter} shared a Note2Tabs tab with you","{inviter} invited you to {permission} “{label}” on Note2Tabs."],shareNew:"Note2Tabs is an online guitar-tab editor. Create a free account using this email address to open the shared tab. This connects the invitation to the right person.",signIn:"Sign in using this email address to access it.",createAccount:"Create account and open tab",shareNotice:"You received this service email because someone shared a tab with this address. You have not been added to a marketing list.",block:"Block future sharing emails",privacy:"Privacy policy",
 },
 es: {
 updatePayment:"Actualizar método de pago", greeting:"Hola",transcribe:"Transcribir una canción",continue:"Continuar con tu tablatura",settings:"Revisar o cancelar tu suscripción",unsubscribe:"Dejar de recibir recordatorios",
 signup:["¿Sigues queriendo transcribir una canción?","Creaste una cuenta de Note2Tabs, pero aún no has empezado tu primera transcripción. Sube una grabación o pega un enlace de YouTube para convertir la canción que quieres aprender en una tablatura editable. Si ahora no es buen momento, no te preocupes."],
 saved:["Sigue trabajando en {label}","Tu trabajo en {label} está guardado en Note2Tabs. Vuelve cuando quieras para escucharlo, hacer cambios o seguir practicando."],
 pro:["Tu plan Note2Tabs Pro está activo","Ahora tienes 250 créditos mensuales, acumulación de hasta 500 créditos, archivos de hasta 500 MB y asistencia prioritaria por correo."],
 trialStarted:["Tu prueba de Note2Tabs Premium ha comenzado","Tu prueba de 7 días comenzó el {start}. El {end}, tu suscripción se renovará al precio y con la periodicidad confirmados al pagar, salvo que la canceles antes."],
 trialEnding:["Tu prueba de Note2Tabs termina el {end}","Tu prueba de Premium termina el {end}. Después, Premium se renovará al precio y con la periodicidad confirmados al pagar, salvo que canceles antes."],
 features:"Premium incluye 100 créditos mensuales de transcripción, acumulación de hasta 200 créditos, transcripción de archivos de audio completos y acceso al modelo Heavy.",
 payment:["Actualiza tu método de pago de Note2Tabs","No pudimos procesar tu último pago de {plan}. Conservarás el acceso a {plan} durante 14 días mientras actualizas tu método de pago. Si no se resuelve el pago, {plan} finalizará automáticamente. Tu cuenta y tus tablaturas seguirán disponibles con el plan gratuito."],
 share:["{inviter} ha compartido una tablatura de Note2Tabs contigo","{inviter} te ha invitado a {permission} «{label}» en Note2Tabs."],shareNew:"Note2Tabs es un editor de tablaturas de guitarra en línea. Crea una cuenta gratuita con esta dirección de correo para abrir la tablatura compartida. Así vinculamos la invitación con la persona correcta.",signIn:"Inicia sesión con esta dirección de correo para acceder.",createAccount:"Crear cuenta y abrir tablatura",shareNotice:"Has recibido este correo de servicio porque alguien compartió una tablatura con esta dirección. No se te ha añadido a ninguna lista de marketing.",block:"Bloquear futuros correos de tablaturas compartidas",privacy:"Política de privacidad",
 },
 "pt-BR": {
 updatePayment:"Atualizar forma de pagamento", greeting:"Olá",transcribe:"Transcrever uma música",continue:"Continuar sua tablatura",settings:"Consultar ou cancelar sua assinatura",unsubscribe:"Parar de receber lembretes",
 signup:["Ainda quer transcrever uma música?","Você criou uma conta no Note2Tabs, mas ainda não começou sua primeira transcrição. Envie uma gravação ou cole um link do YouTube para transformar a música que quer aprender em uma tablatura editável. Se agora não for um bom momento, tudo bem."],
 saved:["Continue trabalhando em {label}","Seu trabalho em {label} está salvo no Note2Tabs. Volte quando quiser para ouvir, fazer ajustes ou continuar praticando."],
 pro:["Seu plano Note2Tabs Pro está ativo","Agora você tem 250 créditos mensais, acúmulo de até 500 créditos, arquivos de até 500 MB e suporte prioritário por e-mail."],
 trialStarted:["Seu teste do Note2Tabs Premium começou","Seu teste de 7 dias começou em {start}. Em {end}, sua assinatura será renovada pelo preço e pela frequência confirmados no pagamento, a menos que você cancele antes."],
 trialEnding:["Seu teste do Note2Tabs termina em {end}","Seu teste do Premium termina em {end}. Depois, o Premium será renovado pelo preço e pela frequência confirmados no pagamento, a menos que você cancele antes."],
 features:"O Premium inclui 100 créditos mensais de transcrição, acúmulo de até 200 créditos, transcrição de arquivos de áudio completos e acesso ao modelo Heavy.",
 payment:["Atualize sua forma de pagamento do Note2Tabs","Não conseguimos processar seu último pagamento do {plan}. Seu acesso ao {plan} continuará disponível por 14 dias enquanto você atualiza sua forma de pagamento. Se o pagamento não for regularizado, o {plan} será encerrado automaticamente. Sua conta e suas tablaturas continuarão disponíveis no plano gratuito."],
 share:["{inviter} compartilhou uma tablatura do Note2Tabs com você","{inviter} convidou você para {permission} “{label}” no Note2Tabs."],shareNew:"O Note2Tabs é um editor on-line de tablaturas de guitarra. Crie uma conta gratuita com este endereço de e-mail para abrir a tablatura compartilhada. Assim, a gente vincula o convite à pessoa certa.",signIn:"Entre com este endereço de e-mail para acessar.",createAccount:"Criar conta e abrir tablatura",shareNotice:"Você recebeu este e-mail de serviço porque alguém compartilhou uma tablatura com este endereço. Você não foi incluído em uma lista de marketing.",block:"Bloquear futuros e-mails de compartilhamento",privacy:"Política de privacidade",
 },
 fr: {
 updatePayment:"Mettre à jour le moyen de paiement", greeting:"Bonjour",transcribe:"Transcrire un morceau",continue:"Reprendre votre tablature",settings:"Consulter ou résilier votre abonnement",unsubscribe:"Ne plus recevoir de rappels",
 signup:["Toujours envie de transcrire un morceau ?","Vous avez créé un compte Note2Tabs, mais n’avez pas encore lancé votre première transcription. Importez un enregistrement ou collez un lien YouTube pour obtenir une tablature modifiable du morceau que vous souhaitez apprendre. Si ce n’est pas le bon moment, aucun souci."],
 saved:["Reprenez votre travail sur {label}","Votre travail sur {label} est enregistré dans Note2Tabs. Revenez quand vous le souhaitez pour l’écouter, le modifier ou continuer à vous entraîner."],
 pro:["Votre offre Note2Tabs Pro est active","Vous disposez désormais de 250 crédits mensuels, d’un cumul jusqu’à 500 crédits, d’imports jusqu’à 500 Mo et d’une assistance prioritaire par e-mail."],
 trialStarted:["Votre essai Note2Tabs Premium a commencé","Votre essai de 7 jours a commencé le {start}. Le {end}, votre abonnement sera renouvelé au tarif et selon la périodicité confirmés lors du paiement, sauf résiliation avant cette date."],
 trialEnding:["Votre essai Note2Tabs se termine le {end}","Votre essai Premium se termine le {end}. Ensuite, Premium sera renouvelé au tarif et selon la périodicité confirmés lors du paiement, sauf résiliation préalable."],
 features:"Premium comprend 100 crédits de transcription mensuels, un cumul jusqu’à 200 crédits, la transcription de fichiers audio complets et l’accès au modèle Heavy.",
 payment:["Mettez à jour votre moyen de paiement Note2Tabs","Nous n’avons pas pu traiter votre dernier paiement {plan}. Votre accès à {plan} reste disponible pendant 14 jours pour vous permettre de mettre à jour votre moyen de paiement. Si le paiement n’est pas régularisé, {plan} prendra fin automatiquement. Votre compte et vos tablatures resteront disponibles avec l’offre gratuite."],
 share:["{inviter} a partagé une tablature Note2Tabs avec vous","{inviter} vous invite à {permission} « {label} » sur Note2Tabs."],shareNew:"Note2Tabs est un éditeur de tablatures de guitare en ligne. Créez un compte gratuit avec cette adresse e-mail pour ouvrir la tablature partagée. Cela permet d’associer l’invitation à la bonne personne.",signIn:"Connectez-vous avec cette adresse e-mail pour y accéder.",createAccount:"Créer un compte et ouvrir la tablature",shareNotice:"Vous recevez cet e-mail de service parce qu’une personne a partagé une tablature avec cette adresse. Vous n’avez pas été ajouté à une liste marketing.",block:"Bloquer les prochains e-mails de partage",privacy:"Politique de confidentialité",
 },
 it: {
 updatePayment:"Aggiorna il metodo di pagamento", greeting:"Ciao",transcribe:"Trascrivi un brano",continue:"Riprendi la tua tablatura",settings:"Gestisci o annulla l’abbonamento",unsubscribe:"Non ricevere più promemoria",
 signup:["Vuoi ancora trascrivere un brano?","Hai creato un account Note2Tabs, ma non hai ancora avviato la prima trascrizione. Carica una registrazione o incolla un link di YouTube per trasformare il brano che vuoi imparare in una tablatura modificabile. Se non è il momento giusto, nessun problema."],
 saved:["Riprendi il lavoro su {label}","Il tuo lavoro su {label} è salvato in Note2Tabs. Torna quando vuoi per ascoltarlo, modificarlo o continuare a esercitarti."],
 pro:["Il tuo piano Note2Tabs Pro è attivo","Ora hai 250 crediti mensili, accumulo fino a 500 crediti, caricamenti fino a 500 MB e assistenza prioritaria via e-mail."],
 trialStarted:["La tua prova di Note2Tabs Premium è iniziata","La tua prova di 7 giorni è iniziata il {start}. Il {end}, l’abbonamento si rinnoverà al prezzo e con la periodicità confermati al pagamento, salvo annullamento prima di tale data."],
 trialEnding:["La tua prova di Note2Tabs termina il {end}","La tua prova di Premium termina il {end}. Dopo la prova, Premium si rinnoverà al prezzo e con la periodicità confermati al pagamento, salvo annullamento prima di tale data."],
 features:"Premium include 100 crediti mensili per le trascrizioni, accumulo fino a 200 crediti, trascrizione di file audio completi e accesso al modello Heavy.",
 payment:["Aggiorna il metodo di pagamento di Note2Tabs","Non siamo riusciti a elaborare l’ultimo pagamento di {plan}. L’accesso a {plan} rimarrà disponibile per 14 giorni mentre aggiorni il metodo di pagamento. Se il pagamento non viene regolarizzato, {plan} terminerà automaticamente. Il tuo account e le tue tablature rimarranno disponibili con il piano gratuito."],
 share:["{inviter} ha condiviso una tablatura Note2Tabs con te","{inviter} ti ha invitato a {permission} «{label}» su Note2Tabs."],shareNew:"Note2Tabs è un editor online di tablature per chitarra. Crea un account gratuito con questo indirizzo e-mail per aprire la tablatura condivisa. In questo modo l’invito viene associato alla persona giusta.",signIn:"Accedi con questo indirizzo e-mail.",createAccount:"Crea un account e apri la tablatura",shareNotice:"Hai ricevuto questa e-mail di servizio perché qualcuno ha condiviso una tablatura con questo indirizzo. Non sei stato aggiunto a una lista di marketing.",block:"Blocca le future e-mail di condivisione",privacy:"Informativa sulla privacy",
 },
 pl: {
 updatePayment:"Zaktualizuj metodę płatności", greeting:"Cześć",transcribe:"Transkrybuj utwór",continue:"Wróć do tabulatury",settings:"Sprawdź lub anuluj subskrypcję",unsubscribe:"Wyłącz przypomnienia e-mail",
 signup:["Nadal chcesz przetranskrybować utwór?","Masz już konto Note2Tabs, ale jeszcze nie rozpoczęto na nim pierwszej transkrypcji. Prześlij nagranie lub wklej link z YouTube, aby zamienić utwór, którego chcesz się nauczyć, w edytowalną tabulaturę. Jeśli to nie jest dobry moment, nic nie szkodzi."],
 saved:["Kontynuuj pracę nad {label}","Twoja praca nad {label} jest zapisana w Note2Tabs. Wróć, kiedy chcesz, aby odtwarzać, wprowadzać zmiany lub dalej ćwiczyć."],
 pro:["Twój plan Note2Tabs Pro jest aktywny","Masz teraz 250 kredytów miesięcznie, możliwość gromadzenia do 500 kredytów, przesyłanie plików do 500 MB i priorytetową pomoc e-mail."],
 trialStarted:["Rozpoczął się Twój okres próbny Note2Tabs Premium","Twój 7-dniowy okres próbny rozpoczął się {start}. Dnia {end} subskrypcja odnowi się w cenie i z częstotliwością potwierdzonymi przy płatności, chyba że wcześniej ją anulujesz."],
 trialEnding:["Twój okres próbny Note2Tabs kończy się {end}","Twój okres próbny Premium kończy się {end}. Następnie Premium odnowi się w cenie i z częstotliwością potwierdzonymi przy płatności, chyba że wcześniej anulujesz subskrypcję."],
 features:"Premium obejmuje 100 kredytów na transkrypcje miesięcznie, możliwość gromadzenia do 200 kredytów, transkrypcję pełnych plików audio i dostęp do modelu Heavy.",
 payment:["Zaktualizuj metodę płatności w Note2Tabs","Nie udało się przetworzyć ostatniej płatności za {plan}. Dostęp do {plan} pozostanie aktywny przez 14 dni, aby umożliwić aktualizację metody płatności. Jeśli płatność nie zostanie uregulowana, {plan} zakończy się automatycznie. Twoje konto i tabulatury pozostaną dostępne w planie bezpłatnym."],
 share:["{inviter} udostępnia Ci tabulaturę w Note2Tabs","{inviter} zaprasza Cię do działania: {permission} — „{label}” w Note2Tabs."],shareNew:"Note2Tabs to internetowy edytor tabulatur gitarowych. Utwórz bezpłatne konto z tym adresem e-mail, aby otworzyć udostępnioną tabulaturę. Dzięki temu zaproszenie trafi do właściwej osoby.",signIn:"Zaloguj się przy użyciu tego adresu e-mail, aby uzyskać dostęp.",createAccount:"Utwórz konto i otwórz tabulaturę",shareNotice:"To wiadomość usługowa wysłana, ponieważ ktoś udostępnił tabulaturę temu adresowi. Twój adres nie został dodany do listy marketingowej.",block:"Zablokuj przyszłe e-maile o udostępnianiu",privacy:"Polityka prywatności",
 },
 ja: {
 updatePayment:"お支払い方法を更新", greeting:"こんにちは",transcribe:"曲を採譜する",continue:"TAB譜の作業を続ける",settings:"サブスクリプションの確認・解約",unsubscribe:"リマインダーメールを停止",
 signup:["採譜したい曲はありますか？","Note2Tabsのアカウントを作成されましたが、まだ採譜は開始されていません。録音をアップロードするかYouTubeのリンクを貼り付けると、練習したい曲を編集可能なTAB譜に変換できます。お時間のあるときにお試しください。"],
 saved:["「{label}」の作業を続けましょう","「{label}」の作業内容はNote2Tabsに保存されています。いつでも戻って再生、編集、練習を続けられます。"],
 pro:["Note2Tabs Proプランが有効になりました","毎月250クレジット、最大500クレジットまでの繰り越し、最大500 MBのアップロード、優先メールサポートをご利用いただけます。"],
 trialStarted:["Note2Tabs Premiumの無料体験が始まりました","7日間の無料体験は{start}に開始されました。事前に解約しない限り、{end}に購入手続きで確認した料金と請求間隔でサブスクリプションが更新されます。"],
 trialEnding:["Note2Tabsの無料体験は{end}に終了します","Premiumの無料体験は{end}に終了します。事前に解約しない限り、無料体験後は購入手続きで確認した料金と請求間隔でPremiumが更新されます。"],
 features:"Premiumでは、毎月100クレジット、最大200クレジットまでの繰り越し、音声ファイル全体の採譜、Heavyモデルをご利用いただけます。",
 payment:["Note2Tabsのお支払い方法を更新してください","{plan}の最新のお支払いを処理できませんでした。お支払い方法を更新いただく間、14日間は{plan}をご利用いただけます。期間内にお支払いが完了しない場合、{plan}は自動的に終了します。アカウントとTAB譜は無料プランで引き続きご利用いただけます。"],
 share:["{inviter}さんからNote2TabsのTAB譜が共有されました","{inviter}さんからNote2Tabsの「{label}」への招待が届いています（{permission}）。"],shareNew:"Note2TabsはオンラインのギターTAB譜エディターです。このメールアドレスで無料アカウントを作成すると、共有されたTAB譜を開けます。招待を正しい利用者に紐づけるため、同じアドレスをお使いください。",signIn:"このメールアドレスでログインして開いてください。",createAccount:"アカウントを作成してTAB譜を開く",shareNotice:"このメールは、このアドレスにTAB譜が共有されたためお送りしています。マーケティング配信リストへの登録は行っていません。",block:"今後の共有メールをブロック",privacy:"プライバシーポリシー",
 },
 ko: {
 updatePayment:"결제 수단 업데이트", greeting:"안녕하세요",transcribe:"곡 채보하기",continue:"타브 악보 작업 이어가기",settings:"구독 확인 또는 취소",unsubscribe:"알림 이메일 수신 중지",
 signup:["채보하고 싶은 곡이 있나요?","Note2Tabs 계정을 만들었지만 아직 첫 채보를 시작하지 않으셨네요. 녹음 파일을 업로드하거나 YouTube 링크를 붙여 넣어 배우고 싶은 곡을 편집 가능한 타브 악보로 만들어 보세요. 편한 시간에 이용하시면 됩니다."],
 saved:["{label} 작업을 이어 가세요","{label} 작업이 Note2Tabs에 저장되어 있습니다. 언제든 돌아와 재생하거나 수정하고 연습을 이어 가세요."],
 pro:["Note2Tabs Pro 요금제가 활성화되었습니다","매월 250크레딧, 최대 500크레딧 이월, 최대 500 MB 업로드, 우선 이메일 지원을 이용할 수 있습니다."],
 trialStarted:["Note2Tabs Premium 체험이 시작되었습니다","7일 체험이 {start}에 시작되었습니다. 그 전에 취소하지 않으면 {end}에 결제 시 확인한 가격과 결제 주기로 구독이 갱신됩니다."],
 trialEnding:["Note2Tabs 체험이 {end}에 종료됩니다","Premium 체험이 {end}에 종료됩니다. 그 전에 취소하지 않으면 체험 후 결제 시 확인한 가격과 결제 주기로 Premium이 갱신됩니다."],
 features:"Premium에는 매월 채보용 100크레딧, 최대 200크레딧 이월, 전체 길이 오디오 파일 채보, Heavy 모델 이용이 포함됩니다.",
 payment:["Note2Tabs 결제 수단을 업데이트해 주세요","최근 {plan} 결제를 처리하지 못했습니다. 결제 수단을 업데이트하는 동안 14일간 {plan} 이용 권한이 유지됩니다. 기간 내에 결제가 완료되지 않으면 {plan}이 자동으로 종료됩니다. 계정과 타브 악보는 무료 요금제에서 계속 이용할 수 있습니다."],
 share:["{inviter}님이 Note2Tabs 타브 악보를 공유했습니다","{inviter}님이 Note2Tabs의 ‘{label}’에 초대했습니다({permission})."],shareNew:"Note2Tabs는 온라인 기타 타브 악보 에디터입니다. 이 이메일 주소로 무료 계정을 만들면 공유된 악보를 열 수 있습니다. 초대가 올바른 사람에게 연결되도록 같은 주소를 사용해 주세요.",signIn:"이 이메일 주소로 로그인하여 이용하세요.",createAccount:"계정을 만들고 악보 열기",shareNotice:"누군가 이 주소로 악보를 공유하여 발송된 서비스 이메일입니다. 마케팅 수신 목록에 추가되지 않았습니다.",block:"앞으로 공유 이메일 차단",privacy:"개인정보 처리방침",
 },
 "zh-Hans": {
 updatePayment:"更新付款方式", greeting:"您好",transcribe:"转写一首歌",continue:"继续编辑六线谱",settings:"查看或取消订阅",unsubscribe:"停止接收提醒邮件",
 signup:["还想转写一首歌吗？","您已创建 Note2Tabs 账户，但还没有开始第一次转写。上传录音或粘贴 YouTube 链接，即可将想学的歌曲转换为可编辑的六线谱。有空时再来试试也没关系。"],
 saved:["继续处理《{label}》","您在《{label}》上的工作已保存到 Note2Tabs。随时回来播放、修改或继续练习。"],
 pro:["您的 Note2Tabs Pro 套餐已生效","您现在每月可获得 250 点额度，累计上限为 500 点，可上传最大 500 MB 的文件，并享受优先邮件支持。"],
 trialStarted:["您的 Note2Tabs Premium 试用已开始","您的 7 天试用于 {start} 开始。除非您提前取消，否则订阅将于 {end} 按结账时确认的价格和账单周期续订。"],
 trialEnding:["您的 Note2Tabs 试用将于 {end} 结束","您的 Premium 试用将于 {end} 结束。除非提前取消，否则试用后 Premium 将按结账时确认的价格和账单周期续订。"],
 features:"Premium 包含每月 100 点转写额度（累计上限为 200 点）、完整音频文件转写和 Heavy 模型使用权限。",
 payment:["请更新您的 Note2Tabs 付款方式","我们未能处理您最近的 {plan} 付款。在您更新付款方式期间，{plan} 使用权限将保留 14 天。如果在此期间未能完成付款，{plan} 将自动结束。您的账户和六线谱仍可通过免费套餐使用。"],
 share:["{inviter} 与您分享了 Note2Tabs 六线谱","{inviter} 邀请您在 Note2Tabs 中{permission}《{label}》。"],shareNew:"Note2Tabs 是在线吉他六线谱编辑器。使用此邮箱地址创建免费账户即可打开分享的六线谱，这能确保邀请关联到正确的用户。",signIn:"请使用此邮箱地址登录以访问。",createAccount:"创建账户并打开六线谱",shareNotice:"有人向此地址分享了六线谱，因此您收到了这封服务邮件。您未被加入营销邮件列表。",block:"屏蔽后续分享邮件",privacy:"隐私政策",
 },
 ar: {
 updatePayment:"تحديث وسيلة الدفع", greeting:"مرحبًا",transcribe:"حوّل أغنية إلى تاب",continue:"تابع العمل على التاب",settings:"مراجعة الاشتراك أو إلغاؤه",unsubscribe:"إيقاف رسائل التذكير",
 signup:["هل ما زلت ترغب في تحويل أغنية إلى تاب؟","أنشأت حسابًا في Note2Tabs، لكنك لم تبدأ أول تحويل بعد. ارفع تسجيلًا أو الصق رابط YouTube لتحويل الأغنية التي تريد تعلّمها إلى تاب قابل للتعديل. لا بأس إن لم يكن الوقت مناسبًا الآن."],
 saved:["تابع العمل على {label}","عملك على {label} محفوظ في Note2Tabs. عُد متى شئت للاستماع أو التعديل أو متابعة التدريب."],
 pro:["تم تفعيل خطة Note2Tabs Pro","لديك الآن 250 رصيدًا شهريًا، مع ترحيل حتى 500 رصيد، ورفع ملفات حتى 500 MB، ودعم ذي أولوية عبر البريد الإلكتروني."],
 trialStarted:["بدأت الفترة التجريبية لـ Note2Tabs Premium","بدأت فترتك التجريبية لمدة 7 أيام في {start}. في {end}، سيتجدد اشتراكك بالسعر ودورة الفوترة اللذين أكدتهما عند الدفع ما لم تُلغِه قبل ذلك."],
 trialEnding:["تنتهي تجربتك في Note2Tabs في {end}","تنتهي تجربتك لـ Premium في {end}. بعدها، سيتجدد Premium بالسعر ودورة الفوترة اللذين أكدتهما عند الدفع ما لم تُلغِ الاشتراك قبل ذلك."],
 features:"يتضمن Premium عدد 100 رصيد شهري للتحويل، مع ترحيل حتى 200 رصيد، وتحويل الملفات الصوتية كاملة، والوصول إلى نموذج Heavy.",
 payment:["يرجى تحديث وسيلة الدفع في Note2Tabs","تعذّرت معالجة دفعتك الأخيرة لخطة {plan}. سيظل وصولك إلى {plan} متاحًا لمدة 14 يومًا لتحديث وسيلة الدفع. إذا لم تُسوَّ الدفعة خلالها، ستنتهي {plan} تلقائيًا. سيظل حسابك والتابات متاحين ضمن الخطة المجانية."],
 share:["شارك {inviter} معك تابًا في Note2Tabs","دعاك {inviter} إلى {permission} «{label}» في Note2Tabs."],shareNew:"Note2Tabs محرّر تاب للغيتار عبر الإنترنت. أنشئ حسابًا مجانيًا بهذا البريد لفتح التاب المشترك، لضمان ربط الدعوة بالشخص الصحيح.",signIn:"سجّل الدخول بهذا البريد الإلكتروني للوصول إليه.",createAccount:"إنشاء حساب وفتح التاب",shareNotice:"وصلتك رسالة الخدمة هذه لأن شخصًا شارك تابًا مع هذا العنوان. لم تتم إضافتك إلى قائمة تسويقية.",block:"حظر رسائل المشاركة المستقبلية",privacy:"سياسة الخصوصية",
 },
};
export function emailPhrase(template: string, values: Record<string,string> = {}) {
 return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}
export const sharePermissions: Record<AppLocale, [string,string]> = {
 en:["view","view and edit"],es:["ver","ver y editar"],"pt-BR":["visualizar","visualizar e editar"],fr:["consulter","consulter et modifier"],it:["visualizzare","visualizzare e modificare"],pl:["wyświetlanie","wyświetlanie i edycja"],ja:["閲覧可","閲覧・編集可"],ko:["보기 가능","보기 및 편집 가능"],"zh-Hans":["查看","查看和编辑"],ar:["عرض","عرض وتعديل"],
};
