"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type HeartbeatData = {
  topic: string;
  lastSeenAt: number | null;
  online: boolean | string;
  payload: {
    status: string;
    uptime_seconds: number;
    uptime_formatted: string;
    uptime_hours: number;
    timestamp: number;
    timestamp_formatted: string;
    wifi?: {
      ssid?: string;
      rssi?: number;
      ip?: string;
    };
  } | null;
};

type Props = {
  heartbeat: HeartbeatData | null;
};

type StatusResponse = {
  heartbeat?: HeartbeatData;
};

function parsePositiveMs(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 1000) return fallback;
  return Math.floor(parsed);
}

function formatElapsed(ms: number) {
  if (ms < 1000) return "agora";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s atrás`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h atrás`;
}

export function HeartbeatCard({ heartbeat }: Props) {
  const staleMs = parsePositiveMs(
    process.env.NEXT_PUBLIC_HEARTBEAT_STALE_MS,
    10000,
  );
  const pollMs = parsePositiveMs(
    process.env.NEXT_PUBLIC_HEARTBEAT_POLL_MS,
    5000,
  );
  const [liveHeartbeat, setLiveHeartbeat] = useState<HeartbeatData | null>(
    heartbeat ?? null,
  );
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    setLiveHeartbeat(heartbeat ?? null);
  }, [heartbeat]);

  useEffect(() => {
    let active = true;
    const pullHeartbeat = async () => {
      try {
        const res = await fetch("/api/status", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json()) as StatusResponse;
        if (active && data.heartbeat) {
          setLiveHeartbeat(data.heartbeat);
        }
      } catch {}
    };
    pullHeartbeat();
    const intervalId = setInterval(pullHeartbeat, pollMs);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [pollMs]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const lastSeenAt = liveHeartbeat?.lastSeenAt ?? null;
  const hasBeat = lastSeenAt !== null;
  const isFresh = hasBeat ? now - lastSeenAt <= staleMs : false;
  const payloadStatus = liveHeartbeat?.payload?.status?.trim().toLowerCase();
  const onlineFlag =
    typeof liveHeartbeat?.online === "string"
      ? liveHeartbeat.online.trim().toLowerCase() === "true"
      : Boolean(liveHeartbeat?.online);
  const isOnline = (onlineFlag || payloadStatus === "online") && isFresh;
  const statusText = isOnline ? "Online" : "Offline";
  const statusColor = isOnline
    ? "hsl(var(--primary))"
    : "hsl(var(--destructive))";
  const elapsedText = hasBeat
    ? formatElapsed(Math.max(0, now - lastSeenAt))
    : "nunca";
  const payload = liveHeartbeat?.payload;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Heartbeat do dispositivo</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          <span className="text-md font-medium">{statusText}</span>
        </div>
        <div className="mt-3 space-y-1 text-sm text-[hsl(var(--muted-foreground))]">
          <p>Último heartbeat: {elapsedText}</p>
          <p>
            Uptime: {payload?.uptime_formatted ?? "--:--:--"} (
            {payload?.uptime_seconds ?? 0}s)
          </p>
          <p>IP: {payload?.wifi?.ip ?? "indefinido"}</p>
          <p>SSID: {payload?.wifi?.ssid ?? "indefinido"}</p>
          <p>RSSI: {payload?.wifi?.rssi ?? 0} dBm</p>
        </div>
      </CardContent>
    </Card>
  );
}
