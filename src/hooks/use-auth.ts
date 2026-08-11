import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface AuthState {
  session: Session | null;
  user: User | null;
  permissions: Set<string>;
  loading: boolean;
}

let cachedPermissions: Set<string> = new Set();

export function useAuth(): AuthState & {
  signOut: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(cachedPermissions);
  const [loading, setLoading] = useState(true);

  const loadPermissions = async (uid: string | undefined) => {
    if (!uid) {
      cachedPermissions = new Set();
      setPermissions(cachedPermissions);
      return;
    }
    const { data } = await supabase.rpc("get_user_permissions", { _user_id: uid });
    const set = new Set<string>((data ?? []).map((r: { key: string }) => r.key));
    cachedPermissions = set;
    setPermissions(set);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setTimeout(() => loadPermissions(s?.user?.id), 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadPermissions(data.session?.user?.id).finally(() => setLoading(false));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return {
    session,
    user: session?.user ?? null,
    permissions,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshPermissions: () => loadPermissions(session?.user?.id),
  };
}

export function hasPerm(permissions: Set<string>, key: string): boolean {
  return permissions.has(key);
}
