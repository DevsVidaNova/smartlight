import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { WifiForm } from "./form";

export default async function WifiPage() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    sessionOptions,
  );
  if (!session.authed) {
    redirect("/login");
  }
  return (
    <Card className="w-full max-w-sm md:max-w-md">
      <CardHeader>
        <CardTitle>Configuração de Wi‑Fi</CardTitle>
      </CardHeader>
      <WifiForm />
    </Card>
  );
}
