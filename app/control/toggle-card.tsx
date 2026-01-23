"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb, Loader2 } from "lucide-react";

type Status = { on: boolean; topic: string };

export function ToggleCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function refresh() {
    const res = await fetch("/api/status");
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const data = (await res.json()) as Status;
    setStatus(data);
  }

  async function toggle() {
    setPending(true);
    setMessage("Aguardando resposta do dispositivo...");
    const res = await fetch("/api/toggle", { method: "POST" });
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const data = (await res.json()) as Status & {
      message: string;
      ok?: boolean;
    };
    if (data.ok) {
      setStatus({ on: data.on, topic: data.topic });
    }
    setMessage(data.message);
    setPending(false);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }

  useEffect(() => {
    refresh();
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as {
          on?: boolean;
          topic?: string;
          raw?: string;
        };
        setStatus((prev) => {
          const nextOn =
            typeof data.on === "boolean" ? data.on : (prev?.on ?? false);
          const nextTopic = data.topic ?? prev?.topic ?? "";
          return { on: nextOn, topic: nextTopic };
        });
        setMessage(data.raw ? `Confirmação: ${data.raw}` : null);
        if (typeof data.on === "boolean") setPending(false);
      } catch {}
    };
    return () => {
      es.close();
    };
  }, []);

  const isOn = !!status?.on;

  return (
    <div className="container mx-auto min-h-screen px-4 py-8">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Controle de Luz 1</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Envie o comando para ligar ou desligar a luz.
            </p>
            <Button
              className="w-full h-12"
              variant={isOn ? "destructive" : "default"}
              onClick={toggle}
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Aguardando confirmação...
                </>
              ) : isOn ? (
                <>
                  <Lightbulb className="mr-2 h-5 w-5" />
                  Desligar luz 1
                </>
              ) : (
                <>
                  <Lightbulb className="mr-2 h-5 w-5" />
                  Ligar luz 1
                </>
              )}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3">
              {pending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">
                    Aguardando confirmação do dispositivo
                  </span>
                </>
              ) : (
                <>
                  <Lightbulb
                    className="h-5 w-5"
                    style={{
                      color: isOn
                        ? "hsl(var(--primary))"
                        : "hsl(var(--muted-foreground))",
                    }}
                  />
                  <span className="text-sm">
                    {isOn ? "Luz ligada" : "Luz desligada"}
                  </span>
                </>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {status ? `Tópico: ${status.topic}` : "Tópico: indefinido"}
            </div>
            <div className="text-sm mt-2">
              {message ? `Mensagem: ${message}` : "Sem mensagens recentes"}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
