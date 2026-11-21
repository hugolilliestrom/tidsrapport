import { NextResponse } from "next/server";
import { isTogglConfigured } from "@/lib/toggl";

export async function GET() {
  return NextResponse.json({ configured: isTogglConfigured() });
}
