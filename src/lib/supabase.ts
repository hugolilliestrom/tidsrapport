import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase admin client (service role).
 * Never import this into client components — use API routes instead.
 */

let admin: SupabaseClient | null = null;

export function getSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    ""
  );
}

export function isSupabaseServerConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  return !!url && !!key;
}

/** Service-role client — bypasses RLS. Server / Route Handlers only. */
export function getSupabaseAdmin(): SupabaseClient {
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !key) {
    throw new Error(
      "Supabase saknas: sätt NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  if (!admin) {
    admin = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return admin;
}

/* ─── Browser auth client (optional magic-link; anon/publishable only) ─── */

export type CloudConfig = {
  url: string;
  anonKey: string;
};

let browserClient: SupabaseClient | null = null;
let cachedConfig: CloudConfig | null | undefined;

function envAnonConfig(): CloudConfig | null {
  const url = getSupabaseUrl();
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    "";
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return envAnonConfig() != null || cachedConfig != null;
}

export async function loadCloudConfig(): Promise<CloudConfig | null> {
  if (cachedConfig !== undefined) return cachedConfig;
  const fromEnv = envAnonConfig();
  if (fromEnv) {
    cachedConfig = fromEnv;
    return fromEnv;
  }
  try {
    const res = await fetch("/api/cloud-config", { cache: "no-store" });
    if (!res.ok) {
      cachedConfig = null;
      return null;
    }
    const json = (await res.json()) as {
      url?: string;
      anonKey?: string;
    };
    if (json.url && json.anonKey) {
      cachedConfig = { url: json.url, anonKey: json.anonKey };
      return cachedConfig;
    }
  } catch {
    // ignore
  }
  cachedConfig = null;
  return null;
}

export async function getSupabase(): Promise<SupabaseClient | null> {
  const config = await loadCloudConfig();
  if (!config) return null;
  if (!browserClient) {
    browserClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}

export function resetSupabaseClient() {
  browserClient = null;
  admin = null;
  cachedConfig = undefined;
}
