"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";
import { HeartbeatCard, type HeartbeatData } from "./heartbeat-card";
import { LightGridModal } from "./components/light-grid-modal";
import {
  LIGHT_COUNT,
  createInitialLightStates,
  type LightStateMap,
} from "./helpers/light-grid";

type StatusResponse = {
  on: boolean;
  topic: string;
  heartbeat?: HeartbeatData;
  lights?: LightStateMap;
};
type ToggleLightResponse = {
  message: string;
  ok: boolean;
  lightId: number;
  on: boolean;
  lights?: LightStateMap;
};
type ToggleEvent = {
  kind?: "toggle";
  on?: boolean;
  topic?: string;
  raw?: string;
  lights?: LightStateMap;
};
type HeartbeatEvent = { kind?: "heartbeat"; heartbeat?: HeartbeatData };
type LightGridEvent = {
  kind?: "light-grid";
  lights?: LightStateMap;
  updatedLightId?: number;
  updatedOn?: boolean;
};

function formatConfirmationMessage(raw: string) {
  try {
    const parsed = JSON.parse(raw) as {
      success?: boolean;
      action?: string;
      luz?: number;
      ligada?: boolean;
      error?: string;
      min?: number;
      max?: number;
    };
    if (!parsed || typeof parsed !== "object") return `Confirmação: ${raw}`;
    if (parsed.success === false) {
      const baseError = parsed.error || "erro";
      const range =
        typeof parsed.min === "number" && typeof parsed.max === "number"
          ? ` (válido: ${parsed.min} a ${parsed.max})`
          : "";
      const action =
        typeof parsed.action === "string" ? ` em "${parsed.action}"` : "";
      return `Falha: ${baseError}${range}${action}`;
    }
    if (typeof parsed.luz === "number" && typeof parsed.ligada === "boolean") {
      return `Confirmação: Luz ${parsed.luz + 1} ${parsed.ligada ? "ligada" : "desligada"}`;
    }
    if (typeof parsed.action === "string") {
      return `Confirmação: ${parsed.action}`;
    }
    return `Confirmação: ${raw}`;
  } catch {
    return `Confirmação: ${raw}`;
  }
}

export function ToggleCard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [lights, setLights] = useState<LightStateMap>(
    createInitialLightStates(),
  );
  const [loadingByLight, setLoadingByLight] = useState<Record<number, boolean>>(
    {},
  );
  const [bulkPending, setBulkPending] = useState(false);
  const [isLightModalOpen, setIsLightModalOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastLightStatus, setLastLightStatus] = useState<{
    lightId: number;
    on: boolean;
  } | null>(null);
  const router = useRouter();
  const closeLightModal = useCallback(() => {
    setIsLightModalOpen(false);
  }, []);

  async function refresh() {
    const res = await fetch("/api/status");
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const data = (await res.json()) as StatusResponse;
    setStatus(data);
    if (data.lights) {
      setLights(data.lights);
      const firstOnEntry = Object.entries(data.lights).find(([, on]) =>
        Boolean(on),
      );
      if (firstOnEntry) {
        setLastLightStatus({
          lightId: Number(firstOnEntry[0]),
          on: true,
        });
      }
    }
  }

  async function toggleLight(lightId: number) {
    const currentOn = Boolean(lights[lightId]);
    const targetOn = !currentOn;
    setLoadingByLight((prev) => ({ ...prev, [lightId]: true }));
    const res = await fetch("/api/toggle-light", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lightId, on: targetOn }),
    });
    if (res.status === 401) {
      setLoadingByLight((prev) => ({ ...prev, [lightId]: false }));
      router.replace("/login");
      return;
    }
    const data = (await res.json()) as ToggleLightResponse;
    if (!data.ok) {
      setMessage(data.message || "Falha ao enviar comando");
      setLoadingByLight((prev) => ({ ...prev, [lightId]: false }));
      return;
    }
    if (data.lights) {
      setLights(data.lights);
    }
    setLastLightStatus({ lightId, on: data.on });
    setMessage(
      `${data.message}: Luz ${lightId + 1} ${data.on ? "ligada" : "desligada"}`,
    );
    setLoadingByLight((prev) => ({ ...prev, [lightId]: false }));
  }

  async function toggleAllLights() {
    if (bulkPending) return;
    const previousLights = { ...lights };
    const hasAnyOn = Object.values(previousLights).some(Boolean);
    const targetOn = !hasAnyOn;
    const targetLightIds = Array.from(
      { length: LIGHT_COUNT },
      (_, index) => index,
    ).filter((lightId) => Boolean(previousLights[lightId]) !== targetOn);
    if (targetLightIds.length === 0) {
      setMessage(
        targetOn
          ? "Todas as luzes já estão ligadas"
          : "Todas as luzes já estão desligadas",
      );
      return;
    }
    setBulkPending(true);
    setMessage(
      targetOn ? "Ligando todas as luzes..." : "Desligando todas as luzes...",
    );
    setLights((prev) => {
      const next = { ...prev };
      for (const id of targetLightIds) {
        next[id] = targetOn;
      }
      return next;
    });
    setLoadingByLight((prev) => {
      const next = { ...prev };
      for (const id of targetLightIds) {
        next[id] = true;
      }
      return next;
    });

    const failedLightIds: number[] = [];
    for (const lightId of targetLightIds) {
      const res = await fetch("/api/toggle-light", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lightId, on: targetOn }),
      });
      if (res.status === 401) {
        setBulkPending(false);
        setLoadingByLight((prev) => {
          const next = { ...prev };
          for (const id of targetLightIds) {
            next[id] = false;
          }
          return next;
        });
        router.replace("/login");
        return;
      }
      const data = (await res.json()) as ToggleLightResponse;
      if (!data.ok) {
        failedLightIds.push(lightId);
      }
      if (data.lights) {
        setLights(data.lights);
      }
      setLoadingByLight((prev) => ({ ...prev, [lightId]: false }));
    }

    if (failedLightIds.length > 0) {
      setLights((prev) => {
        const next = { ...prev };
        for (const failedId of failedLightIds) {
          next[failedId] = Boolean(previousLights[failedId]);
        }
        return next;
      });
      setMessage(
        `Falha em ${failedLightIds.length} luz(es): ${failedLightIds
          .map((id) => id + 1)
          .join(", ")}`,
      );
    } else {
      setMessage(
        targetOn ? "Todas as luzes ligadas" : "Todas as luzes desligadas",
      );
    }
    setBulkPending(false);
  }

  useEffect(() => {
    refresh();
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as
          | ToggleEvent
          | HeartbeatEvent
          | LightGridEvent;
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
          if (data.lights) {
            setLights(data.lights);
          }
          if (data.raw) {
            const parsedMessage = formatConfirmationMessage(data.raw);
            setMessage(parsedMessage);
            try {
              const parsedRaw = JSON.parse(data.raw) as {
                luz?: number;
                ligada?: boolean;
              };
              if (
                typeof parsedRaw.luz === "number" &&
                typeof parsedRaw.ligada === "boolean"
              ) {
                setLastLightStatus({
                  lightId: parsedRaw.luz,
                  on: parsedRaw.ligada,
                });
              }
            } catch {}
          }
        }
        if (data.kind === "light-grid" && data.lights) {
          setLights(data.lights);
          if (data.updatedLightId && typeof data.updatedOn === "boolean") {
            const updatedLightId = data.updatedLightId;
            setLastLightStatus({
              lightId: updatedLightId,
              on: data.updatedOn,
            });
            setLoadingByLight((prev) => ({
              ...prev,
              [updatedLightId]: false,
            }));
          }
        }
      } catch {}
    };
    return () => {
      es.close();
    };
  }, []);

  const isOn = !!status?.on;
  const activeLights = Object.values(lights).filter(Boolean).length;
  const hasAnyLightOn = activeLights > 0;
  const statusLightId = lastLightStatus?.lightId ?? 0;
  const statusLightOn = lastLightStatus
    ? lastLightStatus.on
    : Boolean(lights[statusLightId]);

  return (
    <div className="container mx-auto min-h-screen px-4 py-8">
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Controle de luzes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className={`h-12 w-full text-white ${
                hasAnyLightOn
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-red-600 hover:bg-red-700"
              }`}
              onClick={toggleAllLights}
              disabled={bulkPending}
            >
              {hasAnyLightOn
                ? "Desligar todas as luzes"
                : "Ligar todas as luzes"}
            </Button>
            <Button
              className="h-12 w-full"
              onClick={() => setIsLightModalOpen(true)}
            >
              Abrir painel com 16 luzes
            </Button>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">
              {activeLights} de {LIGHT_COUNT} luzes estão ligadas
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3">
              <Lightbulb
                className="h-5 w-5"
                style={{
                  color: statusLightOn
                    ? "hsl(var(--primary))"
                    : "hsl(var(--muted-foreground))",
                }}
              />
              <span className="text-md">
                {`Luz ${statusLightId + 1} ${statusLightOn ? "ligada" : "desligada"}`}
              </span>
            </div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">
              {message ? message : "Sem mensagens recentes"}
            </div>
          </CardContent>
        </Card>
        <HeartbeatCard heartbeat={status?.heartbeat ?? null} />
      </div>
      <LightGridModal
        open={isLightModalOpen}
        lights={lights}
        loadingByLight={loadingByLight}
        onClose={closeLightModal}
        onToggleLight={toggleLight}
      />
    </div>
  );
}
