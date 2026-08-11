import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/hooks/use-auth";
import { useCompanySettings, getLogoDataUrl } from "@/lib/company";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Sun, Moon, Languages, User, Palette, Check, Building2, Upload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { user, permissions } = useAuth();
  const fullName = (user?.user_metadata as { full_name?: string } | undefined)?.full_name;

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.subtitle")}</p>
      </header>

      <div className="space-y-6">
        <Section icon={Building2} title={t("settings.company")} desc={t("settings.company_desc")}>
          <CompanyForm canEdit={permissions.has("users.manage")} />
        </Section>

        <Section icon={Palette} title={t("settings.appearance")} desc={t("settings.appearance_desc")}>
          <div className="grid grid-cols-2 gap-3">
            <ThemeCard active={theme === "light"} onClick={() => setTheme("light")} icon={Sun} label={t("settings.theme.light")} />
            <ThemeCard active={theme === "dark"} onClick={() => setTheme("dark")} icon={Moon} label={t("settings.theme.dark")} />
          </div>
        </Section>

        <Section icon={Languages} title={t("settings.language")} desc={t("settings.language_desc")}>
          <div className="grid grid-cols-2 gap-3">
            <LangCard active={lang === "ar"} onClick={() => setLang("ar")} label="العربية" sub="Arabic" />
            <LangCard active={lang === "en"} onClick={() => setLang("en")} label="English" sub="الإنجليزية" />
          </div>
        </Section>

        <Section icon={User} title={t("settings.account")} desc={t("settings.account_desc")}>
          <div className="rounded-lg bg-muted/40 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
              {(fullName || user?.email || "?")[0]?.toUpperCase()}
            </div>
            <div className="text-sm">
              <div className="font-medium">{fullName || user?.email}</div>
              <div className="text-xs text-muted-foreground">{user?.email} · {permissions.size} {t("common.permissions")}</div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function CompanyForm({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: company } = useCompanySettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "", name_en: "", address: "", phone: "", email: "", tax_number: "", footer_note: "",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!company) return;
    setForm({
      name: company.name ?? "",
      name_en: company.name_en ?? "",
      address: company.address ?? "",
      phone: company.phone ?? "",
      email: company.email ?? "",
      tax_number: company.tax_number ?? "",
      footer_note: company.footer_note ?? "",
    });
    getLogoDataUrl(company.logo_path).then(setLogoPreview);
  }, [company]);

  const save = async () => {
    if (!canEdit || !company) return;
    setSaving(true);
    const { error } = await supabase.from("company_settings").update(form).eq("id", company.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("settings.company.saved"));
    qc.invalidateQueries({ queryKey: ["company-settings"] });
  };

  const uploadLogo = async (file: File) => {
    if (!canEdit || !company) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `logo/${company.id}.${ext}`;
    const { error } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error(error.message); return; }
    const { error: upErr } = await supabase.from("company_settings").update({ logo_path: path }).eq("id", company.id);
    if (upErr) { toast.error(upErr.message); return; }
    toast.success(t("settings.company.saved"));
    qc.invalidateQueries({ queryKey: ["company-settings"] });
  };

  const removeLogo = async () => {
    if (!canEdit || !company?.logo_path) return;
    await supabase.storage.from("company-assets").remove([company.logo_path]);
    await supabase.from("company_settings").update({ logo_path: null }).eq("id", company.id);
    setLogoPreview(null);
    qc.invalidateQueries({ queryKey: ["company-settings"] });
  };

  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="text-xs rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2">
          {t("settings.company.no_perm")}
        </div>
      )}
      <div className="flex items-start gap-4">
        <div className="w-24 h-24 rounded-xl border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
          {logoPreview
            ? <img src={logoPreview} alt="logo" className="w-full h-full object-contain" />
            : <Building2 className="w-8 h-8 text-muted-foreground" />}
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium mb-1">{t("settings.company.logo")}</div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" /> {t("settings.company.upload_logo")}
            </button>
            {company?.logo_path && (
              <button
                type="button"
                disabled={!canEdit}
                onClick={removeLogo}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted text-destructive disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> {t("settings.company.remove_logo")}
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }}
          />
          <p className="text-[11px] text-muted-foreground mt-2">PNG / JPG / SVG · يفضل مربع بخلفية شفافة</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label={t("settings.company.name")}   value={form.name}       onChange={(v) => setForm({ ...form, name: v })} disabled={!canEdit} />
        <Field label={t("settings.company.name_en")} value={form.name_en}    onChange={(v) => setForm({ ...form, name_en: v })} disabled={!canEdit} />
        <Field label={t("settings.company.phone")}   value={form.phone}      onChange={(v) => setForm({ ...form, phone: v })} disabled={!canEdit} />
        <Field label={t("settings.company.email")}   value={form.email}      onChange={(v) => setForm({ ...form, email: v })} disabled={!canEdit} />
        <Field label={t("settings.company.tax")}     value={form.tax_number} onChange={(v) => setForm({ ...form, tax_number: v })} disabled={!canEdit} />
        <Field label={t("settings.company.address")} value={form.address}    onChange={(v) => setForm({ ...form, address: v })} disabled={!canEdit} />
        <div className="md:col-span-2">
          <Field label={t("settings.company.footer")} value={form.footer_note} onChange={(v) => setForm({ ...form, footer_note: v })} disabled={!canEdit} />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={!canEdit || saving}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
      />
    </label>
  );
}

function Section({
  icon: Icon, title, desc, children,
}: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border rounded-xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ThemeCard({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-lg border p-4 flex items-center gap-3 transition-all text-start",
        active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:border-foreground/30 hover:bg-muted/40",
      )}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium text-sm">{label}</span>
      {active && <Check className="w-4 h-4 text-primary ms-auto" />}
    </button>
  );
}

function LangCard({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-lg border p-4 text-start transition-all",
        active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:border-foreground/30 hover:bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-sm">{label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
        </div>
        {active && <Check className="w-4 h-4 text-primary" />}
      </div>
    </button>
  );
}
