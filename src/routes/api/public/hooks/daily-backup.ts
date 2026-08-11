import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/daily-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        const expected =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";
        if (!expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runBackup, pruneBackups } = await import("@/lib/backup.server");

        const { data: settings } = await supabaseAdmin
          .from("backup_settings" as never)
          .select("*")
          .limit(1)
          .maybeSingle();

        const s = settings as unknown as
          | {
              id: string;
              daily_enabled: boolean;
              run_hour_utc: number;
              retention_count: number;
              include_files: boolean;
              last_run_at: string | null;
            }
          | null;

        if (!s?.daily_enabled) {
          return Response.json({ skipped: "disabled" });
        }
        const now = new Date();
        if (now.getUTCHours() !== s.run_hour_utc) {
          return Response.json({ skipped: "not_scheduled_hour" });
        }
        if (s.last_run_at && new Date(s.last_run_at).toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) {
          return Response.json({ skipped: "already_ran_today" });
        }

        try {
          const result = await runBackup({
            kind: "scheduled",
            userId: null,
            includeFiles: s.include_files,
          });
          const pruned = await pruneBackups(s.retention_count);
          await supabaseAdmin
            .from("backup_settings" as never)
            .update({ last_run_at: now.toISOString() } as never)
            .eq("id", s.id);
          return Response.json({ ok: true, ...result, pruned });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("[daily-backup] failed:", message);
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
