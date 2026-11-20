import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy to anonymous JSON blob storage so the browser never talks to the
 * backend host directly (CORS + swap-friendly). Payloads are already encrypted
 * client-side; this route only stores opaque ciphertext.
 */
const STORE = "https://jsonstorage.com";

type CreateBody = { create?: true };
type PutBody = { id: string; writeKey: string; payload: unknown };

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id || !/^[\w.-]{6,64}$/.test(id)) {
    return NextResponse.json({ error: "Ogiltigt id" }, { status: 400 });
  }
  const res = await fetch(`${STORE}/${id}`, { cache: "no-store" });
  if (res.status === 404) {
    return NextResponse.json({ error: "Hittades inte" }, { status: 404 });
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: "Kunde inte läsa molndata" },
      { status: 502 }
    );
  }
  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  let body: CreateBody | PutBody;
  try {
    body = (await req.json()) as CreateBody | PutBody;
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  // Create empty bin
  if ("create" in body && body.create) {
    const res = await fetch(STORE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        v: 1,
        empty: true,
        updatedAt: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Kunde inte skapa synkplats" },
        { status: 502 }
      );
    }
    const json = (await res.json()) as {
      id?: string;
      key?: string;
    };
    if (!json.id || !json.key) {
      return NextResponse.json(
        { error: "Oväntat svar från lagring" },
        { status: 502 }
      );
    }
    return NextResponse.json({ id: json.id, writeKey: json.key });
  }

  // Update
  const put = body as PutBody;
  if (!put.id || !put.writeKey || put.payload === undefined) {
    return NextResponse.json({ error: "Saknar fält" }, { status: 400 });
  }
  if (!/^[\w.-]{6,64}$/.test(put.id)) {
    return NextResponse.json({ error: "Ogiltigt id" }, { status: 400 });
  }

  const res = await fetch(`${STORE}/${put.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Bin-Key": put.writeKey,
    },
    body: JSON.stringify(put.payload),
  });
  if (res.status === 401 || res.status === 403) {
    return NextResponse.json({ error: "Fel synkkod" }, { status: 403 });
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: "Kunde inte spara molndata" },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
