# Technical Design

## Architecture

```
Sender Browser ──WebSocket──▶ ngrok ──▶ Node Server ◀──WebSocket── Receiver Browser
       │                                                                  │
       └──────────────── WebRTC (peer-to-peer, LAN) ─────────────────────┘
```

**Signaling** goes through the server (relayed via ngrok). **Media** goes peer-to-peer via WebRTC — the server never sees video/audio data.

## Server (`server.js`)

Minimal Express + WebSocket relay. Tracks exactly one `sender` and one `receiver` by the `?role=` query param. Every message from one role is forwarded to the other. On disconnect, the peer is notified (`sender-disconnected` / `receiver-disconnected`).

## Sender (`send.html`)

1. Connects to the server as `role=sender`
2. On "Share Tab", calls `getDisplayMedia()` — the user picks a tab (audio included)
3. Creates an `RTCPeerConnection`, adds all tracks, sends an SDP offer
4. Handles ICE restart requests from the receiver by creating a new offer with `{ iceRestart: true }` on the **existing** peer connection (preserves tracks)
5. On `receiver-disconnected`, keeps the stream alive; auto-resends an offer when the receiver reconnects

## Receiver (`index.html`)

1. Shows a **Start Receiver** button — the click satisfies the browser's autoplay policy so video+audio can play without muting
2. Connects as `role=receiver`, waits for an offer
3. On first offer: creates `RTCPeerConnection`, builds a `MediaStream`, assigns it to a `<video>` element
4. On reconnect offer (ICE restart): reuses the existing peer connection; swaps ended tracks for new ones in the same `MediaStream` so the video element keeps rendering

### Recording

- Records from `video.captureStream()`, **not** the raw WebRTC `MediaStream`. This is critical: when ICE reconnects, the WebRTC tracks end (causing `MediaRecorder` to auto-stop), but the video element's capture stream persists because the element itself keeps rendering
- If `MediaRecorder` auto-stops while `wantRecording` is true, it restarts after 1 second (chunks are preserved across restarts)
- On manual stop, accumulated chunks are assembled into a `Blob` and downloaded as `.webm`

## ICE Restart Flow

Some networks drop UDP sessions after ~5 minutes, killing the WebRTC media path while WebSocket signaling (over HTTPS/ngrok) stays alive.

```
1. Receiver detects track ended / connection state "disconnected"
2. Receiver sends { type: "ice-restart" } via WebSocket (debounced 2s)
3. Server relays to sender
4. Sender calls pc.createOffer({ iceRestart: true }) on existing PC
5. Normal offer/answer exchange re-establishes ICE
6. New tracks arrive → swapped into existing MediaStream
7. Video continues; recorder continues via captureStream()
```

## Key Design Decisions

| Decision | Rationale |
|---|---|
| `captureStream()` for recording | Survives ICE reconnections — raw WebRTC tracks end but video element persists |
| Start Receiver button | Single click satisfies autoplay policy for unmuted video — no need to start muted |
| Don't stop on `sender-disconnected` | Sender's WS through ngrok drops and reconnects periodically; killing the session would interrupt recordings |
| Reuse `RTCPeerConnection` on ICE restart | Creating a new PC loses ICE restart semantics; the existing PC retains track bindings |
| `requestAnimationFrame` not used for canvas | Direct `video.captureStream()` is sufficient; no manual frame-drawing needed |

## Historical Note

An earlier prototype explored Chromecast-style emulation via mDNS + CastV2. That approach was abandoned because Google Cast senders verify device certificates against Google's root CA, making practical emulation infeasible without Google-signed certificates. The published repository now focuses only on the supported WebRTC-based implementation.
