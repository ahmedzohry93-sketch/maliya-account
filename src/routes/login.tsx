import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { Sun, Moon, Languages, Mail, Lock, ArrowRight, Eye, EyeOff } from "lucide-react";
import logoUrl from "@/assets/logo.png";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { t, lang, setLang, dir } = useI18n();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success(t("auth.success"));
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden px-4 py-10"
      dir={dir}
    >
      {/* Ambient gradient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-0 start-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full bg-primary/15 blur-[140px]" />
        <div className="absolute -bottom-40 -end-40 w-[520px] h-[520px] rounded-full bg-accent/25 blur-[120px]" />
        <div className="absolute -bottom-40 -start-40 w-[520px] h-[520px] rounded-full bg-primary/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      {/* Top controls */}
      <div className="absolute top-4 end-4 z-10 flex items-center gap-2">
        <button
          onClick={toggle}
          className="w-10 h-10 rounded-full border bg-card/70 backdrop-blur-xl flex items-center justify-center hover:bg-muted transition shadow-sm"
          title="Theme"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          className="h-10 px-4 rounded-full border bg-card/70 backdrop-blur-xl flex items-center gap-1.5 text-xs font-medium hover:bg-muted transition shadow-sm"
        >
          <Languages className="w-3.5 h-3.5" />
          {t("lang.switch")}
        </button>
      </div>

      {/* Card */}
      <div className="w-full max-w-md">
        {/* Big logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-5">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary to-accent blur-2xl opacity-40" />
            <div className="relative w-28 h-28 rounded-3xl bg-card border shadow-xl flex items-center justify-center overflow-hidden">
              <img
                src={logoUrl}
                alt={t("app.title")}
                className="w-24 h-24 object-contain"
                width={112}
                height={112}
              />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
            {t("app.title")}
          </h1>
        </div>

        <div className="bg-card/85 backdrop-blur-2xl border rounded-3xl p-8 shadow-2xl shadow-primary/10">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold tracking-tight">{t("auth.login.title")}</h2>
            <p className="text-sm text-muted-foreground mt-1.5">{t("auth.login.subtitle")}</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">
                {t("auth.email")}
              </label>
              <div className="relative">
                <Mail className="absolute top-1/2 -translate-y-1/2 start-3.5 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full ps-10 pe-3 py-3 rounded-xl border bg-background/60 focus:ring-2 focus:ring-ring focus:border-ring outline-none transition"
                  placeholder="name@example.com"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">
                {t("auth.password")}
              </label>
              <div className="relative">
                <Lock className="absolute top-1/2 -translate-y-1/2 start-3.5 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full ps-10 pe-11 py-3 rounded-xl border bg-background/60 focus:ring-2 focus:ring-ring focus:border-ring outline-none transition"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute top-1/2 -translate-y-1/2 end-2 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition"
                  aria-label={showPw ? t("auth.hide_password") : t("auth.show_password")}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary/85 text-primary-foreground font-semibold hover:shadow-lg hover:shadow-primary/25 disabled:opacity-60 transition-all flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                t("auth.signing_in")
              ) : (
                <>
                  <span>{t("auth.signin")}</span>
                  <ArrowRight className="w-4 h-4 rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition" />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} {t("app.title")}
        </div>
      </div>
    </div>
  );
}
