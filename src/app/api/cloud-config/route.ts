import { NextResponse } from "next/server";

/**
 * Exposes public Supabase URL + client key to the browser.
 * Client key = SUPABASE_ANON_KEY (legacy eyJ…) or SUPABASE_PUBLISHABLE_KEY (sb_publishable_…).
 * Safe to expose; RLS protects data. Never expose sb_secret_… / service_role.
 */
export async function GET() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const anonKey =
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    "";

  if (!url || !anonKey) {
    return NextResponse.json({ configured: false }, { status: 200 });
  }

  return NextResponse.json({
    configured: true,
    url,
    anonKey,
  });
}
