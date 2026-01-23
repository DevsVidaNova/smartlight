import { NextResponse } from "next/server";
export const runtime = "nodejs";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

export async function POST(req: Request) {
  const { username, password } = (await req.json()) as {
    username: string;
    password: string;
  };

  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASS || "admin";

  if (username === adminUser && password === adminPass) {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(
      cookieStore,
      sessionOptions,
    );
    session.authed = true;
    await session.save();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { message: "Credenciais inválidas" },
    { status: 401 },
  );
}
