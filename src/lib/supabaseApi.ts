/**
 * Browser helpers — talk to Next API routes (service role stays on server).
 */
import type { AppData, MonthData, MonthKey, BillingEntry } from "@/types/timesheet";
import { monthDataToRows, type MonthPayload } from "@/lib/supabaseMonth";

export async function fetchCloudStatus(): Promise<{
  configured: boolean;
  url: string | null;
}> {
  try {
    const res = await fetch("/api/cloud-status", { cache: "no-store" });
    if (!res.ok) return { configured: false, url: null };
    return (await res.json()) as { configured: boolean; url: string | null };
  } catch {
    return { configured: false, url: null };
  }
}

export async function fetchMonthFromCloud(monthKey: MonthKey): Promise<{
  ok: boolean;
  slice?: { month: MonthData; billingEntries: BillingEntry[] };
  payload?: MonthPayload;
  error?: string;
}> {
  const res = await fetch(`/api/months/${monthKey}`, { cache: "no-store" });
  if (res.status === 503) {
    return { ok: false, error: "Supabase ej konfigurerad" };
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: j.error ?? res.statusText };
  }
  const j = (await res.json()) as {
    slice: { month: MonthData; billingEntries: BillingEntry[] };
    month: MonthPayload["month"];
    tasks: MonthPayload["tasks"];
    invoice_items: MonthPayload["invoice_items"];
  };
  return {
    ok: true,
    slice: j.slice,
    payload: {
      month: j.month,
      tasks: j.tasks,
      invoice_items: j.invoice_items,
    },
  };
}

export async function saveMonthToCloud(
  key: MonthKey,
  month: MonthData,
  billingEntries: BillingEntry[]
): Promise<{ ok: boolean; error?: string }> {
  const payload = monthDataToRows(key, month, billingEntries);
  const res = await fetch(`/api/months/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: j.error ?? res.statusText };
  }
  return { ok: true };
}

export async function exportBackupFromCloud(): Promise<{
  ok: boolean;
  data?: AppData;
  error?: string;
}> {
  const res = await fetch("/api/backup", { cache: "no-store" });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: j.error ?? res.statusText };
  }
  const j = (await res.json()) as { data: AppData };
  return { ok: true, data: j.data };
}

export async function importBackupToCloud(
  data: AppData
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/backup", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: j.error ?? res.statusText };
  }
  return { ok: true };
}
