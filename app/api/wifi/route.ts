import { NextResponse } from "next/server";
export const runtime = "nodejs";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { publishWifiConfig } from "@/lib/mqtt";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    sessionOptions,
  );
  if (!session.authed) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }
  const { ssid, password } = (await req.json()) as {
    ssid?: string;
    password?: string;
  };
  const s = (ssid ?? "").trim();
  const p = password ?? "";
  if (!s) {
    return NextResponse.json(
      { message: "SSID é obrigatório" },
      { status: 400 },
    );
  }
  if (s.length > 32) {
    return NextResponse.json(
      { message: "SSID deve ter até 32 caracteres" },
      { status: 400 },
    );
  }
  if (!p) {
    return NextResponse.json(
      { message: "Senha é obrigatória" },
      { status: 400 },
    );
  }
  if (p.length < 8) {
    return NextResponse.json(
      { message: "Senha deve ter pelo menos 8 caracteres" },
      { status: 400 },
    );
  }
  if (p.length > 64) {
    return NextResponse.json(
      { message: "Senha deve ter até 64 caracteres" },
      { status: 400 },
    );
  }
  await publishWifiConfig({ ssid: s, password: p });
  return NextResponse.json({ ok: true });
}
