import { NextResponse } from "next/server";
export const runtime = "nodejs";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { publishToggleAwaitOk } from "@/lib/mqtt";

export async function POST() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    sessionOptions,
  );
  if (!session.authed) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }
  const result = await publishToggleAwaitOk(8000);
  if (!result.ok) {
    return NextResponse.json(
      { ...result, message: "Sem confirmação do dispositivo" },
      { status: 202 },
    );
  }
  return NextResponse.json(result);
  console.log(result);
}
