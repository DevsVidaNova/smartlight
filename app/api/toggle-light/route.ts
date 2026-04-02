import { NextResponse } from "next/server";
export const runtime = "nodejs";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { publishLightState } from "@/lib/mqtt";

type Body = {
  lightId?: number;
  on?: boolean;
};

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  if (!session.authed) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {}
  if (!Number.isInteger(body.lightId) || typeof body.on !== "boolean") {
    return NextResponse.json(
      { ok: false, message: "Payload inválido" },
      { status: 400 },
    );
  }
  const lightId = body.lightId as number;
  const on = body.on as boolean;
  const result = await publishLightState(lightId, on);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
