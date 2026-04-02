import mqtt from "mqtt";
import { bus } from "./events";

const brokerUrl = process.env.MQTT_BROKER;

const userMQTT = process.env.MQTT_USER;
const passwordMQTT = process.env.MQTT_PASSWORD;
const configuredPort = (() => {
  const raw = process.env.MQTT_PORT;
  if (!raw) return null;
  const parsed = Number(String(raw).trim());
  return Number.isFinite(parsed) ? parsed : null;
})();
const controlTopic = process.env.MQTT_TOPIC;
const singleLightRequestTopic = process.env.MQTT_REQUEST_TOPIC;
const responseTopic = process.env.MQTT_RESPONSE_TOPIC;
const singleLightCallbackTopic =
  process.env.MQTT_SINGLE_LIGHT_CALLBACK_TOPIC || responseTopic;
const wifiTopic = process.env.MQTT_WIFI_TOPIC;
const configuredHeartbeatTopic = process.env.MQTT_HEARTBEAT_TOPIC || "";
const heartbeatSubscribeTopics = configuredHeartbeatTopic
  .split(/[\n,]+/g)
  .map((topic) => topic.trim())
  .filter(Boolean);
const LIGHT_COUNT = 16;

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

type LightStateMap = Record<number, boolean>;
type SingleLightCallback = {
  lightId: number;
  on: boolean;
  requestId?: string;
  ok?: boolean;
  message?: string;
};

let client: mqtt.MqttClient | null = null;
let toggleOn = false;
let awaitingGlobalToggleAck = false;
let lightStates: LightStateMap = createInitialLightStates();
let heartbeatState: HeartbeatState = {
  topic: heartbeatSubscribeTopics[0] || "",
  lastSeenAt: null,
  payload: null,
};

function createInitialLightStates() {
  return Array.from({ length: LIGHT_COUNT }, (_, index) => {
    const id = index + 1;
    return [id, false] as const;
  }).reduce<LightStateMap>((acc, [id, value]) => {
    acc[id] = value;
    return acc;
  }, {});
}

function getLightsStatus() {
  return { ...lightStates };
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "on")
      return true;
    if (normalized === "false" || normalized === "0" || normalized === "off")
      return false;
  }
  return null;
}

function parseLightUpdate(raw: string) {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const json = parsed as Record<string, unknown>;
    const action =
      typeof json.action === "string" ? json.action.trim().toLowerCase() : "";
    const parsedAction = (() => {
      const match = action.match(
        /(liga|ligue|desliga|desligue|desligar)\s+(?:a\s+)?luz\s+(\d+)/i,
      );
      if (!match) return null;
      return {
        verb: match[1].toLowerCase(),
        id: parseNumber(match[2]),
      };
    })();
    const actionLightId = parsedAction?.id ?? null;
    const candidateOn =
      parseBoolean(json.on) ??
      parseBoolean(json.luz) ??
      parseBoolean(json.ligada) ??
      parseBoolean(json.state);
    const candidateId =
      parseNumber(json.lightId) ??
      parseNumber(json.light) ??
      parseNumber(json.luz) ??
      parseNumber(json.luzId) ??
      parseNumber(json.id) ??
      actionLightId ??
      (typeof json.luz === "boolean" ? 1 : null) ??
      (typeof json.on === "boolean" ? 1 : null) ??
      (typeof json.ligada === "boolean" ? 1 : null);
    if (!candidateId) return null;
    if (candidateId < 1 || candidateId > LIGHT_COUNT) return null;
    const requestId =
      typeof json.requestId === "string" ? json.requestId : undefined;
    const callbackOk =
      typeof json.ok === "boolean"
        ? json.ok
        : typeof json.success === "boolean"
          ? json.success
          : undefined;
    const callbackMessage =
      typeof json.message === "string"
        ? json.message
        : typeof json.error === "string"
          ? json.error
          : undefined;
    const effectiveOn = (() => {
      if (typeof candidateOn === "boolean") return candidateOn;
      if (parsedAction?.verb === "liga" || parsedAction?.verb === "ligue")
        return true;
      if (
        parsedAction?.verb === "desliga" ||
        parsedAction?.verb === "desligue" ||
        parsedAction?.verb === "desligar"
      )
        return false;
      if (callbackOk === false) return Boolean(lightStates[candidateId]);
      return null;
    })();
    if (typeof effectiveOn !== "boolean") return null;
    return {
      lightId: candidateId,
      on: effectiveOn,
      requestId,
      ok: callbackOk,
      message: callbackMessage,
    } satisfies SingleLightCallback;
  } catch {
    return null;
  }
}

function resolveBrokerUrl() {
  const raw = (brokerUrl || "").trim();
  if (!raw) return process.env.MQTT_BROKER || "";
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
    if (!resolvedBrokerUrl) {
      throw new Error("[MQTT] MQTT_BROKER não definido");
    }
    const port = configuredPort ?? 1883;
    client = mqtt.connect(resolvedBrokerUrl, {
      ...(Number.isFinite(port) ? { port } : {}),
      ...(userMQTT ? { username: userMQTT } : {}),
      ...(passwordMQTT ? { password: passwordMQTT } : {}),
      reconnectPeriod: 2000,
      clean: true,
    });

    client.on("connect", () => {
      const subscribeTopics = Array.from(
        new Set(
          [responseTopic, singleLightCallbackTopic, ...heartbeatSubscribeTopics]
            .map((topic) => (topic ?? "").trim())
            .filter(Boolean),
        ),
      );

      if (subscribeTopics.length === 0) {
        console.log("[MQTT] Nenhum tópico para subscrever (verifique .env).");
        return;
      }

      for (const topic of subscribeTopics) {
        client?.subscribe(topic, { qos: 0 }, (err) => {
          if (err) {
            console.log("[MQTT] Erro ao subscrever", topic, err);
          } else {
            console.log("[MQTT] Subscreveu", topic);
          }
        });
      }
    });
    client.on("error", (err) => {
      console.log("[MQTT] Erro no client", err);
    });
    client.on("message", (t, payload) => {
      const raw = payload.toString();
      const isCallbackTopic =
        t === responseTopic || t === singleLightCallbackTopic;
      let perLightUpdate: SingleLightCallback | null = null;
      if (isCallbackTopic) {
        perLightUpdate = parseLightUpdate(raw);
        if (perLightUpdate) {
          if (perLightUpdate.ok !== false) {
            lightStates[perLightUpdate.lightId] = perLightUpdate.on;
            if (perLightUpdate.lightId === 1) {
              toggleOn = perLightUpdate.on;
            }
          }
          const perLightEvent = {
            kind: "light-grid",
            lights: getLightsStatus(),
            updatedLightId: perLightUpdate.lightId,
            updatedOn: perLightUpdate.on,
          };
          const callbackEvent = {
            kind: "single-light-callback",
            lightId: perLightUpdate.lightId,
            on: perLightUpdate.on,
            requestId: perLightUpdate.requestId,
            ok: perLightUpdate.ok ?? true,
            message: perLightUpdate.message,
            topic: t,
            raw,
          };
          try {
            bus.emit("mqtt", perLightEvent);
            bus.emit("mqtt", callbackEvent);
          } catch (emitErr) {
            console.log("[MQTT] SSE consumidor desconectado", emitErr);
          }
        }
      }
      if (t === responseTopic) {
        if (awaitingGlobalToggleAck) {
          console.log("[MQTT] Global resposta RAW", { t, raw });
          try {
            const json = JSON.parse(raw) as Record<string, unknown>;
            const reported =
              (perLightUpdate?.lightId === 1 ? perLightUpdate.on : null) ??
              parseBoolean(json.on) ??
              parseBoolean(json.ligada) ??
              (typeof json.luz === "boolean" ? json.luz : null);
            if (typeof reported === "boolean") {
              toggleOn = reported;
              lightStates[1] = reported;
              const evt = {
                kind: "toggle",
                on: toggleOn,
                topic: responseTopic,
                raw,
                time: Date.now(),
                lights: getLightsStatus(),
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
  if (!controlTopic) {
    return {
      ok: false,
      on: toggleOn,
      topic: controlTopic,
      message,
      lights: getLightsStatus(),
    };
  }
  let c: mqtt.MqttClient;
  try {
    c = ensureClient();
  } catch (err) {
    return {
      ok: false,
      on: toggleOn,
      topic: controlTopic,
      message:
        err instanceof Error ? err.message : "Falha ao conectar ao broker",
      lights: getLightsStatus(),
    };
  }
  awaitingGlobalToggleAck = true;
  console.log("[MQTT] Iniciando toggle", {
    brokerUrl: resolveBrokerUrl(),
    controlTopic,
    responseTopic,
    message,
    timeoutMs,
  });
  const okPromise = new Promise<boolean>((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const handler = (evt: {
      kind?: string;
      on?: boolean;
      lightId?: number;
    }) => {
      const isToggle = evt.kind === "toggle" && evt.on === targetOn;
      const isLight1Callback =
        evt.kind === "single-light-callback" &&
        evt.lightId === 1 &&
        evt.on === targetOn;
      if (isToggle || isLight1Callback) {
        bus.off("mqtt", handler as any);
        if (timeoutId) clearTimeout(timeoutId);
        resolve(true);
      }
    };
    bus.on("mqtt", handler as any);
    timeoutId = setTimeout(() => {
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
  awaitingGlobalToggleAck = false;
  if (ok) {
    toggleOn = targetOn;
    lightStates[1] = targetOn;
    console.log("[MQTT] OK confirmado, estado atualizado", { on: toggleOn });
  }
  return {
    ok,
    on: toggleOn,
    topic: controlTopic,
    message,
    lights: getLightsStatus(),
  };
}

export async function publishLightState(
  lightId: number,
  targetOn: boolean,
  timeoutMs = 10000,
) {
  if (!singleLightRequestTopic) {
    return {
      ok: false,
      message: "MQTT_REQUEST_TOPIC não definido",
      lightId,
      on: targetOn,
      topic: singleLightRequestTopic,
      lights: getLightsStatus(),
    };
  }
  if (!Number.isInteger(lightId) || lightId < 1 || lightId > LIGHT_COUNT) {
    return {
      ok: false,
      message: "Luz inválida",
      lightId,
      on: targetOn,
      topic: singleLightRequestTopic,
      lights: getLightsStatus(),
    };
  }
  const currentOn = Boolean(lightStates[lightId]);
  if (currentOn === targetOn) {
    return {
      ok: true,
      message: "Callback confirmado",
      lightId,
      on: currentOn,
      topic: singleLightRequestTopic,
      lights: getLightsStatus(),
    };
  }
  let c: mqtt.MqttClient;
  try {
    c = ensureClient();
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Falha ao conectar ao broker",
      lightId,
      on: targetOn,
      topic: singleLightRequestTopic,
      lights: getLightsStatus(),
    };
  }
  const requestId = `${lightId}${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 5)}`;
  const message = JSON.stringify({
    requestId,
    lightId,
    on: targetOn,
    action: targetOn ? `liga luz ${lightId}` : `desligue a luz ${lightId}`,
  });
  const callbackPromise = new Promise<{
    ok: boolean;
    message: string;
    requestId?: string;
  }>((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const handler = (evt: {
      kind?: string;
      lightId?: number;
      on?: boolean;
      requestId?: string;
      ok?: boolean;
      message?: string;
    }) => {
      if (evt.kind !== "single-light-callback") return;
      const sameRequest = evt.requestId && evt.requestId === requestId;
      const fallbackMatch = !evt.requestId && evt.lightId === lightId;
      if (!sameRequest && !fallbackMatch) return;
      if (timeoutId) clearTimeout(timeoutId);
      bus.off("mqtt", handler as any);
      resolve({
        ok: evt.ok !== false,
        message: evt.message || "Callback confirmado",
        requestId: evt.requestId,
      });
    };
    bus.on("mqtt", handler as any);
    timeoutId = setTimeout(() => {
      bus.off("mqtt", handler as any);
      resolve({
        ok: false,
        message: "Timeout aguardando callback JSON",
      });
    }, timeoutMs);
  });
  const publishOk = await new Promise<boolean>((resolve) => {
    c.publish(singleLightRequestTopic, message, { qos: 0 }, (err) => {
      if (err) {
        console.log("[MQTT] Erro ao publicar luz individual", err);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
  if (!publishOk) {
    return {
      ok: false,
      message: "Falha ao enviar comando",
      lightId,
      on: targetOn,
      topic: singleLightRequestTopic,
      lights: getLightsStatus(),
    };
  }
  const callback = await callbackPromise;
  if (!callback.ok) {
    return {
      ok: false,
      message: callback.message,
      lightId,
      on: Boolean(lightStates[lightId]),
      topic: singleLightRequestTopic,
      requestId,
      lights: getLightsStatus(),
    };
  }
  return {
    ok: true,
    message: callback.message,
    lightId,
    on: Boolean(lightStates[lightId]),
    topic: singleLightRequestTopic,
    requestId,
    lights: getLightsStatus(),
  };
}

export function getStatus() {
  try {
    ensureClient();
  } catch {}
  return {
    on: toggleOn,
    topic: controlTopic,
    heartbeat: getHeartbeatStatus(),
    lights: getLightsStatus(),
  };
}

export async function publishWifiConfig(payload: {
  ssid: string;
  password: string;
}) {
  if (!wifiTopic) {
    return { ok: false, message: "MQTT_WIFI_TOPIC não definido" };
  }
  let c: mqtt.MqttClient;
  try {
    c = ensureClient();
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Falha ao conectar ao broker",
    };
  }
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
