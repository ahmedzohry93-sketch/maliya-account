import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function assertPermission(supabase: any, userId: string, key: string) {
  const { data, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _permission_key: key,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const createBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { includeFiles?: boolean }) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "backup.create");
    const { runBackup, pruneBackups } = await import("@/lib/backup.server");
    const result = await runBackup({
      kind: "manual",
      userId: context.userId,
      includeFiles: data.includeFiles !== false,
    });
    const { data: settings } = await context.supabase
      .from("backup_settings" as any)
      .select("retention_count")
      .limit(1)
      .maybeSingle();
    const retention = (settings as any)?.retention_count ?? 14;
    await pruneBackups(retention);
    return result;
  });

export const getBackupDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "backup.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin
      .from("backup_jobs" as any)
      .select("storage_path")
      .eq("id", data.jobId)
      .single();
    const path = (job as any)?.storage_path as string | undefined;
    if (!path) throw new Error("Backup file not found");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("backups")
      .createSignedUrl(path, 300, { download: path.split("/").pop() });
    if (error || !signed) throw new Error(error?.message ?? "Could not create link");
    return { url: signed.signedUrl };
  });

export const deleteBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "backup.create");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin
      .from("backup_jobs" as any)
      .select("storage_path")
      .eq("id", data.jobId)
      .single();
    const path = (job as any)?.storage_path as string | undefined;
    if (path) await supabaseAdmin.storage.from("backups").remove([path]);
    await supabaseAdmin.from("backup_jobs" as any).delete().eq("id", data.jobId);
    return { ok: true };
  });

export const restoreFromBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "backup.restore");
    const { restoreBackup } = await import("@/lib/backup.server");
    return await restoreBackup(data.jobId);
  });

export const uploadBackupArchive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileName: string; contentBase64: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "backup.restore");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const binary = Uint8Array.from(atob(data.contentBase64), (c) => c.charCodeAt(0));
    const storagePath = `uploads/${Date.now()}-${data.fileName}`;
    const { error } = await supabaseAdmin.storage
      .from("backups")
      .upload(storagePath, binary, { contentType: "application/zip", upsert: true });
    if (error) throw new Error(error.message);
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("backup_jobs" as any)
      .insert({
        kind: "manual",
        status: "completed",
        file_name: data.fileName,
        storage_path: storagePath,
        size_bytes: binary.byteLength,
        created_by: context.userId,
        destination: "upload",
      } as any)
      .select("id")
      .single();
    if (jobErr) throw new Error(jobErr.message);
    return { jobId: (job as any).id as string };
  });
