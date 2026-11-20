import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseServerConfigured,
} from "@/lib/supabase";
import {
  emptyMonthPayload,
  rowsToMonthSlice,
  type InvoiceRow,
  type MonthPayload,
  type MonthRow,
  type TaskRow,
} from "@/lib/supabaseMonth";

type Ctx = { params: Promise<{ monthKey: string }> };

function badKey(key: string) {
  return !/^\d{4}-\d{2}$/.test(key);
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { configured: false, error: "Supabase ej konfigurerad" },
      { status: 503 }
    );
  }
  const { monthKey } = await ctx.params;
  if (badKey(monthKey)) {
    return NextResponse.json({ error: "Ogiltig month_key" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  const { data: month, error: mErr } = await sb
    .from("months")
    .select("*")
    .eq("month_key", monthKey)
    .maybeSingle();

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  if (!month) {
    const empty = emptyMonthPayload(monthKey);
    return NextResponse.json({
      configured: true,
      exists: false,
      ...empty,
      slice: rowsToMonthSlice(empty),
    });
  }

  const [{ data: tasks, error: tErr }, { data: invoices, error: iErr }] =
    await Promise.all([
      sb.from("tasks").select("*").eq("month_key", monthKey).order("date"),
      sb
        .from("invoice_items")
        .select("*")
        .eq("month_key", monthKey)
        .order("date"),
    ]);

  if (tErr || iErr) {
    return NextResponse.json(
      { error: tErr?.message || iErr?.message },
      { status: 500 }
    );
  }

  const payload: MonthPayload = {
    month: month as MonthRow,
    tasks: (tasks ?? []) as TaskRow[],
    invoice_items: (invoices ?? []) as InvoiceRow[],
  };

  return NextResponse.json({
    configured: true,
    exists: true,
    ...payload,
    slice: rowsToMonthSlice(payload),
  });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { configured: false, error: "Supabase ej konfigurerad" },
      { status: 503 }
    );
  }
  const { monthKey } = await ctx.params;
  if (badKey(monthKey)) {
    return NextResponse.json({ error: "Ogiltig month_key" }, { status: 400 });
  }

  let body: MonthPayload;
  try {
    body = (await req.json()) as MonthPayload;
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  if (!body.month || body.month.month_key !== monthKey) {
    return NextResponse.json(
      { error: "month.month_key måste matcha URL" },
      { status: 400 }
    );
  }

  const sb = getSupabaseAdmin();

  const { error: mErr } = await sb.from("months").upsert(
    {
      month_key: monthKey,
      name: body.month.name,
      project: body.month.project ?? "",
      work_percentage: body.month.work_percentage ?? 40,
      manual_carryover_minutes: body.month.manual_carryover_minutes,
      day_offs: body.month.day_offs ?? {},
    },
    { onConflict: "month_key" }
  );
  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  // Replace tasks for month
  const { error: delT } = await sb
    .from("tasks")
    .delete()
    .eq("month_key", monthKey);
  if (delT) {
    return NextResponse.json({ error: delT.message }, { status: 500 });
  }
  if (body.tasks?.length) {
    const { error: insT } = await sb.from("tasks").insert(
      body.tasks.map((t) => ({
        id: t.id,
        month_key: monthKey,
        date: t.date,
        toggl_id: t.toggl_id,
        category: t.category ?? "",
        description: t.description ?? "",
        minutes: t.minutes ?? 0,
      }))
    );
    if (insT) {
      return NextResponse.json({ error: insT.message }, { status: 500 });
    }
  }

  // Replace invoice_items for month
  const { error: delI } = await sb
    .from("invoice_items")
    .delete()
    .eq("month_key", monthKey);
  if (delI) {
    return NextResponse.json({ error: delI.message }, { status: 500 });
  }
  if (body.invoice_items?.length) {
    const { error: insI } = await sb.from("invoice_items").insert(
      body.invoice_items.map((e) => ({
        id: e.id,
        month_key: monthKey,
        date: e.date,
        toggl_id: e.toggl_id,
        client: e.client ?? "",
        description: e.description ?? "",
        minutes: e.minutes ?? 0,
        hourly_rate: e.hourly_rate,
        include_in_flex: e.include_in_flex === true,
        invoiced: e.invoiced === true,
        invoiced_date: e.invoiced_date,
        invoice_number: e.invoice_number,
      }))
    );
    if (insI) {
      return NextResponse.json({ error: insI.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, month_key: monthKey });
}
