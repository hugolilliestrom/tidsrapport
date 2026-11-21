import { NextRequest, NextResponse } from "next/server";
import { fetchTogglMonth, isTogglConfigured } from "@/lib/toggl";

/**
 * Manual Toggl import for one month. No auto-sync — keeps request count low
 * (typically 2 API calls: time entries + projects).
 */
export async function GET(req: NextRequest) {
  if (!isTogglConfigured()) {
    return NextResponse.json(
      { configured: false, error: "Toggl ej konfigurerad (TOGGL_API_TOKEN)" },
      { status: 503 }
    );
  }

  const monthKey = req.nextUrl.searchParams.get("month")?.trim() || "";
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return NextResponse.json(
      { error: "Ange month=YYYY-MM" },
      { status: 400 }
    );
  }

  try {
    const { tasks, apiCalls, clientFilter } = await fetchTogglMonth(monthKey);
    return NextResponse.json({
      configured: true,
      monthKey,
      tasks,
      imported: tasks.length,
      apiCalls,
      clientFilter,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Toggl-fel";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
