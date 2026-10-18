import type { AppLocale } from "./locale";
// Subject, body, action, opt-out. No upgrade offer in this notification.
export const creditResetCopy: Record<
  AppLocale,
  readonly [string, string, string, string]
> = {
  en: [
    "Your Note2Tabs credits have refreshed",
    "Your monthly transcription credits have refreshed. Open Note2Tabs to check your balance and continue transcribing.",
    "Continue transcribing",
    "Stop reminder emails",
  ],
  es: [
    "Tus créditos de Note2Tabs se han renovado",
    "Tus créditos mensuales de transcripción se han renovado. Abre Note2Tabs para consultar tu saldo y seguir transcribiendo.",
    "Seguir transcribiendo",
    "Dejar de recibir recordatorios",
  ],
  "pt-BR": [
    "Seus créditos do Note2Tabs foram renovados",
    "Seus créditos mensais de transcrição foram renovados. Abra o Note2Tabs para conferir seu saldo e continuar transcrevendo.",
    "Continuar transcrevendo",
    "Parar de receber lembretes por e-mail",
  ],
  fr: [
    "Vos crédits Note2Tabs ont été renouvelés",
    "Vos crédits mensuels de transcription ont été renouvelés. Ouvrez Note2Tabs pour consulter votre solde et continuer à transcrire.",
    "Continuer à transcrire",
    "Ne plus recevoir de rappels",
  ],
  it: [
    "I tuoi crediti Note2Tabs sono stati rinnovati",
    "I tuoi crediti mensili di trascrizione sono stati rinnovati. Apri Note2Tabs per controllare il saldo e continuare a trascrivere.",
    "Continua a trascrivere",
    "Non ricevere più promemoria",
  ],
  pl: [
    "Twoje kredyty Note2Tabs zostały odnowione",
    "Twoje miesięczne kredyty na transkrypcje zostały odnowione. Otwórz Note2Tabs, aby sprawdzić saldo i kontynuować transkrypcję.",
    "Kontynuuj transkrypcję",
    "Wyłącz przypomnienia e-mail",
  ],
  ja: [
    "Note2Tabsのクレジットが更新されました",
    "毎月の採譜用クレジットが更新されました。Note2Tabsを開いて残高を確認し、採譜を続けましょう。",
    "採譜を続ける",
    "リマインダーメールの配信を停止",
  ],
  ko: [
    "Note2Tabs 크레딧이 갱신되었습니다",
    "월간 채보 크레딧이 갱신되었습니다. Note2Tabs에서 잔액을 확인하고 채보를 계속해 보세요.",
    "채보 계속하기",
    "알림 이메일 수신 거부",
  ],
  ar: [
    "تم تجديد رصيدك في Note2Tabs",
    "تم تجديد رصيدك الشهري لتحويل التسجيلات إلى تاب. افتح Note2Tabs للاطلاع على رصيدك ومتابعة تحويل تسجيلاتك.",
    "متابعة تحويل التسجيلات",
    "إيقاف رسائل التذكير",
  ],
  "zh-Hans": [
    "你的Note2Tabs积分已更新",
    "你的每月制谱积分已更新。打开Note2Tabs查看余额，继续将录音转成吉他谱。",
    "继续制谱",
    "停止接收提醒邮件",
  ],
};
