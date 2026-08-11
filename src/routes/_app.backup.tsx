import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  DatabaseBackup,
  Download,
  HardDriveDownload,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
  Clock,
  ShieldAlert,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import {
  createBackup,
  deleteBackup,
  getBackupDownloadUrl,
  restoreFromBackup,
  uploadBackupArchive,
} from "@/lib/backup.functions";

export const Route = createFileRoute("/_app/backup")({
  component: BackupPage,
  head: () => ({
    meta: [
      { title: "النسخ الاحتياطي والاستعادة | ماليّة" },
      {
        name: "description",
        content: "إنشاء نسخ احتياطية كاملة لقاعدة البيانات والملفات، وجدولتها يوميًا، والاستعادة منها.",
      },
      { property: "og:title", content: "النسخ الاحتياطي والاستعادة | ماليّة" },
      {
        property: "og:description",
        content: "نسخ احتياطي كامل مضغوط لقاعدة البيانات والملفات مع جدولة يومية واستعادة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Job = {
  id: string;
  kind: string;
  status: string;
  file_name: string | null;
  size_bytes: number;
  tables_count: number;
  rows_count: number;
  files_count: number;
  error: string | null;
  restored_at: string | null;
  created_at: string;
};

type Settings = {
  id: string;
  daily_enabled: boolean;
  run_hour_utc: number;
  retention_count: number;
  include_files: boolean;
  last_run_at: string | null;
};

const fmtSize = (n: number) => {
  if (!n) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });

function BackupPage() {
  const { t } = useI18n();
  const { permissions } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmRestore, setConfirmRestore] = useState<Job | null>(null);

  const canView = permissions.has("backup.view");
  const canCreate = permissions.has("backup.create");
  const canRestore = permissions.has("backup.restore");

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["backup-jobs"],
    enabled: canView,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backup_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Job[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["backup-settings"],
    enabled: canView,
    queryFn: async () => {
      const { data } = await supabase.from("backup_settings").select("*").limit(1).maybeSingle();
      return (data ?? null) as unknown as Settings | null;
    },
  });

  const saveSettings = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      if (!settings) return;
      const { error } = await supabase.from("backup_settings").update(patch as never).eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backup-settings"] });
      toast.success(t("backup.saved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runBackup = useMutation({
    mutationFn: async () => await createBackup({ data: { includeFiles: settings?.include_files !== false } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["backup-jobs"] });
      toast.success(`${t("backup.done")} — ${r.rowsCount} ${t("backup.rows")}, ${fmtSize(r.sizeBytes)}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const download = useMutation({
    mutationFn: async (jobId: string) => await getBackupDownloadUrl({ data: { jobId } }),
    onSuccess: (r) => window.open(r.url, "_blank"),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (jobId: string) => await deleteBackup({ data: { jobId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backup-jobs"] });
      toast.success(t("backup.deleted"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: async (jobId: string) => await restoreFromBackup({ data: { jobId } }),
    onSuccess: (r) => {
      setConfirmRestore(null);
      qc.invalidateQueries();
      if (r.skipped.length) toast.warning(r.skipped.slice(0, 3).join(" • "));
      toast.success(`${t("backup.restored")} — ${r.restoredRows} ${t("backup.rows")}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const buf = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buf.length; i += 8192)
        binary += String.fromCharCode(...buf.subarray(i, i + 8192));
      return await uploadBackupArchive({
        data: { fileName: file.name, contentBase64: btoa(binary) },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backup-jobs"] });
      toast.success(t("backup.uploaded"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canView) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-50" />
        {t("common.no_permission")}
      </div>
    );
  }

  const last = jobs.find((j) => j.status === "completed");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <DatabaseBackup className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("backup.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("backup.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = "";
            }}
          />
          {canRestore && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
              className="inline-flex items-center gap-2 rounded-xl border px-4 h-10 text-sm hover:bg-muted disabled:opacity-50"
            >
              {upload.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {t("backup.upload_zip")}
            </button>
          )}
          {canCreate && (
            <button
              onClick={() => runBackup.mutate()}
              disabled={runBackup.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 h-10 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {runBackup.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <HardDriveDownload className="w-4 h-4" />
              )}
              {t("backup.run_now")}
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("backup.last_backup")} value={last ? fmtDate(last.created_at) : "—"} />
        <StatCard label={t("backup.last_size")} value={last ? fmtSize(last.size_bytes) : "—"} />
        <StatCard label={t("backup.count")} value={String(jobs.length)} />
      </div>

      {/* Schedule */}
      <section className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">{t("backup.schedule")}</h2>
        </div>
        <p className="text-xs text-muted-foreground">{t("backup.schedule_desc")}</p>
        <div className="grid gap-4 sm:grid-cols-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="w-4 h-4"
              disabled={!canCreate}
              checked={settings?.daily_enabled ?? false}
              onChange={(e) => saveSettings.mutate({ daily_enabled: e.target.checked })}
            />
            {t("backup.daily_enabled")}
          </label>
          <label className="text-sm space-y-1">
            <span className="text-xs text-muted-foreground">{t("backup.run_hour")}</span>
            <select
              className="w-full h-9 rounded-lg border bg-background px-2 text-sm"
              disabled={!canCreate}
              value={settings?.run_hour_utc ?? 2}
              onChange={(e) => saveSettings.mutate({ run_hour_utc: Number(e.target.value) })}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00 UTC
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1">
            <span className="text-xs text-muted-foreground">{t("backup.retention")}</span>
            <input
              type="number"
              min={1}
              max={365}
              className="w-full h-9 rounded-lg border bg-background px-2 text-sm"
              disabled={!canCreate}
              defaultValue={settings?.retention_count ?? 14}
              onBlur={(e) => saveSettings.mutate({ retention_count: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="w-4 h-4"
              disabled={!canCreate}
              checked={settings?.include_files ?? true}
              onChange={(e) => saveSettings.mutate({ include_files: e.target.checked })}
            />
            {t("backup.include_files")}
          </label>
        </div>
        {settings?.last_run_at && (
          <p className="text-xs text-muted-foreground">
            {t("backup.last_scheduled")}: {fmtDate(settings.last_run_at)}
          </p>
        )}
      </section>

      {/* History */}
      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">{t("backup.history")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-start px-4 py-2.5">{t("backup.file")}</th>
                <th className="text-start px-4 py-2.5">{t("backup.date")}</th>
                <th className="text-start px-4 py-2.5">{t("backup.type")}</th>
                <th className="text-start px-4 py-2.5">{t("backup.status")}</th>
                <th className="text-start px-4 py-2.5">{t("backup.content")}</th>
                <th className="text-start px-4 py-2.5">{t("backup.size")}</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin inline" />
                  </td>
                </tr>
              )}
              {!isLoading && jobs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {t("backup.empty")}
                  </td>
                </tr>
              )}
              {jobs.map((j) => (
                <tr key={j.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-mono text-xs">{j.file_name ?? "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(j.created_at)}</td>
                  <td className="px-4 py-2.5">
                    {j.kind === "scheduled" ? t("backup.kind.scheduled") : t("backup.kind.manual")}
                  </td>
                  <td className="px-4 py-2.5">
                    {j.status === "completed" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {t("backup.status.completed")}
                      </span>
                    ) : j.status === "failed" ? (
                      <span
                        className="inline-flex items-center gap-1 text-destructive"
                        title={j.error ?? ""}
                      >
                        <XCircle className="w-3.5 h-3.5" /> {t("backup.status.failed")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("backup.status.running")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {j.rows_count} {t("backup.rows")} · {j.files_count} {t("backup.files")}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{fmtSize(j.size_bytes)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {j.status === "completed" && (
                        <button
                          onClick={() => download.mutate(j.id)}
                          className="p-1.5 rounded-lg hover:bg-muted"
                          title={t("backup.download")}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                      {canRestore && j.status === "completed" && (
                        <button
                          onClick={() => setConfirmRestore(j)}
                          className="p-1.5 rounded-lg hover:bg-muted text-amber-600"
                          title={t("backup.restore")}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      {canCreate && (
                        <button
                          onClick={() => {
                            if (confirm(t("common.confirm_delete"))) remove.mutate(j.id);
                          }}
                          className="p-1.5 rounded-lg hover:bg-muted text-destructive"
                          title={t("common.delete")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="font-semibold">{t("backup.restore_confirm_title")}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{t("backup.restore_confirm_desc")}</p>
            <p className="text-xs font-mono bg-muted rounded-lg p-2">{confirmRestore.file_name}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmRestore(null)}
                className="rounded-xl border px-4 h-10 text-sm hover:bg-muted"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => restore.mutate(confirmRestore.id)}
                disabled={restore.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-destructive text-destructive-foreground px-4 h-10 text-sm font-medium disabled:opacity-50"
              >
                {restore.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("backup.restore")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
