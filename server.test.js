const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { WebSocket } = require("ws");

const { createRelayServer } = require("./server");

async function startServer() {
  const relay = createRelayServer();
  await new Promise((resolve) => {
    relay.server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = relay.server.address();
  return {
    relay,
    httpBase: `http://127.0.0.1:${port}`,
    wsBase: `ws://127.0.0.1:${port}`,
  };
}

async function startServerWithToken(sessionToken) {
  const relay = createRelayServer({ sessionToken });
  await new Promise((resolve) => {
    relay.server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = relay.server.address();
  return {
    relay,
    httpBase: `http://127.0.0.1:${port}`,
    wsBase: `ws://127.0.0.1:${port}`,
  };
}

async function stopServer(relay) {
  for (const client of relay.wss.clients) {
    client.terminate();
  }

  await new Promise((resolve) => {
    relay.wss.close(resolve);
  });

  await new Promise((resolve, reject) => {
    relay.server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on("error", reject);
  });
}

async function connectClient(url) {
  const ws = new WebSocket(url);
  await once(ws, "open");
  return ws;
}

function waitForJsonMessage(ws, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeoutMs);

    ws.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function waitForClose(ws, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for WebSocket close"));
    }, timeoutMs);

    ws.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

test("serves the receiver and sender pages", async (t) => {
  const { relay, httpBase } = await startServer();
  t.after(() => stopServer(relay));

  const receiverPage = await httpGet(`${httpBase}/`);
  const senderPage = await httpGet(`${httpBase}/send.html`);

  assert.equal(receiverPage.statusCode, 200);
  assert.match(receiverPage.body, /Tab Cast/);
  assert.equal(senderPage.statusCode, 200);
  assert.match(senderPage.body, /Share a tab to the receiver/);
});

test("notifies the sender when a receiver is connected and forwards messages", async (t) => {
  const { relay, wsBase } = await startServer();
  t.after(() => stopServer(relay));

  const receiver = await connectClient(`${wsBase}/?role=receiver`);
  const sender = new WebSocket(`${wsBase}/?role=sender`);
  const readyMsgPromise = waitForJsonMessage(sender);
  await once(sender, "open");

  t.after(() => receiver.close());
  t.after(() => sender.close());

  const readyMsg = await readyMsgPromise;
  assert.deepEqual(readyMsg, { type: "receiver-ready" });

  const forwardedMessage = waitForJsonMessage(receiver);
  sender.send(JSON.stringify({ type: "offer", sdp: "test-sdp" }));

  assert.deepEqual(await forwardedMessage, { type: "offer", sdp: "test-sdp" });
});

test("rejects WebSocket clients with an invalid role", async (t) => {
  const { relay, wsBase } = await startServer();
  t.after(() => stopServer(relay));

  const client = new WebSocket(`${wsBase}/?role=hacker`);
  const closed = waitForClose(client);
  await once(client, "open");

  assert.deepEqual(await closed, { code: 1008, reason: "Invalid role" });
});

test("closes malformed clients without killing the relay", async (t) => {
  const { relay, wsBase } = await startServer();
  t.after(() => stopServer(relay));

  const badClient = await connectClient(`${wsBase}/?role=sender`);
  const badClose = waitForClose(badClient);
  badClient.send("not json");

  assert.deepEqual(await badClose, { code: 1003, reason: "Invalid JSON" });

  const receiver = await connectClient(`${wsBase}/?role=receiver`);
  const sender = new WebSocket(`${wsBase}/?role=sender`);
  const readyMsgPromise = waitForJsonMessage(sender);
  await once(sender, "open");

  t.after(() => receiver.close());
  t.after(() => sender.close());

  assert.deepEqual(await readyMsgPromise, { type: "receiver-ready" });
});

test("keeps the latest receiver active when an older one disconnects", async (t) => {
  const { relay, wsBase } = await startServer();
  t.after(() => stopServer(relay));

  const sender = new WebSocket(`${wsBase}/?role=sender`);
  await once(sender, "open");
  t.after(() => sender.close());

  const firstReceiver = await connectClient(`${wsBase}/?role=receiver`);
  const firstReady = waitForJsonMessage(sender);
  assert.deepEqual(await firstReady, { type: "receiver-ready" });

  const secondReceiver = await connectClient(`${wsBase}/?role=receiver`);
  const secondReady = waitForJsonMessage(sender);
  t.after(() => firstReceiver.close());
  t.after(() => secondReceiver.close());
  assert.deepEqual(await secondReady, { type: "receiver-ready" });

  await waitForClose(firstReceiver);

  const forwardedMessage = waitForJsonMessage(secondReceiver);
  sender.send(JSON.stringify({ type: "offer", sdp: "latest-only" }));

  assert.deepEqual(await forwardedMessage, { type: "offer", sdp: "latest-only" });
});

test("rejects clients with the wrong session token and accepts the right one", async (t) => {
  const { relay, wsBase } = await startServerWithToken("open-sesame");
  t.after(() => stopServer(relay));

  const rejectedClient = new WebSocket(`${wsBase}/?role=receiver&token=wrong`);
  const rejectedClose = waitForClose(rejectedClient);
  await once(rejectedClient, "open");
  assert.deepEqual(await rejectedClose, { code: 1008, reason: "Invalid token" });

  const receiver = await connectClient(`${wsBase}/?role=receiver&token=open-sesame`);
  const sender = new WebSocket(`${wsBase}/?role=sender&token=open-sesame`);
  const readyMsgPromise = waitForJsonMessage(sender);
  await once(sender, "open");

  t.after(() => receiver.close());
  t.after(() => sender.close());

  assert.deepEqual(await readyMsgPromise, { type: "receiver-ready" });
});
