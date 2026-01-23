const mqtt = require("mqtt");
const { execFile, exec } = require("child_process");

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

const brokerUrl =
  getArg("broker") ||
  process.env.MQTT_BROKER ||
  "mqtt://test.mosquitto.org:1883";

const topic =
  getArg("v2050/lighton1/vidanovajs") ||
  process.env.MQTT_TOPIC ||
  "v2050/lighton2/vidanovajs";

const username = getArg("username") || process.env.MQTT_USERNAME;
const password = getArg("password") || process.env.MQTT_PASSWORD;
const clientId =
  getArg("clientId") ||
  process.env.MQTT_CLIENT_ID ||
  `node-${Math.random().toString(16).slice(2)}`;

const intervalMs = Number(
  getArg("interval") || process.env.MQTT_PUBLISH_INTERVAL || 0,
);

const client = mqtt.connect(brokerUrl, {
  clientId,
  username,
  password,
  reconnectPeriod: 2000,
  clean: true,
});

client.on("connect", () => {
  console.log(`Conectado a ${brokerUrl} como ${clientId}`);
  client.subscribe(topic, { qos: 0 }, (err) => {
    if (err) {
      console.error(`Erro ao subscrever ${topic}: ${err.message || err}`);
      return;
    }
    const msg = `Olá liga luz 1 ${new Date().toISOString()}`;
    client.publish(topic, msg, { qos: 0 });
    console.log(`Publicado em ${topic}: ${msg}`);
  });

  if (intervalMs > 0) {
    setInterval(() => {
      const msg = `Ping ${new Date().toISOString()}`;
      client.publish(topic, msg, { qos: 0 });
      console.log(`Publicado em ${topic}: ${msg}`);
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
        exec(`start "" "https://mqtt-explorer.com"`);
      }
    } else {
      exec(`start "" "https://mqtt-explorer.com"`);
    }
  }
});

client.on("error", (err) => {
  console.error(`Erro: ${err.message || err}`);
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
