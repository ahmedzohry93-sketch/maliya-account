import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

let cachedIp: string | null = null;

function deviceInfo(): string {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent;
  const platform = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform;
  const screenInfo =
    typeof window !== "undefined" ? `${window.screen?.width}x${window.screen?.height}` : "";
  return [platform, screenInfo, ua].filter(Boolean).join(" | ").slice(0, 400);
}

async function clientIp(): Promise<string | null> {
  if (cachedIp !== null) return cachedIp;
  try {
    const res = await fetch("https://api.ipify.org?format=json", { cache: "force-cache" });
    const json = (await res.json()) as { ip?: string };
    cachedIp = json.ip ?? "";
  } catch {
    cachedIp = "";
  }
  return cachedIp || null;
}

export async function logAudit(
  action: string,
  entity: string,
  entity_id: string | null,
  details?: Json,
  oldValue?: Json,
  newValue?: Json,
) {
  try {
    const ip = await clientIp();
    await supabase.rpc("log_audit", {
      _action: action,
      _entity: entity,
      _entity_id: entity_id as string,
      _details: (details ?? null) as Json,
      _old_value: (oldValue ?? null) as Json,
      _new_value: (newValue ?? null) as Json,
      _device: deviceInfo(),
      _ip_address: ip,
    } as never);
  } catch {
    // silent — audit must never break user flow
  }
}
