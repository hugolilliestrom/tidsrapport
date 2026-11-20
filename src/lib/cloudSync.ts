import type { AppData } from "@/types/timesheet";
import { sanitizeAppData } from "@/lib/timesheetStorage";
import { getSupabase, loadCloudConfig } from "@/lib/supabase";
import {
  decodeKey,
  decodeSyncCode,
  encodeKey,
  encodeSyncCode,
  encryptJson,
  decryptJson,
  randomBytes,
  type SyncCreds,
} from "@/lib/syncCrypto";

const CREDS_KEY = "tidsrapport-sync-creds-v1";
const AUTH_EVENT = "tidsrapport-sync-auth";

export type CloudUser = {
  id: string;
  email: string | null;
  label: string;
  /** supabase = magic link; sync-code = fallback pairing */
  provider: "supabase" | "sync-code";
};

type EncryptedBlob = {
  v: 1;
  ciphertext: string;
  iv: string;
  updatedAt: string;
};

function readSyncCreds(): SyncCreds | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SyncCreds;
    if (!parsed.id || !parsed.writeKey || !parsed.encKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSyncCreds(creds: SyncCreds | null) {
  if (typeof window === "undefined") return;
  if (!creds) localStorage.removeItem(CREDS_KEY);
  else localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export async function isCloudConfigured(): Promise<boolean> {
  return (await loadCloudConfig()) != null;
}

export async function getCloudUser(): Promise<CloudUser | null> {
  const sb = await getSupabase();
  if (sb) {
    const { data } = await sb.auth.getUser();
    if (data.user) {
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        label: data.user.email ?? "Inloggad",
        provider: "supabase",
      };
    }
  }

  const creds = readSyncCreds();
  if (creds) {
    return {
      id: creds.id,
      email: null,
      label: "Synkkod",
      provider: "sync-code",
    };
  }
  return null;
}

export async function signInWithMagicLink(
  email: string
): Promise<{ error?: string }> {
  const sb = await getSupabase();
  if (!sb) return { error: "Molnsynk är inte konfigurerad (Supabase)." };
  const redirectTo =
    typeof window !== "undefined" ? window.location.origin : undefined;
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) return { error: error.message };
  return {};
}

export async function signOutCloud(): Promise<void> {
  const sb = await getSupabase();
  if (sb) await sb.auth.signOut();
  writeSyncCreds(null);
}

export function getSyncCode(): string | null {
  const creds = readSyncCreds();
  if (!creds) return null;
  return encodeSyncCode(creds);
}

export async function createSyncSession(): Promise<{
  code: string;
  error?: string;
}> {
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ create: true }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { code: "", error: j.error ?? "Kunde inte skapa synk" };
  }
  const { id, writeKey } = (await res.json()) as {
    id: string;
    writeKey: string;
  };
  const creds: SyncCreds = {
    id,
    writeKey,
    encKey: encodeKey(randomBytes(32)),
  };
  writeSyncCreds(creds);
  return { code: encodeSyncCode(creds) };
}

export async function connectWithSyncCode(
  code: string
): Promise<{ error?: string }> {
  const creds = decodeSyncCode(code);
  if (!creds) return { error: "Ogiltig synkkod." };
  const res = await fetch(`/api/sync?id=${encodeURIComponent(creds.id)}`, {
    cache: "no-store",
  });
  if (!res.ok) return { error: "Hittade ingen molndata för koden." };
  writeSyncCreds(creds);
  return {};
}

export async function loadFromCloud(): Promise<AppData | null> {
  const sb = await getSupabase();
  if (sb) {
    const { data: auth } = await sb.auth.getUser();
    if (auth.user) {
      const { data, error } = await sb
        .from("user_timesheets")
        .select("data")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (error) {
        console.warn("cloud load failed", error.message);
        return null;
      }
      if (!data?.data) return null;
      return sanitizeAppData(data.data);
    }
  }

  const creds = readSyncCreds();
  if (!creds) return null;
  const res = await fetch(`/api/sync?id=${encodeURIComponent(creds.id)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const blob = (await res.json()) as EncryptedBlob | { empty?: boolean };
  if ("empty" in blob && blob.empty) return null;
  if (!("ciphertext" in blob) || !blob.ciphertext || !blob.iv) return null;
  try {
    const data = await decryptJson<unknown>(
      blob.ciphertext,
      blob.iv,
      decodeKey(creds.encKey)
    );
    return sanitizeAppData(data);
  } catch (e) {
    console.warn("cloud decrypt failed", e);
    return null;
  }
}

export async function saveToCloud(appData: AppData): Promise<boolean> {
  const sb = await getSupabase();
  if (sb) {
    const { data: auth } = await sb.auth.getUser();
    if (auth.user) {
      const { error } = await sb.from("user_timesheets").upsert(
        {
          user_id: auth.user.id,
          data: appData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) {
        console.warn("cloud save failed", error.message);
        return false;
      }
      return true;
    }
  }

  const creds = readSyncCreds();
  if (!creds) return false;
  try {
    const { ciphertext, iv } = await encryptJson(
      appData,
      decodeKey(creds.encKey)
    );
    const payload: EncryptedBlob = {
      v: 1,
      ciphertext,
      iv,
      updatedAt: new Date().toISOString(),
    };
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: creds.id,
        writeKey: creds.writeKey,
        payload,
      }),
    });
    if (!res.ok) {
      console.warn("cloud save failed", await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.warn("cloud save failed", e);
    return false;
  }
}

export function onAuthChange(cb: () => void): () => void {
  let unsubSb: (() => void) | undefined;
  void (async () => {
    const sb = await getSupabase();
    if (!sb) return;
    const { data } = sb.auth.onAuthStateChange(() => cb());
    unsubSb = () => data.subscription.unsubscribe();
  })();

  if (typeof window === "undefined") {
    return () => unsubSb?.();
  }
  const handler = () => cb();
  window.addEventListener(AUTH_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    unsubSb?.();
    window.removeEventListener(AUTH_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
