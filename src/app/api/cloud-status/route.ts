import { NextResponse } from "next/server";
import {
  getSupabaseUrl,
  isSupabaseServerConfigured,
} from "@/lib/supabase";

/** Safe status for UI — never returns service role key */
export async function GET() {
  const url = getSupabaseUrl();
  const configured = isSupabaseServerConfigured();
  return NextResponse.json({
    configured,
    url: configured ? url : null,
    hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    hasPublicUrl: !!url,
  });
}
