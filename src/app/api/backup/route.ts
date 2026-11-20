import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseServerConfigured,
} from "@/lib/supabase";
import {
  mergeMonthIntoAppData,
  monthDataToRows,
  rowsToMonthSlice,
  type InvoiceRow,
  type MonthRow,
  type TaskRow,
} from "@/lib/supabaseMonth";
import {
  createDefaultAppData,
  type AppData,
  type MonthKey,
} from "@/types/timesheet";

/** Full JSON backup från Supabase */
export async function GET() {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { configured: false, error: "Supabase ej konfigurerad" },
      { status: 503 }
    );
  }

  const sb = getSupabaseAdmin();
  const [{ data: months, error: mErr }, { data: tasks, error: tErr }, { data: invoices, error: iErr }] =
    await Promise.all([
      sb.from("months").select("*").order("month_key"),
      sb.from("tasks").select("*"),
      sb.from("invoice_items").select("*"),
    ]);

  if (mErr || tErr || iErr) {
    return NextResponse.json(
      { error: mErr?.message || tErr?.message || iErr?.message },
      { status: 500 }
    );
  }

  let app = createDefaultAppData();
  for (const m of (months ?? []) as MonthRow[]) {
    const key = m.month_key as MonthKey;
    const monthTasks = ((tasks ?? []) as TaskRow[]).filter(
      (t) => t.month_key === key
    );
    const monthInvoices = ((invoices ?? []) as InvoiceRow[]).filter(
      (e) => e.month_key === key
    );
    const slice = rowsToMonthSlice({
      month: m,
      tasks: monthTasks,
      invoice_items: monthInvoices,
    });
    app = mergeMonthIntoAppData(app, key, slice);
  }

  return NextResponse.json({
    configured: true,
    exportedAt: new Date().toISOString(),
    data: app,
    raw: {
      months: months ?? [],
      tasks: tasks ?? [],
      invoice_items: invoices ?? [],
    },
  });
}

/** Importera AppData JSON → skriv till Supabase */
export async function PUT(req: NextRequest) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { configured: false, error: "Supabase ej konfigurerad" },
      { status: 503 }
    );
  }

  let body: { data?: AppData };
  try {
    body = (await req.json()) as { data?: AppData };
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }
  if (!body.data?.months) {
    return NextResponse.json({ error: "Saknar data.months" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const keys = Object.keys(body.data.months).sort();

  for (const key of keys) {
    const month = body.data.months[key];
    const payload = monthDataToRows(key, month, body.data.billingEntries ?? []);

    const { error: mErr } = await sb.from("months").upsert(
      {
        month_key: key,
        name: payload.month.name,
        project: payload.month.project,
        work_percentage: payload.month.work_percentage,
        manual_carryover_minutes: payload.month.manual_carryover_minutes,
        day_offs: payload.month.day_offs,
      },
      { onConflict: "month_key" }
    );
    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 500 });
    }

    await sb.from("tasks").delete().eq("month_key", key);
    await sb.from("invoice_items").delete().eq("month_key", key);

    if (payload.tasks.length) {
      const { error } = await sb.from("tasks").insert(payload.tasks);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    if (payload.invoice_items.length) {
      const { error } = await sb
        .from("invoice_items")
        .insert(payload.invoice_items);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true, months: keys.length });
}
