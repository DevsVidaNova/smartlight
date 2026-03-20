const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const mqtt = require("mqtt");

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

loadEnv(path.join(__dirname, ".env"));

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

const brokerUrl = getArg("broker") || process.env.MQTT_BROKER;

const topicHeartBeat = process.env.MQTT_HEARTBEAT_TOPIC;
const topicRequest = process.env.MQTT_TOPIC;

const userMQTT = process.env.MQTT_USER;
const passwordMQTT = process.env.MQTT_PASSWORD;
const port = Number(process.env.PORT);

const client = mqtt.connect(brokerUrl, {
  port: 1883,
  username: userMQTT,
  password: passwordMQTT,
  reconnectPeriod: 2000,
  clean: true,
});

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "lighton-secret",
    resave: false,
    saveUninitialized: false,
  }),
);

function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  res.redirect("/login");
}

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.authed = true;
    return res.redirect("/control");
  }
  res.status(401).send("Credenciais inválidas");
});

app.get("/control", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "control.html"));
});

app.post("/toggle", requireAuth, (req, res) => {
  toggleOn = !toggleOn;
  const message = toggleOn ? "liga luz 1" : "desligue a luz 1";
  client.publish(topicRequest, message, { qos: 0 });
  res.json({ on: toggleOn, topic: topicRequest, message });
});

app.get("/status", requireAuth, (req, res) => {
  res.json({ on: toggleOn, topic: topicRequest });
});

app.use("/static", express.static(path.join(__dirname, "public")));

app.listen(port, () => {
  console.log(`Servidor web em http://localhost:${port}`);
  console.log(`MQTT broker: ${brokerUrl}`);
  console.log(`Tópico: ${topicHeartBeat}`);
});
