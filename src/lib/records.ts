import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import type { Json } from "@/integrations/supabase/types";

/** Tables that support archive + soft delete. */
export type LifecycleTable =
  | "invoices"
  | "payments"
  | "journal_entries"
  | "checks"
  | "recurring_obligations"
  | "fixed_assets"
  | "products"
  | "partners";

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Hide the record from normal listings; fully restorable. */
export async function archiveRecord(table: LifecycleTable, id: string, snapshot?: Json) {
  const uid = await currentUserId();
  const { error } = await supabase
    .from(table)
    .update({ is_archived: true, archived_at: new Date().toISOString(), archived_by: uid } as never)
    .eq("id", id);
  if (error) throw error;
  await logAudit("archive", table, id, null, snapshot ?? null, null);
}

export async function restoreRecord(table: LifecycleTable, id: string) {
  const uid = await currentUserId();
  const { error } = await supabase
    .from(table)
    .update({
      is_archived: false,
      archived_at: null,
      archived_by: null,
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
    } as never)
    .eq("id", id);
  if (error) throw error;
  await logAudit("restore", table, id, { restored_by: uid } as Json);
}

/** Soft delete — the row stays in the database and can be restored by an admin. */
export async function softDeleteRecord(table: LifecycleTable, id: string, snapshot?: Json) {
  const uid = await currentUserId();
  const { error } = await supabase
    .from(table)
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: uid } as never)
    .eq("id", id);
  if (error) throw error;
  await logAudit("soft_delete", table, id, null, snapshot ?? null, null);
}

/** Apply to every listing query so deleted/archived rows never leak into normal views. */
export function activeOnly<T extends { eq: (c: string, v: unknown) => T }>(q: T): T {
  return q.eq("is_deleted", false).eq("is_archived", false);
}

/** Only deleted or archived rows — for the recycle bin / archive screen. */
export function archivedOnly<T extends { eq: (c: string, v: unknown) => T }>(q: T): T {
  return q.eq("is_archived", true).eq("is_deleted", false);
}
