const express = require("express");
const session = require("express-session");
const path = require("path");
const mqtt = require("mqtt");

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
  getArg("topic") || process.env.MQTT_TOPIC || "v2050/lighton1/vidanovajs";

const adminUser = process.env.ADMIN_USER || "admin";
const adminPass = process.env.ADMIN_PASS || "admin";
const port = Number(process.env.PORT || 3000);

const client = mqtt.connect(brokerUrl, { reconnectPeriod: 2000, clean: true });
let toggleOn = false;

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
  if (username === adminUser && password === adminPass) {
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
  client.publish(topic, message, { qos: 0 });
  res.json({ on: toggleOn, topic, message });
});

app.get("/status", requireAuth, (req, res) => {
  res.json({ on: toggleOn, topic });
});

app.use("/static", express.static(path.join(__dirname, "public")));

app.listen(port, () => {
  console.log(`Servidor web em http://localhost:${port}`);
  console.log(`MQTT broker: ${brokerUrl}`);
  console.log(`Tópico: ${topic}`);
});
