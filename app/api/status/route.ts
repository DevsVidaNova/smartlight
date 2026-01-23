import { NextResponse } from "next/server";
export const runtime = "nodejs";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { getStatus } from "@/lib/mqtt";

export async function GET() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    sessionOptions,
  );
  if (!session.authed) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }
  return NextResponse.json(getStatus());
}
