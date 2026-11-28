import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Eye, EyeOff, Smartphone, X } from "lucide-react";
import { apiPost } from "./services/api";
import { LanguageSwitch, useT } from "./i18n";
import { Logo } from "./logo";
import { GOOGLE_CLIENT_ID, GoogleSignIn } from "./google";
import type { LoginResult } from "./session";

type Kind = "signup" | "login";
type Field = "name" | "email" | "password";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SOCIETIES = ["Safal Parisar", "Iscon Platinum", "Shivalik Sharda", "Applewoods", "Sun City"];

/**
 * Calendly-style sign-up / log-in: form on the left, brand panel on the right.
 * Email + password works everywhere; Google and mobile OTP appear only when
 * they are configured.
 */
export function AuthScreen({ startWith, onSuccess, onClose, onMobile, accountType: initialType = "resident" }: {
  startWith: Kind;
  onSuccess: (result: LoginResult) => void;
  accountType?: "resident" | "business_owner";
  onClose: () => void;
  onMobile?: () => void;
}) {
  const { t } = useT();
  const [kind, setKind] = useState<Kind>(startWith);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<{ field?: Field; text: string; exists?: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [accountType, setAccountType] = useState(initialType);
  const firstInput = useRef<HTMLInputElement>(null);
  const signup = kind === "signup";

  useEffect(() => { firstInput.current?.focus(); }, [kind]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  // Only complain about a field once the person has left it or tried to submit.
  const problems: Partial<Record<Field, string>> = {};
  if (signup && name.trim().length < 2) problems.name = t("au.errName");
  if (signup ? !EMAIL_RE.test(email.trim()) : !email.trim()) problems.email = signup ? t("au.errEmail") : t("au.errEmailLogin");
  if (signup ? password.length < 8 : !password) problems.password = signup ? t("au.errPassword") : t("au.errPasswordLogin");
  const show = (field: Field) => (submitted || touched[field]) ? problems[field] ?? (serverError?.field === field ? serverError.text : undefined) : serverError?.field === field ? serverError.text : undefined;

  function switchTo(next: Kind) {
    setKind(next);
    setSubmitted(false);
    setTouched({});
    setServerError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (Object.keys(problems).length) return;
    setPending(true);
    try {
      const path = signup ? "/auth/email/register/" : "/auth/email/login/";
      const body = signup ? { name: name.trim(), email: email.trim(), password, account_type: accountType } : { email: email.trim(), password };
      onSuccess(await apiPost<LoginResult>(path, body));
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : t("err.login");
      const exists = /already exists/i.test(text);
      const field: Field | undefined = exists || /email address/i.test(text) ? "email" : /password/i.test(text) && signup ? "password" : /name/i.test(text) && signup ? "name" : undefined;
      setServerError({ field, text: exists ? t("au.exists") : text, exists });
    } finally {
      setPending(false);
    }
  }

  const nameError = show("name");
  const emailError = show("email");
  const passwordError = show("password");
  const formError = serverError && !serverError.field ? serverError.text : "";

  return (
    <div className="au" role="dialog" aria-modal="true" aria-labelledby="au-title">
      <header className="auTop">
        <Logo size={30} />
        <div className="auTopRight">
          <button type="button" className="auOutline" onClick={() => switchTo(signup ? "login" : "signup")}>{signup ? t("auth.logIn") : t("auth.signUp")}</button>
          <button type="button" className="auClose" onClick={onClose} aria-label={t("close")}><X size={20} /></button>
        </div>
      </header>

      <div className="auBody">
        <main className="auFormCol">
          <AnimatePresence mode="wait">
            <motion.div
              key={kind}
              className="auForm"
              initial={{ opacity: 0, x: signup ? -12 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: signup ? 12 : -12 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            >
              <h1 id="au-title">{signup ? t("au.signupTitle") : t("au.loginTitle")}</h1>
              <p className="auSub">{signup ? t("au.signupSub") : t("au.loginSub")}</p>

              <form onSubmit={submit} noValidate>
                {signup && (
                  <div className="auType" role="radiogroup" aria-label={t("au.typeLabel")}>
                    {(["resident", "business_owner"] as const).map((value) => (
                      <button key={value} type="button" role="radio" aria-checked={accountType === value}
                        className={accountType === value ? "on" : ""} onClick={() => setAccountType(value)}>
                        <b>{t(value === "resident" ? "au.typeResident" : "au.typeOwner")}</b>
                        <small>{t(value === "resident" ? "au.typeResidentHint" : "au.typeOwnerHint")}</small>
                      </button>
                    ))}
                  </div>
                )}
                {signup && (
                  <label className={`auField ${nameError ? "bad" : ""}`}>
                    <span>{t("au.name")}</span>
                    <input ref={firstInput} name="name" autoComplete="name" value={name} placeholder={t("au.namePh")}
                      onChange={(event) => { setName(event.target.value); if (serverError?.field === "name") setServerError(null); }}
                      onBlur={() => name && setTouched((v) => ({ ...v, name: true }))}
                      aria-invalid={Boolean(nameError)} aria-describedby={nameError ? "au-name-err" : undefined} />
                    {nameError && <em id="au-name-err">{nameError}</em>}
                  </label>
                )}
                <label className={`auField ${emailError ? "bad" : ""}`}>
                  <span>{signup ? t("au.email") : t("au.emailOrUser")}</span>
                  <input ref={signup ? undefined : firstInput} name="email" type={signup ? "email" : "text"} inputMode="email" autoComplete={signup ? "email" : "username"} autoCapitalize="none" spellCheck={false}
                    value={email} placeholder={t("au.emailPh")}
                    onChange={(event) => { setEmail(event.target.value); if (serverError?.field === "email") setServerError(null); }}
                    onBlur={() => email && setTouched((v) => ({ ...v, email: true }))}
                    aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "au-email-err" : undefined} />
                  {emailError && (
                    <em id="au-email-err">
                      {emailError}
                      {serverError?.exists && <> <button type="button" className="auInlineLink" onClick={() => switchTo("login")}>{t("auth.logIn")}</button></>}
                    </em>
                  )}
                </label>
                <label className={`auField ${passwordError ? "bad" : ""}`}>
                  <span>{t("au.password")}</span>
                  <span className="auPassword">
                    <input name="password" type={showPassword ? "text" : "password"} autoComplete={signup ? "new-password" : "current-password"}
                      value={password} placeholder={signup ? t("au.passwordPh") : ""}
                      onChange={(event) => { setPassword(event.target.value); if (serverError?.field === "password") setServerError(null); }}
                      onBlur={() => password && setTouched((v) => ({ ...v, password: true }))}
                      aria-invalid={Boolean(passwordError)} aria-describedby={passwordError ? "au-pw-err" : signup ? "au-pw-hint" : undefined} />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? t("au.hidePassword") : t("au.showPassword")} aria-pressed={showPassword}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                  {passwordError ? <em id="au-pw-err">{passwordError}</em> : signup && <small id="au-pw-hint">{t("au.passwordHint")}</small>}
                </label>

                {formError && <p className="auFormError" role="alert">{formError}</p>}

                <button className="auPrimary" type="submit" disabled={pending}>
                  {pending ? t("login.signingIn") : signup ? t("au.create") : t("auth.logIn")}
                </button>
              </form>

              {(GOOGLE_CLIENT_ID || onMobile) && (
                <>
                  <div className="auOr"><span>{t("auth.or")}</span></div>
                  <div className="auAlt">
                    {GOOGLE_CLIENT_ID && <GoogleSignIn onSuccess={onSuccess} />}
                    {onMobile && <button type="button" className="auAltBtn" onClick={onMobile}><Smartphone size={18} />{t("au.mobile")}</button>}
                  </div>
                </>
              )}

              <p className="auSwitch">
                {signup ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
                <button type="button" onClick={() => switchTo(signup ? "login" : "signup")}>
                  {signup ? t("auth.logIn") : t("au.createFree")} <ArrowRight size={15} />
                </button>
              </p>
            </motion.div>
          </AnimatePresence>
        </main>

        <aside className="auAside">
          <div className="auAsideInner">
            <span className="auChip">{t("auth.asideChip")}</span>
            <h2>{t("au.asideTitle")}</h2>
            <ul>
              {(["auth.perk1", "auth.perk2", "auth.perk3", "auth.perk4", "au.perk5"] as const).map((key) => (
                <li key={key}><Check size={17} />{t(key)}</li>
              ))}
            </ul>
            <p className="auTrusted">{t("home.trustedBy")}</p>
            <div className="auSocieties">{SOCIETIES.map((society) => <span key={society}>{society}</span>)}</div>
          </div>
        </aside>
      </div>

      <footer className="auFoot">
        <LanguageSwitch />
        <span>{t("au.footer")}</span>
      </footer>
    </div>
  );
}
