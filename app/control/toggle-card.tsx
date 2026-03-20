"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb, Loader2 } from "lucide-react";
import { HeartbeatCard, type HeartbeatData } from "./heartbeat-card";

type StatusResponse = { on: boolean; topic: string; heartbeat?: HeartbeatData };
type ToggleResponse = StatusResponse & { message: string; ok?: boolean };
type ToggleEvent = {
  kind?: "toggle";
  on?: boolean;
  topic?: string;
  raw?: string;
};
type HeartbeatEvent = { kind?: "heartbeat"; heartbeat?: HeartbeatData };

export function ToggleCard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState<number>(Date.now());
  const router = useRouter();

  async function refresh() {
    const res = await fetch("/api/status");
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const data = (await res.json()) as StatusResponse;
    setStatus(data);
  }

  async function toggle() {
    setPending(true);
    setMessage("Aguardando resposta do dispositivo...");
    const res = await fetch("/api/toggle", { method: "POST" });
    if (res.status === 401) {
      setPending(false);
      router.replace("/login");
      return;
    }
    const data = (await res.json()) as ToggleResponse;
    if (data.ok) {
      setStatus((prev) => ({
        on: data.on,
        topic: data.topic,
        heartbeat: prev?.heartbeat,
      }));
    }
    setMessage(data.message);
    setPending(false);
  }

  useEffect(() => {
    refresh();
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as ToggleEvent | HeartbeatEvent;
        if ("heartbeat" in data && data.heartbeat) {
          setStatus((prev) => ({
            on: prev?.on ?? false,
            topic: prev?.topic ?? "",
            heartbeat: data.heartbeat,
          }));
        }
        if ("on" in data || "topic" in data) {
          setStatus((prev) => {
            const nextOn =
              typeof data.on === "boolean" ? data.on : (prev?.on ?? false);
            const nextTopic = data.topic ?? prev?.topic ?? "";
            return { on: nextOn, topic: nextTopic, heartbeat: prev?.heartbeat };
          });
          if (data.raw) {
            setMessage(`Confirmação: ${data.raw}`);
          }
          if (typeof data.on === "boolean") {
            setPending(false);
          }
        }
      } catch {}
    };
    return () => {
      es.close();
    };
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const isOn = !!status?.on;

  return (
    <div className="container mx-auto min-h-screen px-4 py-8">
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Luzes do teto</CardTitle>
          </CardHeader>
          <CardContent>
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
                  DESLIGAR
                </>
              ) : (
                <>
                  <Lightbulb className="mr-2 h-5 w-5" />
                  LIGAR
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
                  <span className="text-md">
                    {isOn ? "Luz ligada" : "Luz desligada"}
                  </span>
                </>
              )}
            </div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">
              {message ? message : "Sem mensagens recentes"}
            </div>
          </CardContent>
        </Card>
        <HeartbeatCard heartbeat={status?.heartbeat ?? null} now={now} />
      </div>
    </div>
  );
}
