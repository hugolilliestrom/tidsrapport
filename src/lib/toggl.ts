/**
 * Server-only Toggl Track helpers.
 * Token never leaves the server. Import is manual (button) to stay under rate limits.
 */

import type { TogglImportedTask } from "@/lib/togglMerge";

export type { TogglImportedTask };

type TogglTimeEntry = {
  id: number;
  workspace_id: number;
  project_id: number | null;
  description: string | null;
  start: string;
  duration: number;
  server_deleted_at?: string | null;
};

type TogglProject = {
  id: number;
  name: string;
  color?: string;
  active?: boolean;
  client_id?: number | null;
};

function getToken(): string {
  return process.env.TOGGL_API_TOKEN?.trim() || "";
}

export function isTogglConfigured(): boolean {
  return getToken().length > 0;
}

function authHeader(): string {
  const token = getToken();
  const encoded = Buffer.from(`${token}:api_token`).toString("base64");
  return `Basic ${encoded}`;
}

async function togglFetch<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.track.toggl.com/api/v9${path}`, {
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Toggl ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`
    );
  }
  return (await res.json()) as T;
}

/** YYYY-MM-DD in Europe/Stockholm from an ISO timestamp */
export function dateInStockholm(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** UTC window that fully covers a calendar month in Europe/Stockholm (CET/CEST). */
function monthBoundsIso(monthKey: string): { start: string; end: string } {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error("Ogiltig monthKey (YYYY-MM)");
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const startUtc = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  startUtc.setUTCHours(startUtc.getUTCHours() - 2);
  const endUtc = new Date(Date.UTC(y, m - 1, lastDay, 23, 59, 59));
  endUtc.setUTCHours(endUtc.getUTCHours() + 2);
  return {
    start: startUtc.toISOString(),
    end: endUtc.toISOString(),
  };
}

/** Default = Adshape. Set TOGGL_CLIENT_ID= (empty) to import all clients. */
function getClientFilterId(): number | null {
  if (process.env.TOGGL_CLIENT_ID === "") return null;
  const raw = process.env.TOGGL_CLIENT_ID?.trim() || "68313835";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getTogglClientLabel(): string {
  return process.env.TOGGL_CLIENT_NAME?.trim() || "Adshape";
}

export async function fetchTogglMonth(monthKey: string): Promise<{
  tasks: TogglImportedTask[];
  apiCalls: number;
  clientFilter: string | null;
}> {
  if (!isTogglConfigured()) {
    throw new Error("TOGGL_API_TOKEN saknas");
  }

  const clientId = getClientFilterId();
  const { start, end } = monthBoundsIso(monthKey);
  let apiCalls = 0;

  const entries = await togglFetch<TogglTimeEntry[]>(
    `/me/time_entries?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`
  );
  apiCalls += 1;

  const active = (entries ?? []).filter(
    (e) =>
      !e.server_deleted_at &&
      typeof e.duration === "number" &&
      e.duration > 0 &&
      e.start
  );

  const workspaceId =
    process.env.TOGGL_WORKSPACE_ID?.trim() ||
    (active[0]?.workspace_id ? String(active[0].workspace_id) : "");

  const projectMap = new Map<number, TogglProject>();
  if (workspaceId) {
    const projects = await togglFetch<TogglProject[]>(
      `/workspaces/${workspaceId}/projects?active=true`
    );
    apiCalls += 1;
    for (const p of projects ?? []) projectMap.set(p.id, p);
  }

  const allowedProjectIds = clientId
    ? new Set(
        [...projectMap.values()]
          .filter((p) => p.client_id === clientId)
          .map((p) => p.id)
      )
    : null;

  const [yStr, mStr] = monthKey.split("-");
  const tasks: TogglImportedTask[] = [];

  for (const e of active) {
    const date = dateInStockholm(e.start);
    if (!date.startsWith(`${yStr}-${mStr}`)) continue;

    if (allowedProjectIds) {
      if (e.project_id == null || !allowedProjectIds.has(e.project_id)) {
        continue;
      }
    }

    const project = e.project_id != null ? projectMap.get(e.project_id) : undefined;
    const minutes = Math.max(1, Math.round(e.duration / 60));

    tasks.push({
      togglId: String(e.id),
      date,
      category: project?.name?.trim() || "Toggl",
      categoryColor: project?.color || undefined,
      description: (e.description ?? "").trim(),
      minutes,
    });
  }

  tasks.sort((a, b) => a.date.localeCompare(b.date) || a.togglId.localeCompare(b.togglId));

  return {
    tasks,
    apiCalls,
    clientFilter: clientId ? getTogglClientLabel() : null,
  };
}
