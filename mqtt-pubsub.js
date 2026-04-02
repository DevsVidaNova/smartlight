const mqtt = require("mqtt");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

loadEnv(path.join(__dirname, ".env"));

function resolveBrokerUrl() {
  const raw = (process.env.MQTT_BROKER || "").trim();
  if (!raw) return "mqtt://mqtt.silvawesley.com";
  if (/^[a-z]+:\/\//i.test(raw)) return raw;
  return `mqtt://${raw}`;
}

const brokerUrl = resolveBrokerUrl();
const brokerPort = process.env.MQTT_PORT;

const topicRequest = process.env.MQTT_TOPIC;

const userMQTT = process.env.MQTT_USER || process.env.MQTT_USERNAME;
const passwordMQTT = process.env.MQTT_PASSWORD;
const clientId =
  getArg("clientId") ||
  process.env.MQTT_CLIENT_ID ||
  `node-${Math.random().toString(16).slice(2)}`;

const intervalMs = Number(
  getArg("interval") || process.env.MQTT_PUBLISH_INTERVAL || 0,
);
const mqttPort = Number(brokerPort);

const client = mqtt.connect(brokerUrl, {
  clientId,
  ...(userMQTT ? { username: userMQTT } : {}),
  ...(passwordMQTT ? { password: passwordMQTT } : {}),
  ...(Number.isFinite(mqttPort) ? { port: mqttPort } : {}),
  reconnectPeriod: 2000,
  clean: true,
});

client.on("connect", () => {
  console.log(`Conectado a ${brokerUrl} como ${clientId}`);
  console.log(`Tópico de request: ${topicRequest}`);
  client.subscribe(topicRequest, { qos: 0 }, (err) => {
    if (err) {
      console.error(
        `Erro ao subscrever ${topicRequest}: ${err.message || err}`,
      );
      return;
    }
  });

  if (intervalMs > 0) {
    setInterval(() => {
      const msg = `Ping ${new Date().toISOString()}`;
      client.publish(topicRequest, msg, { qos: 0 });
      console.log(`Publicado em ${topicRequest}: ${msg}`);
    }, intervalMs);
  }
});

client.on("message", (t, payload) => {
  const text = payload.toString();
  console.log(`Recebido em ${t}: ${text}`);
  const lower = text.toLowerCase();
  if (lower.includes("liga luz 1")) {
    const appPath = process.env.MQTT_EXPLORER_PATH;
    if (appPath) {
      try {
        execFile(appPath);
      } catch (e) {
        // exec(`start "" "https://mqtt-explorer.com"`);
      }
    } else {
      // exec(`start "" "https://mqtt-explorer.com"`);
    }
  }
});

client.on("error", (err) => {
  console.error(`Erro: ${err.message || err}`);
  const message = String(err?.message || "").toLowerCase();
  if (message.includes("not authorized")) {
    console.error(
      "Falha de autenticação MQTT. Defina MQTT_USER/MQTT_PASSWORD no .env.",
    );
  }
});

client.on("reconnect", () => {
  console.log("Reconectando...");
});

client.on("close", () => {
  console.log("Conexão fechada");
});

process.on("SIGINT", () => {
  client.end(true, () => {
    console.log("Finalizado");
    process.exit(0);
  });
});
