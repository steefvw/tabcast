# Tab Cast

Tab Cast is a lightweight way to put a browser tab on another screen.

It streams video and audio from the sender's tab to a receiver page, with an option to record the stream and a simple link for the sender to join.

## Status

This project is intentionally small and is best suited to personal or low-scale use. Media flows peer-to-peer between browsers; the Node server only relays signaling messages.

## Typical Uses

Tab Cast works well for demos, presentations, second-screen viewing, browser-based support or testing, and lightweight stream recording.

It is especially handy when the sender can join from a simple link and the receiver needs to display or optionally record what is being shared.

## How It Works

- **Receiver** (`/`) runs on your local machine and displays the shared tab fullscreen.
- **Sender** (`/send.html`) runs on the remote machine and starts tab sharing via `getDisplayMedia()`.
- **Server** (`server.js`) relays WebSocket signaling messages between exactly one sender and one receiver.
- **Tunnel** such as ngrok exposes the receiver's local server so the sender can reach it. This repo uses ngrok for the default setup, though other tunnel services or directly reachable hosts can also work.

## Security Model

- By default, anyone who can reach the server URL can attempt to connect as a sender or receiver.
- For any internet-exposed use, set `SESSION_TOKEN` and include the same `?token=...` value in both the receiver URL and the sender URL.
- The app is intentionally simple and does not currently implement user accounts, encryption at rest, audit logs, or advanced access control.
- This tool does not verify that you have rights to the content you share or record. That responsibility stays with the operator.

## Quick Start

All setup runs on the receiver machine. First start the local server and ngrok tunnel, then open the receiver locally and the sender from the public ngrok URL.

Use modern Chromium-family browsers for the smoothest experience on both the sender and receiver sides.

What you need: Node 18+, an ngrok account, Chromium-based browsers, and access to both the receiver machine and the sender device.

### Prepare the Receiver Machine

1. Install dependencies and run the test suite:

   ```bash
   npm install
   npm test
   ```

2. Start the local server:

   ```bash
   npm start
   ```

3. Install ngrok on the receiver machine.
   For example, on macOS with Homebrew:

   ```bash
   brew install ngrok
   ```

4. Sign up for a free ngrok account:
   [dashboard.ngrok.com/signup](https://dashboard.ngrok.com/signup)

5. Copy your authtoken from the ngrok dashboard:
   [dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)

6. Authenticate your local ngrok client:

   ```bash
   ngrok config add-authtoken YOUR_TOKEN
   ```

7. In another terminal, start a tunnel to the local server:

   ```bash
   ngrok http 3000
   ```

8. Copy the public `https://...` forwarding URL shown by ngrok.

### Open the App

9. Open the receiver locally:

   ```text
   http://localhost:3000/
   ```

10. Open the sender on the other device using the ngrok URL:

   ```text
   https://<your-ngrok-domain>/send.html
   ```

## Usage

1. Open the receiver page on the machine that should display the shared tab.
2. Click **Start Receiver**.
3. Open the sender URL on the machine that will share a tab.
4. Click **Share Tab** and choose the tab to share.
5. The tab content appears on the receiver.

## Recording

While receiving a stream, click the record button in the top-right corner to start recording. Click again to stop. The browser will download the recording as a `.webm` file.

## Resilience

The connection is designed to recover from transient ICE or WebSocket interruptions. This is especially useful on networks where UDP sessions may expire after a few minutes. Recording is performed from the rendered video element so recordings can continue across reconnections.

## Testing

Run the automated relay tests with:

```bash
npm test
```

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `HTTP_PORT` | `3000` | HTTP listen port |
| `SESSION_TOKEN` | unset | Optional shared secret required for both sender and receiver WebSocket connections |

## Optional Session Token

For any internet-exposed use, protect the session with a shared token.

Start the server with a token:

```bash
export SESSION_TOKEN="$(openssl rand -hex 16)"
npm start
```

Then:

- open the receiver locally at `http://localhost:3000/?token=<your-token>`
- open the sender using the public ngrok URL at `https://<your-ngrok-domain>/send.html?token=<your-token>`

The receiver page will also display the sender URL, including the token.

## Known Limitations

- Only one active sender and one active receiver are supported at a time.
- Browser compatibility is centered on modern Chromium-based browsers.
- Internet-exposed use should be protected with `SESSION_TOKEN`.
- The project does not include TURN infrastructure; some network combinations may still fail if peer-to-peer connectivity cannot be established.
- Recording is receiver-side only.

## Troubleshooting

- If the page shows `Connection rejected: Invalid token`, make sure the `SESSION_TOKEN` value matches on the server, the receiver URL, and the sender URL.
- If recording controls are unavailable or playback behaves unexpectedly, retry with current Chromium-based browsers on both devices.

## Responsible Use

This project is provided under the MIT License and on an "as is" basis. You are solely responsible for how you use it and for complying with applicable law, contracts, workplace rules, and third-party rights.

Tab Cast is a general-purpose browser sharing utility for authorized viewing and presentation workflows. You are responsible for ensuring that your use is permitted by law and by any applicable policies, contracts, or content rights.

Before sharing or recording content with Tab Cast, make sure you have any necessary authorization to do so.

See [LEGAL_NOTICE.md](./LEGAL_NOTICE.md) for the full notice.

## Project Scope

This repository contains only the current WebRTC-based implementation. Earlier experimental Chromecast-emulation work has been removed from the published project to keep the codebase focused and easier to maintain.

## Development Note

This repository was developed with Claude Code (Opus 4.6) and Codex (GPT-5.4).
