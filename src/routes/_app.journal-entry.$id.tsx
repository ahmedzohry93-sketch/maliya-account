import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  X,
  CheckCircle2,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Save,
  BookOpen,
  Scale,
  ListOrdered,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { logAudit } from "@/lib/audit";
import { useConfirm } from "@/components/confirm-dialog";
import { archiveRecord, softDeleteRecord } from "@/lib/records";
import { ancestorCodes, CUSTOMER_ROOT_CODES, SUPPLIER_ROOT_CODES } from "@/lib/account-tree";

export const Route = createFileRoute("/_app/journal-entry/$id")({
  component: JournalEntryPage,
  head: () => ({
    meta: [
      { title: "قيد يومية | Journal Entry" },
      { name: "description", content: "شاشة قيد اليومية الكاملة: البنود، المدين والدائن، الاعتماد والترحيل." },
      { property: "og:title", content: "قيد يومية | Journal Entry" },
      { property: "og:description", content: "شاشة قيد اليومية الكاملة مع البنود والتوازن والاعتماد." },
    ],
  }),
});

type Account = { id: string; code: string; name: string; parent_id: string | null; is_active: boolean };
type Line = { account_id: string; partner_id: string | null; debit: number; credit: number; description: string };
type PartnerOpt = { id: string; name: string; type: string };

const entryTypeKeys = [
  "general", "sales", "purchases", "payroll",
  "cash_receipt", "cash_payment", "inventory", "opening", "closing",
] as const;

const emptyLine = (): Line => ({ account_id: "", partner_id: null, debit: 0, credit: 0, description: "" });

function JournalEntryPage() {
  const { id } = Route.useParams();
  const isNew = id === "new";
  const { t, fmt, dir } = useI18n();
  const { permissions } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;

  const { data: entry, isLoading } = useQuery({
    queryKey: ["journal-entry", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .select("*, journal_lines(account_id, partner_id, debit, credit, description, line_order)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [entryType, setEntryType] = useState("general");
  const [lines, setLines] = useState<Line[]>([emptyLine(), emptyLine()]);
  const [saving, setSaving] = useState(false);

  const status: string = entry?.status ?? "draft";
  const readonly = status === "posted";

  useEffect(() => {
    if (!entry) return;
    setDate(entry.entry_date);
    setDescription(entry.description ?? "");
    setReference(entry.reference ?? "");
    setEntryType(entry.entry_type ?? "general");
    const rows = [...(entry.journal_lines ?? [])].sort((a: any, b: any) => a.line_order - b.line_order);
    if (rows.length) {
      setLines(rows.map((l: any) => ({
        account_id: l.account_id,
        partner_id: l.partner_id ?? null,
        debit: Number(l.debit),
        credit: Number(l.credit),
        description: l.description ?? "",
      })));
    }
  }, [entry]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts-list-full"],
    queryFn: async () => {
      const { data } = await supabase
        .from("accounts")
        .select("id, code, name, parent_id, is_active")
        .order("code");
      return (data ?? []) as Account[];
    },
  });

  const parentIds = useMemo(() => {
    const s = new Set<string>();
    accounts.forEach((a) => { if (a.parent_id) s.add(a.parent_id); });
    return s;
  }, [accounts]);

  const postableAccounts = useMemo(
    () => accounts.filter((a) => a.is_active && !parentIds.has(a.id)),
    [accounts, parentIds],
  );

  const { data: partnersOpts = [] } = useQuery({
    queryKey: ["partners-opts"],
    queryFn: async () => {
      const { data } = await supabase.from("partners").select("id, name, type").eq("is_active", true).order("name");
      return (data ?? []) as PartnerOpt[];
    },
  });

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const diff = totalDebit - totalCredit;
  const balanced = diff === 0 && totalDebit > 0;

  const backToList = () => navigate({ to: "/journal" });

  const approve = async () => {
    if (isNew || !entry) return;
    const { error } = await supabase
      .from("journal_entries")
      .update({ status: "posted", approved_at: new Date().toISOString() })
      .eq("id", entry.id);
    if (error) return toast.error(error.message);
    await logAudit("post", "journal_entry", entry.id, { entry_no: entry.entry_no });
    toast.success(t("journal.approved"));
    qc.invalidateQueries({ queryKey: ["journal-entries"] });
    qc.invalidateQueries({ queryKey: ["journal-entry", id] });
  };

  const revert = async () => {
    if (isNew || !entry) return;
    const { error } = await supabase
      .from("journal_entries")
      .update({ status: "draft", approved_at: null, approved_by: null })
      .eq("id", entry.id);
    if (error) return toast.error(error.message);
    await logAudit("revert_to_draft", "journal_entry", entry.id, { entry_no: entry.entry_no });
    toast.success(t("journal.reverted"));
    qc.invalidateQueries({ queryKey: ["journal-entries"] });
    qc.invalidateQueries({ queryKey: ["journal-entry", id] });
  };

  const confirm = useConfirm();

  const removeEntry = async () => {
    if (isNew || !entry || status !== "draft") return;
    const choice = await confirm({
      title: `${t("common.delete")} — ${t("journal.entry")} #${entry.entry_no}`,
      description: t("common.cannot_undo"),
    });
    if (!choice) return;
    try {
      const snapshot = { entry_no: entry.entry_no, entry_date: date, status };
      if (choice === "archive") await archiveRecord("journal_entries", entry.id, snapshot);
      else await softDeleteRecord("journal_entries", entry.id, snapshot);
      toast.success(choice === "archive" ? t("common.archive_success") : t("common.delete_success"));
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      navigate({ to: "/journal" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readonly) return;
    if (!balanced) return toast.error(t("journal.unbalanced_err"));
    if (lines.some((l) => !l.account_id)) return toast.error(t("journal.pick_account"));
    if (lines.some((l) => parentIds.has(l.account_id))) return toast.error(t("journal.no_group_account"));

    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      let entryId: string;
      if (!isNew && entry) {
        const { error } = await supabase
          .from("journal_entries")
          .update({ entry_date: date, description, reference: reference || null, entry_type: entryType })
          .eq("id", entry.id);
        if (error) throw error;
        entryId = entry.id;
        await supabase.from("journal_lines").delete().eq("entry_id", entryId);
      } else {
        const { data: created, error } = await supabase
          .from("journal_entries")
          .insert({
            entry_date: date,
            description,
            reference: reference || null,
            entry_type: entryType,
            status: "draft",
            created_by: user.user?.id,
          })
          .select("id, entry_no")
          .single();
        if (error) throw error;
        entryId = created.id;
      }

      const { error: linesErr } = await supabase.from("journal_lines").insert(
        lines.map((l, i) => ({
          entry_id: entryId,
          account_id: l.account_id,
          partner_id: l.partner_id || null,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
          line_order: i,
        })),
      );
      if (linesErr) throw linesErr;

      await logAudit(isNew ? "create" : "update", "journal_entry", entryId, {
        entry_date: date, description, entry_type: entryType, total: totalDebit, lines: lines.length,
      });

      toast.success(isNew ? t("journal.saved") : t("journal.updated"));
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      if (isNew) navigate({ to: "/journal-entry/$id", params: { id: entryId } });
      else qc.invalidateQueries({ queryKey: ["journal-entry", id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  if (!isNew && !isLoading && !entry) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t("journal.not_found")} —{" "}
        <Link to="/journal" className="text-primary underline">{t("journal.back")}</Link>
      </div>
    );
  }

  const statusChip = (
    <span
      className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${
        status === "posted"
          ? "bg-success/15 text-success"
          : status === "cancelled"
            ? "bg-destructive/15 text-destructive"
            : "bg-warning/20 text-warning-foreground"
      }`}
    >
      {status === "posted" ? t("journal.status.posted") : status === "cancelled" ? t("journal.status.cancelled") : t("journal.status.draft")}
    </span>
  );

  return (
    <form onSubmit={submit} className="min-h-full pb-28">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex flex-wrap items-center gap-3">
          <Link
            to="/journal"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground rounded-xl px-2.5 py-1.5 hover:bg-muted transition-colors"
          >
            <BackIcon className="w-4 h-4" strokeWidth={1.75} /> {t("journal.back")}
          </Link>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-primary/10 text-primary shrink-0">
              <BookOpen className="w-4.5 h-4.5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <div className="font-semibold leading-tight truncate">
                {isNew ? t("journal.draft_no") : `${t("journal.no")} #${entry?.entry_no ?? ""}`}
              </div>
              <div className="text-xs text-muted-foreground num">{date}</div>
            </div>
            {statusChip}
          </div>

          <div className="ms-auto flex items-center gap-2">
            {!readonly && (
              <button
                type="submit"
                disabled={saving || !balanced}
                className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 hover:opacity-90"
              >
                <Save className="w-4 h-4" strokeWidth={1.75} /> {saving ? "..." : t("common.save")}
              </button>
            )}
            {!isNew && status === "draft" && permissions.has("journal.approve") && (
              <button
                type="button"
                onClick={approve}
                className="inline-flex items-center gap-1.5 bg-success text-success-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90"
              >
                <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} /> {t("journal.approve")}
              </button>
            )}
            {!isNew && status === "posted" && permissions.has("journal.approve") && (
              <button
                type="button"
                onClick={revert}
                className="inline-flex items-center gap-1.5 bg-warning text-warning-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90"
              >
                <RotateCcw className="w-4 h-4" strokeWidth={1.75} /> {t("journal.revert")}
              </button>
            )}
            {!isNew && status === "draft" && permissions.has("journal.delete") && (
              <button
                type="button"
                onClick={removeEntry}
                className="inline-flex items-center gap-1.5 border border-destructive/40 text-destructive px-3 py-2 rounded-xl text-sm font-medium hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.75} /> {t("common.delete")}
              </button>
            )}
            <button type="button" onClick={backToList} className="px-3 py-2 border rounded-xl text-sm hover:bg-muted">
              {readonly ? t("common.close") : t("common.cancel")}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-5">
        {/* Entry details */}
        <section className="bg-card border rounded-2xl p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <span className="grid place-items-center w-7 h-7 rounded-lg bg-muted text-muted-foreground">
              <ListOrdered className="w-4 h-4" strokeWidth={1.75} />
            </span>
            {t("journal.info")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1">{t("journal.date")}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required disabled={readonly} className="inp num disabled:opacity-70" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">{t("journal.type")}</label>
              <select value={entryType} onChange={(e) => setEntryType(e.target.value)} disabled={readonly} className="inp disabled:opacity-70">
                {entryTypeKeys.map((k) => <option key={k} value={k}>{t(`entry_type.${k}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">{t("journal.reference")}</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} disabled={readonly} className="inp disabled:opacity-70" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">{t("journal.description")}</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} disabled={readonly} className="inp disabled:opacity-70" />
            </div>
          </div>
        </section>

        {/* Lines */}
        <section className="bg-card border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("journal.lines")}</h2>
            {!readonly && (
              <button
                type="button"
                onClick={() => setLines([...lines, emptyLine()])}
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:bg-primary/10 rounded-lg px-2.5 py-1.5"
              >
                <Plus className="w-4 h-4" strokeWidth={1.75} /> {t("journal.add_line")}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="text-start px-3 py-2.5 w-10">#</th>
                  <th className="text-start px-3 py-2.5">{t("journal.account")}</th>
                  <th className="text-start px-3 py-2.5 w-40">{t("journal.partner")}</th>
                  <th className="text-start px-3 py-2.5">{t("journal.description")}</th>
                  <th className="text-start px-3 py-2.5 w-32">{t("journal.debit")}</th>
                  <th className="text-start px-3 py-2.5 w-32">{t("journal.credit")}</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const chain = l.account_id
                    ? ancestorCodes(accounts.map((a) => ({ ...a, type: "" })), l.account_id)
                    : [];
                  const isCustomerAcc = chain.some((c) => CUSTOMER_ROOT_CODES.includes(c));
                  const isSupplierAcc = chain.some((c) => SUPPLIER_ROOT_CODES.includes(c));
                  const filteredPartners = isCustomerAcc
                    ? partnersOpts.filter((p) => p.type === "customer" || p.type === "both")
                    : isSupplierAcc
                      ? partnersOpts.filter((p) => p.type === "supplier" || p.type === "both")
                      : partnersOpts;
                  return (
                    <tr key={i} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-1.5 num text-xs text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <select
                          value={l.account_id}
                          disabled={readonly}
                          onChange={(e) => {
                            const c = [...lines];
                            c[i] = { ...c[i], account_id: e.target.value, partner_id: null };
                            setLines(c);
                          }}
                          className="inp text-sm disabled:opacity-70"
                        >
                          <option value="">—</option>
                          {postableAccounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        {l.account_id ? (
                          <select
                            value={l.partner_id ?? ""}
                            disabled={readonly}
                            onChange={(e) => {
                              const c = [...lines];
                              c[i] = { ...c[i], partner_id: e.target.value || null };
                              setLines(c);
                            }}
                            className="inp text-xs disabled:opacity-70"
                          >
                            <option value="">—</option>
                            {filteredPartners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={l.description}
                          disabled={readonly}
                          onChange={(e) => {
                            const c = [...lines];
                            c[i] = { ...c[i], description: e.target.value };
                            setLines(c);
                          }}
                          className="inp text-sm disabled:opacity-70"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number" step="0.01" dir="ltr"
                          value={l.debit || ""}
                          disabled={readonly}
                          onChange={(e) => {
                            const c = [...lines];
                            c[i] = { ...c[i], debit: Number(e.target.value), credit: 0 };
                            setLines(c);
                          }}
                          className="inp text-sm num disabled:opacity-70"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number" step="0.01" dir="ltr"
                          value={l.credit || ""}
                          disabled={readonly}
                          onChange={(e) => {
                            const c = [...lines];
                            c[i] = { ...c[i], credit: Number(e.target.value), debit: 0 };
                            setLines(c);
                          }}
                          className="inp text-sm num disabled:opacity-70"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {!readonly && lines.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setLines(lines.filter((_, x) => x !== i))}
                            className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"
                          >
                            <X className="w-4 h-4" strokeWidth={1.75} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Sticky totals bar */}
      <div className="fixed bottom-0 inset-x-0 z-20 border-t bg-background/85 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-2 font-medium">
            <span className="grid place-items-center w-8 h-8 rounded-xl bg-primary/10 text-primary">
              <Scale className="w-4 h-4" strokeWidth={1.75} />
            </span>
            {t("journal.total")}
          </span>
          <span className="text-muted-foreground">{t("journal.debit")}: <b className="num text-foreground">{fmt(totalDebit)}</b></span>
          <span className="text-muted-foreground">{t("journal.credit")}: <b className="num text-foreground">{fmt(totalCredit)}</b></span>
          <span className="text-muted-foreground">{t("journal.difference")}: <b className="num text-foreground">{fmt(diff)}</b></span>
          <span className={`ms-auto text-xs px-2.5 py-1 rounded-full font-medium ${balanced ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
            {balanced ? t("journal.balanced") : t("journal.unbalanced")}
          </span>
        </div>
      </div>
    </form>
  );
}
