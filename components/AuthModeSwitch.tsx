import Link from "./LocaleLink";
import { useLocale } from "../lib/i18n/react";

/** Keep both account paths visible before asking for credentials. */
export default function AuthModeSwitch({ mode, alternateHref, onSwitch }: {
  mode: "login" | "signup";
  alternateHref: string;
  onSwitch?: () => void;
}) {
  const { t } = useLocale();
  return (
    <nav className="auth-mode-switch" aria-label={t("Account access")}>
      {(["signup", "login"] as const).map(item => item === mode ? (
        <span key={item} aria-current="page">{t(item === "signup" ? "Sign up" : "Log in")}</span>
      ) : (
        <Link key={item} href={alternateHref} onClick={onSwitch}>{t(item === "signup" ? "Sign up" : "Log in")}</Link>
      ))}
    </nav>
  );
}
