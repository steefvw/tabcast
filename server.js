const path = require("path");
const os = require("os");
const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const HTTP_PORT = parseInt(process.env.HTTP_PORT || "3000", 10);
const SESSION_TOKEN = process.env.SESSION_TOKEN || "";
const OPEN = 1;
const VALID_ROLES = new Set(["sender", "receiver"]);

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
}

function createRelayServer(options = {}) {
  const expectedToken = options.sessionToken ?? SESSION_TOKEN;
  const app = express();
  app.use(express.static(path.join(__dirname, "public")));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  let receiver = null;
  let sender = null;

  function sendJson(ws, payload) {
    if (!ws || ws.readyState !== OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }

  wss.on("connection", (ws, req) => {
    const params = new URL(req.url, "http://localhost").searchParams;
    const role = params.get("role");
    const token = params.get("token") || "";

    if (!VALID_ROLES.has(role)) {
      console.warn(`[ws] Rejected connection with invalid role: ${role ?? "missing"}`);
      ws.close(1008, "Invalid role");
      return;
    }

    if (expectedToken && token !== expectedToken) {
      console.warn(`[ws] Rejected ${role} connection with invalid token`);
      ws.close(1008, "Invalid token");
      return;
    }

    console.log(`[ws] ${role} connected (total clients: ${wss.clients.size})`);

    if (role === "receiver") {
      if (receiver && receiver !== ws) {
        receiver.close(1000, "Replaced by newer receiver");
      }
      receiver = ws;
      if (sendJson(sender, { type: "receiver-ready" })) {
        console.log("[ws] Notified sender: receiver-ready");
      }
    } else if (role === "sender") {
      if (sender && sender !== ws) {
        sender.close(1000, "Replaced by newer sender");
      }
      sender = ws;
      if (sendJson(sender, { type: "receiver-ready" })) {
        console.log("[ws] Notified sender: receiver-ready");
      }
    }

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (err) {
        console.warn(`[ws] ${role} sent invalid JSON: ${err.message}`);
        ws.close(1003, "Invalid JSON");
        return;
      }

      console.log(`[ws] ${role} → ${msg.type}`);

      if (role === "sender" && sendJson(receiver, msg)) {
        console.log(`[ws] Forwarded ${msg.type} to receiver`);
      } else if (role === "receiver" && sendJson(sender, msg)) {
        console.log(`[ws] Forwarded ${msg.type} to sender`);
      } else {
        console.log(`[ws] Cannot forward ${msg.type}: peer not connected`);
      }
    });

    ws.on("error", (err) => {
      console.warn(`[ws] ${role} socket error: ${err.message}`);
    });

    ws.on("close", () => {
      console.log(`[ws] ${role} disconnected`);
      if (role === "receiver" && receiver === ws) {
        receiver = null;
        sendJson(sender, { type: "receiver-disconnected" });
      } else if (role === "sender" && sender === ws) {
        sender = null;
        sendJson(receiver, { type: "sender-disconnected" });
      }
    });
  });

  return { app, server, wss };
}

if (require.main === module) {
  const { server } = createRelayServer();
  const localIP = getLocalIP();

  server.listen(HTTP_PORT, "0.0.0.0", () => {
    console.log("");
    console.log("=== Tab Cast ===");
    console.log(`Local:   http://${localIP}:${HTTP_PORT}/`);
    console.log("");
    console.log(`1. Open http://localhost:${HTTP_PORT}/ as the receiver (TV)`);
    console.log(`2. Run: ngrok http ${HTTP_PORT}`);
    console.log("3. Open the ngrok URL + /send.html on the sender device");
    console.log("");
  });

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    server.close();
    process.exit(0);
  });
}

module.exports = { createRelayServer, getLocalIP };
