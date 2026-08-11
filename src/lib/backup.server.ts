import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { BACKUP_TABLES, FILE_BUCKETS } from "@/lib/backup-tables";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const PAGE = 1000;

async function dumpTable(db: any, table: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select("*").range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function listBucketFiles(db: any, bucket: string, prefix = ""): Promise<string[]> {
  const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) return [];
  const out: string[] = [];
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) out.push(...(await listBucketFiles(db, bucket, path)));
    else out.push(path);
  }
  return out;
}

export type BackupResult = {
  jobId: string;
  fileName: string;
  storagePath: string;
  sizeBytes: number;
  tablesCount: number;
  rowsCount: number;
  filesCount: number;
};

export async function runBackup(opts: {
  kind: "manual" | "scheduled";
  userId: string | null;
  includeFiles: boolean;
}): Promise<BackupResult> {
  const db = await admin();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `backup-${stamp}.zip`;
  const storagePath = `${new Date().getFullYear()}/${fileName}`;

  const { data: job, error: jobErr } = await db
    .from("backup_jobs" as any)
    .insert({ kind: opts.kind, status: "running", file_name: fileName, created_by: opts.userId } as any)
    .select("id")
    .single();
  if (jobErr) throw new Error(jobErr.message);
  const jobId = (job as any).id as string;

  try {
    const files: Record<string, Uint8Array> = {};
    let rowsCount = 0;
    const tableCounts: Record<string, number> = {};

    for (const table of BACKUP_TABLES) {
      const rows = await dumpTable(db, table);
      tableCounts[table] = rows.length;
      rowsCount += rows.length;
      files[`database/${table}.json`] = strToU8(JSON.stringify(rows));
    }

    let filesCount = 0;
    if (opts.includeFiles) {
      for (const bucket of FILE_BUCKETS) {
        const paths = await listBucketFiles(db, bucket);
        for (const p of paths) {
          const { data: blob, error } = await db.storage.from(bucket).download(p);
          if (error || !blob) continue;
          files[`storage/${bucket}/${p}`] = new Uint8Array(await blob.arrayBuffer());
          filesCount++;
        }
      }
    }

    files["manifest.json"] = strToU8(
      JSON.stringify(
        {
          version: 1,
          created_at: new Date().toISOString(),
          kind: opts.kind,
          tables: tableCounts,
          buckets: opts.includeFiles ? FILE_BUCKETS : [],
          files_count: filesCount,
          rows_count: rowsCount,
        },
        null,
        2,
      ),
    );

    const zipped = zipSync(files, { level: 6 });
    const { error: upErr } = await db.storage
      .from("backups")
      .upload(storagePath, zipped, { contentType: "application/zip", upsert: true });
    if (upErr) throw new Error(upErr.message);

    await db
      .from("backup_jobs" as any)
      .update({
        status: "completed",
        storage_path: storagePath,
        size_bytes: zipped.byteLength,
        tables_count: BACKUP_TABLES.length,
        rows_count: rowsCount,
        files_count: filesCount,
      } as any)
      .eq("id", jobId);

    return {
      jobId,
      fileName,
      storagePath,
      sizeBytes: zipped.byteLength,
      tablesCount: BACKUP_TABLES.length,
      rowsCount,
      filesCount,
    };
  } catch (e) {
    await db
      .from("backup_jobs" as any)
      .update({ status: "failed", error: e instanceof Error ? e.message : String(e) } as any)
      .eq("id", jobId);
    throw e;
  }
}

export async function pruneBackups(retention: number) {
  const db = await admin();
  const { data } = await db
    .from("backup_jobs" as any)
    .select("id, storage_path")
    .eq("status", "completed")
    .order("created_at", { ascending: false });
  const extra = ((data ?? []) as any[]).slice(retention);
  for (const row of extra) {
    if (row.storage_path) await db.storage.from("backups").remove([row.storage_path]);
    await db.from("backup_jobs" as any).delete().eq("id", row.id);
  }
  return extra.length;
}

export async function restoreBackup(jobId: string) {
  const db = await admin();
  const { data: job, error } = await db
    .from("backup_jobs" as any)
    .select("id, storage_path, status")
    .eq("id", jobId)
    .single();
  if (error || !job) throw new Error("Backup not found");
  const path = (job as any).storage_path as string | null;
  if ((job as any).status !== "completed" || !path) throw new Error("Backup file is not available");

  const { data: blob, error: dlErr } = await db.storage.from("backups").download(path);
  if (dlErr || !blob) throw new Error(dlErr?.message ?? "Download failed");

  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  let restoredRows = 0;
  let restoredFiles = 0;
  const skipped: string[] = [];

  for (const table of BACKUP_TABLES) {
    const raw = entries[`database/${table}.json`];
    if (!raw) continue;
    const rows = JSON.parse(strFromU8(raw)) as any[];
    if (!rows.length) continue;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: upErr } = await db.from(table as any).upsert(chunk as any, { onConflict: "id" });
      if (upErr) {
        skipped.push(`${table}: ${upErr.message}`);
        break;
      }
      restoredRows += chunk.length;
    }
  }

  for (const key of Object.keys(entries)) {
    if (!key.startsWith("storage/")) continue;
    const rest = key.slice("storage/".length);
    const slash = rest.indexOf("/");
    if (slash < 0) continue;
    const bucket = rest.slice(0, slash);
    const objPath = rest.slice(slash + 1);
    const { error: upErr } = await db.storage
      .from(bucket)
      .upload(objPath, entries[key], { upsert: true });
    if (!upErr) restoredFiles++;
  }

  await db.from("backup_jobs" as any).update({ restored_at: new Date().toISOString() } as any).eq("id", jobId);
  return { restoredRows, restoredFiles, skipped };
}
