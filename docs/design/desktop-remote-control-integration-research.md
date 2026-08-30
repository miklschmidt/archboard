# Desktop Remote Control as an Archboard transport

Status: rejected as Archboard's controller topology on 2026-08-30.

## Decision

Archboard will connect through the Codex app-server protocol by starting one
configured binary as a private stdio child in dedicated Codex and SQLite homes.
It will not discover or share the Desktop app-server, default Codex home, a
same-user daemon, or the Desktop IPC router. ADR 0019 records the final owner,
epoch, and transport boundary.

Do not make Codex Remote Control, the Desktop coordination socket, or Desktop
process automation part of the workbench contract.

## Why Remote Control looked attractive

Remote Control carries the live state of a Codex host through an OpenAI relay.
The first-party controller can list and continue tasks, send follow-ups, steer
active work, answer questions, approve actions, and review results. The relay
keeps the host off the public internet while files, credentials, permissions,
plugins, and tools remain on the host.

Those are close to the workbench's task controls. The Desktop bundle also shows
that relay messages ultimately contain ordinary app-server JSON-RPC. A relay
stream begins with `initialize`, then carries normal thread requests,
notifications, approvals, and experimental methods such as
`thread/realtime/*`.

## Why it is the wrong integration boundary

Remote Control is a first-party product surface, not a documented third-party
controller API. The supported setup pairs ChatGPT mobile or a supported
Mac/Windows Desktop client with a host signed into the same ChatGPT account and
workspace. The official setup starts in Desktop and may require workspace
policy, MFA, SSO, or passkey verification.

The extracted Desktop controller does substantially more than open a WebSocket:

1. It obtains ChatGPT account and workspace authorization headers.
2. It runs a fresh step-up authorization scoped to
   `codex.remote_control.enroll`.
3. It creates and persists a non-exportable device key.
4. It enrolls that public device identity with the private Codex Remote API.
5. It obtains a short-lived `remote_control_controller_websocket` token.
6. It signs a token-bound challenge before the relay accepts the WebSocket.

The bundled native key adapter explicitly permits only macOS and Windows, and
the Nix Linux package does not contain `remote-control-device-key.node`.
Archboard therefore cannot enroll as a controller on this machine without
reimplementing an undocumented first-party identity, authorization, and relay
client.

The bundled Linux CLI does expose experimental `codex remote-control
start|stop|pair` commands. These make the Linux app-server a host controlled by
first-party ChatGPT clients. They do not make Archboard a controller of the
running Desktop app.

## Three mechanisms that must remain distinct

| Mechanism                            | Role                                                                      | Useful to Archboard?                                             |
| ------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Codex app-server JSON-RPC            | Public client protocol for tasks, events, approvals, and realtime voice   | Yes, primary contract                                            |
| `remoteControl/*` app-server methods | Enable, disable, pair, and inspect the current app-server as a relay host | No for the local workbench controller                            |
| `~/.codex/ipc/ipc.sock`              | Private same-user Desktop coordination and thread-follower router         | No as a product contract; it has no reviewed realtime voice path |

## Capability comparison

| Requirement                                      | Shared Unix app-server                                                 | Remote Control controller                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Attach by explicit task ID                       | Yes                                                                    | Technically yes after private enrollment                                                |
| Subscribe to live task events                    | Yes                                                                    | Yes through relayed app-server JSON-RPC                                                 |
| Send, steer, interrupt, and approve              | Yes                                                                    | Yes through relayed app-server JSON-RPC                                                 |
| Inject Archboard developer instructions          | Yes, through app-server task/turn inputs                               | Technically yes, but still subject to the private controller boundary                   |
| Start `thread/realtime/*` voice                  | Yes                                                                    | Protocol can carry it, but controller enrollment blocks Archboard                       |
| Discover the thread currently visible in Desktop | No supported active-window contract; keep an explicit pane thread link | Remote lists host threads but does not expose a stable "Desktop-active thread" contract |
| Linux implementation                             | Proven with the bundled Nix Codex binary                               | Host role is experimental; first-party controller enrollment is unavailable             |
| Supported and maintainable                       | Yes                                                                    | No                                                                                      |
| Requires OpenAI relay/device pairing             | No                                                                     | Yes                                                                                     |

Remote Control does not solve task identity. Archboard must persist the exact
Codex thread ID attached to each board whether Desktop is also connected or not.

## Sources and inspected evidence

- Official Remote overview:
  <https://learn.chatgpt.com/docs/remote>
- Official Remote connections and security guide:
  <https://learn.chatgpt.com/docs/remote-connections>
- Official app-server documentation:
  <https://learn.chatgpt.com/docs/app-server>
- Extracted Nix Desktop main bundle:
  `/tmp/chatgpt-asar-full.R9GAlK/.vite/build/main-Io6iABGI.js`
  - Remote environment API and controller transport near lines 35,284-36,206.
  - Native device-key adapter and challenge validation near lines
    92,065-92,150.
  - Remote transport construction and required dependencies near lines
    102,179-102,429.
- Extracted shared transport implementation:
  `/tmp/chatgpt-asar-full.R9GAlK/.vite/build/src-DlBR1tzg.js`
  - Relay envelopes, stream multiplexing, and device-key challenge handshake
    near lines 46,553-47,220.
- Generated protocol types:
  `/tmp/tmp.zFMmkWet7i/v2/RemoteControl*.ts` and
  `/tmp/tmp.zFMmkWet7i/v2/ThreadRealtime*.ts`.
- Existing shared-daemon investigation:
  `docs/design/desktop-app-server-sharing-research.md`.

The `/tmp` evidence is reproducible from the installed Nix package and is not a
canonical repository input. This note records the finding; extracted bundles
and generated schemas should remain untracked derived artifacts.
