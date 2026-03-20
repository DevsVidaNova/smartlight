import mqtt from "mqtt";
import { bus } from "./events";

const brokerUrl = process.env.MQTT_BROKER;

const userMQTT = process.env.MQTT_USER;
const passwordMQTT = process.env.MQTT_PASSWORD;
const controlTopic = process.env.MQTT_TOPIC || "v2050/request/vidanovajs";
const responseTopic =
  process.env.MQTT_RESPONSE_TOPIC || "v2050/response/lightingvidanova";
const wifiTopic = process.env.MQTT_WIFI_TOPIC || "v2050/request/wifi";
const configuredHeartbeatTopic = process.env.MQTT_HEARTBEAT_TOPIC?.trim() || "";
const heartbeatSubscribeTopics = configuredHeartbeatTopic
  ? [configuredHeartbeatTopic]
  : [];

type HeartbeatPayload = {
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
};

type HeartbeatState = {
  topic: string;
  lastSeenAt: number | null;
  payload: HeartbeatPayload | null;
};

let client: mqtt.MqttClient | null = null;
let toggleOn = false;
let heartbeatState: HeartbeatState = {
  topic: configuredHeartbeatTopic,
  lastSeenAt: null,
  payload: null,
};

function resolveBrokerUrl() {
  const raw = (brokerUrl || "").trim();
  if (!raw) return "mqtt://mqtt.silvawesley.com";
  if (/^[a-z]+:\/\//i.test(raw)) return raw;
  return `mqtt://${raw}`;
}

function parseHeartbeat(input: unknown) {
  const toNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  };
  const asObject = (value: unknown): Record<string, unknown> | null => {
    if (value && typeof value === "object")
      return value as Record<string, unknown>;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, unknown>;
        }
      } catch {}
    }
    return null;
  };
  const normalizeStatus = (value: unknown) => {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "online" || normalized === "offline") return normalized;
    return normalized;
  };
  try {
    const parsedRoot = asObject(input);
    if (!parsedRoot) {
      const plain = normalizeStatus(input);
      if (!plain) return null;
      return {
        status: plain,
        uptime_seconds: 0,
        uptime_formatted: "00:00:00",
        uptime_hours: 0,
        timestamp: 0,
        timestamp_formatted: "00:00:00",
      } satisfies HeartbeatPayload;
    }
    const candidates: Record<string, unknown>[] = [parsedRoot];
    const nestedKeys = ["payload", "data", "message", "msg", "body"];
    for (const key of nestedKeys) {
      const nested = asObject(parsedRoot[key]);
      if (nested) candidates.push(nested);
    }
    const source =
      candidates.find((candidate) => {
        const status = normalizeStatus(candidate.status);
        if (status) return true;
        if (typeof candidate.online === "boolean") return true;
        return false;
      }) || parsedRoot;
    const status =
      normalizeStatus(source.status) ??
      (source.online === true
        ? "online"
        : source.online === false
          ? "offline"
          : null);
    if (!status) return null;
    const wifiSource = (() => {
      const direct = source.wifi;
      if (direct && typeof direct === "object")
        return direct as Record<string, unknown>;
      const alt = source.wif;
      if (alt && typeof alt === "object") return alt as Record<string, unknown>;
      return null;
    })();
    const wifi = wifiSource
      ? {
          ssid:
            typeof wifiSource.ssid === "string" ? wifiSource.ssid : undefined,
          rssi: toNumber(wifiSource.rssi),
          ip: typeof wifiSource.ip === "string" ? wifiSource.ip : undefined,
        }
      : undefined;
    const uptimeSeconds = toNumber(source.uptime_seconds) ?? 0;
    const uptimeHours = toNumber(source.uptime_hours) ?? 0;
    const timestamp = toNumber(source.timestamp) ?? 0;
    const uptimeFormatted =
      typeof source.uptime_formatted === "string"
        ? source.uptime_formatted
        : "00:00:00";
    const timestampFormatted =
      typeof source.timestamp_formatted === "string"
        ? source.timestamp_formatted
        : "00:00:00";
    return {
      status,
      uptime_seconds: uptimeSeconds,
      uptime_formatted: uptimeFormatted,
      uptime_hours: uptimeHours,
      timestamp,
      timestamp_formatted: timestampFormatted,
      ...(wifi ? { wifi } : {}),
    } satisfies HeartbeatPayload;
  } catch {
    return null;
  }
}

function getHeartbeatStatus() {
  const status = heartbeatState.payload?.status?.toLowerCase();
  return {
    topic: heartbeatState.topic,
    lastSeenAt: heartbeatState.lastSeenAt,
    online: status === "online",
    payload: heartbeatState.payload,
  };
}

function ensureClient() {
  if (!client) {
    const resolvedBrokerUrl = resolveBrokerUrl();
    const port = 1883;
    client = mqtt.connect(resolvedBrokerUrl, {
      ...(Number.isFinite(port) ? { port } : {}),
      ...(userMQTT ? { username: userMQTT } : {}),
      ...(passwordMQTT ? { password: passwordMQTT } : {}),
      reconnectPeriod: 2000,
      clean: true,
    });

    client.on("connect", () => {
      client?.subscribe(responseTopic, { qos: 0 }, (err) => {
        if (err) {
          console.log("[MQTT] Erro ao subscrever", responseTopic, err);
        } else {
          console.log("[MQTT] Subscreveu global", responseTopic);
        }
      });
      if (!configuredHeartbeatTopic) {
        console.log(
          "[MQTT] MQTT_HEARTBEAT_TOPIC não definido. Heartbeat não será subscrito.",
        );
      }
      for (const topic of heartbeatSubscribeTopics) {
        client?.subscribe(topic, { qos: 0 }, (err) => {
          if (err) {
            console.log("[MQTT] Erro ao subscrever heartbeat", topic, err);
          } else {
            console.log("[MQTT] Subscreveu heartbeat", topic);
          }
        });
      }
    });
    client.on("error", () => {});
    client.on("message", (t, payload) => {
      const raw = payload.toString();
      if (t === responseTopic) {
        console.log("[MQTT] Global resposta RAW", { t, raw });
        try {
          const json = JSON.parse(raw);
          let reported: boolean | null = null;
          if (json && typeof json === "object") {
            if (json.luz === true) reported = true;
            else if (json.luz === false) reported = false;
          }
          if (reported !== null) {
            toggleOn = reported;
            const evt = {
              kind: "toggle",
              on: toggleOn,
              topic: responseTopic,
              raw,
              time: Date.now(),
            };
            try {
              bus.emit("mqtt", evt);
            } catch (emitErr) {
              console.log("[MQTT] SSE consumidor desconectado", emitErr);
            }
            console.log("[MQTT] Global estado atualizado", evt);
          }
        } catch (e) {
          console.log("[MQTT] Falha ao processar resposta", e);
        }
      }
      const isHeartbeatTopic = heartbeatSubscribeTopics.some((topic) => {
        if (topic.includes("#")) {
          const prefix = topic.slice(0, topic.indexOf("#"));
          return t.startsWith(prefix);
        }
        if (topic.includes("+")) {
          const regex = new RegExp(
            `^${topic
              .split("/")
              .map((part) => {
                if (part === "+") return "[^/]+";
                return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              })
              .join("/")}$`,
          );
          return regex.test(t);
        }
        return t === topic;
      });
      if (isHeartbeatTopic) {
        let heartbeatInput: unknown = raw;
        try {
          const jsonPayload = JSON.parse(raw);
          heartbeatInput = jsonPayload;
          console.log("[MQTT] Heartbeat payload JSON", {
            topic: t,
            payload: jsonPayload,
          });
        } catch {
          console.log("[MQTT] Heartbeat payload texto inválido", {
            topic: t,
            payloadText: raw,
          });
        }
        const parsed = parseHeartbeat(heartbeatInput);
        if (!parsed) {
          console.log("[MQTT] Heartbeat inválido", {
            topic: t,
            payloadText: raw,
          });
          return;
        }
        heartbeatState = {
          topic: t,
          lastSeenAt: Date.now(),
          payload: parsed,
        };
        console.log("[MQTT] Heartbeat atualizado", {
          topic: heartbeatState.topic,
          status: parsed.status,
          lastSeenAt: heartbeatState.lastSeenAt,
        });
        const evt = {
          kind: "heartbeat",
          heartbeat: getHeartbeatStatus(),
        };
        try {
          bus.emit("mqtt", evt);
        } catch (emitErr) {
          console.log("[MQTT] SSE consumidor desconectado", emitErr);
        }
      }
    });
  }
  return client!;
}

export async function publishToggleAwaitOk(timeoutMs = 15000) {
  const targetOn = !toggleOn;
  const message = targetOn ? "liga luz 1" : "desligue a luz 1";
  const c = ensureClient();
  console.log("[MQTT] Iniciando toggle", {
    brokerUrl: resolveBrokerUrl(),
    controlTopic,
    responseTopic,
    message,
    timeoutMs,
  });
  const okPromise = new Promise<boolean>((resolve) => {
    const handler = (evt: { on: boolean }) => {
      if (evt.on === targetOn) {
        bus.off("mqtt", handler as any);
        resolve(true);
      }
    };
    bus.on("mqtt", handler as any);
    setTimeout(() => {
      bus.off("mqtt", handler as any);
      console.log("[MQTT] Timeout aguardando OK", { responseTopic, timeoutMs });
      resolve(false);
    }, timeoutMs);
  });
  console.log("[MQTT] Publicando controle", { controlTopic, message });
  c.publish(controlTopic, message, { qos: 0 }, (err) => {
    if (err) {
      console.log("[MQTT] Erro ao publicar", err);
    }
  });
  const ok = await okPromise;
  if (ok) {
    toggleOn = targetOn;
    console.log("[MQTT] OK confirmado, estado atualizado", { on: toggleOn });
  }
  return { ok, on: toggleOn, topic: controlTopic, message };
}

export function getStatus() {
  try {
    ensureClient();
  } catch {}
  return { on: toggleOn, topic: controlTopic, heartbeat: getHeartbeatStatus() };
}

export async function publishWifiConfig(payload: {
  ssid: string;
  password: string;
}) {
  const c = ensureClient();
  const jsonEscape = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const data = `{"ssid":"${jsonEscape(payload.ssid)}","password":"${jsonEscape(
    payload.password,
  )}"}`;
  c.publish(wifiTopic, data, { qos: 0 }, (err) => {
    if (err) {
      console.log("[MQTT] Erro ao publicar Wi‑Fi", err);
    } else {
      console.log("[MQTT] Wi‑Fi enviado", {
        topic: wifiTopic,
        size: data.length,
      });
    }
  });
  return { ok: true };
}
