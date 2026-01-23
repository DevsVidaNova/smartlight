import mqtt from "mqtt";
import { bus } from "./events";

const brokerUrl = process.env.MQTT_BROKER || "mqtt://test.mosquitto.org:1883";
const controlTopic = process.env.MQTT_TOPIC || "v2050/request/vidanovajs";
const responseTopic =
  process.env.MQTT_RESPONSE_TOPIC || "v2050/response/lightingvidanova";
const wifiTopic = process.env.MQTT_WIFI_TOPIC || "v2050/request/wifi";

let client: mqtt.MqttClient | null = null;
let toggleOn = false;

function ensureClient() {
  if (!client) {
    client = mqtt.connect(brokerUrl, { reconnectPeriod: 2000, clean: true });
    client.on("connect", () => {
      client?.subscribe(responseTopic, { qos: 0 }, (err) => {
        if (err) {
          console.log("[MQTT] Erro ao subscrever", responseTopic, err);
        } else {
          console.log("[MQTT] Subscreveu global", responseTopic);
        }
      });
    });
    client.on("error", () => {});
    client.on("message", (t, payload) => {
      if (t !== responseTopic) return;
      const raw = payload.toString();
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
    });
  }
  return client!;
}

export async function publishToggleAwaitOk(timeoutMs = 15000) {
  const targetOn = !toggleOn;
  const message = targetOn ? "liga luz 1" : "desligue a luz 1";
  const c = ensureClient();
  console.log("[MQTT] Iniciando toggle", {
    brokerUrl,
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
  return { on: toggleOn, topic: controlTopic };
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
