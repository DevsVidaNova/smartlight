import { NextResponse } from "next/server";
export const runtime = "nodejs";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

export async function POST() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    sessionOptions,
  );
  session.destroy();
  return NextResponse.json({ ok: true });
}
