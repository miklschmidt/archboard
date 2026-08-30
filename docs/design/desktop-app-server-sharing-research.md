# Sharing the desktop Codex app-server

**Investigated:** 2026-08-30
**Host:** NixOS, ChatGPT/Codex desktop `26.825.51511`; the original inspection
used bundled Codex `0.149.0-alpha.4.3` and standalone `0.149.1`. The selected
standalone contract was rechecked with Codex CLI `0.151.0` on the same date.

## Decision

Archboard should **not attach to the app-server process currently owned by the
desktop app**. On this installation it is a single-client stdio child whose
three standard streams are private Unix socketpairs connected directly to the
Electron main process. It publishes no app-server listener. The visible
`~/.codex/ipc/ipc.sock` is a separate desktop IPC router with a different frame
format and message model; it is not an app-server endpoint.

Archboard should also **not create a shared daemon for the workbench**. It starts
the configured binary as one private stdio child and owns the connection,
capabilities, reverse requests, dynamic tools, and shutdown. The shared-daemon
and direct-WebSocket paths below remain useful findings about Desktop internals,
not supported Archboard modes. The final boundary is recorded in ADR-0019; the
rejected Remote Control alternative is recorded in
[Desktop Remote Control as an Archboard transport](./desktop-remote-control-integration-research.md).

That child uses dedicated Archboard Codex and SQLite homes with a separate
supported sign-in. A host-owned epoch manifest makes prior-child threads
inspect-only and prevents Archboard from cold-resuming persisted dynamic tools
or queued work. This is an accidental-sharing boundary, not a protocol security
boundary against a same-user process deliberately opening those paths.

The desktop contains an **undocumented and version-coupled** shared-daemon
branch. A controlled experiment can start the Nix-packaged Codex binary with
`app-server --listen unix://`, which creates
`~/.codex/app-server-control/app-server-control.sock`, then launch the desktop
app with `CODEX_APP_SERVER_USE_LOCAL_DAEMON=1`. Archboard can connect as another
app-server client through `codex app-server proxy`. This does not require the
OpenAI shell installer or its managed standalone layout. Those are requirements
of the `codex app-server daemon start` launcher, not of the Unix app-server
transport or the desktop's version probe. This shares an externally started
server, not the desktop's private stdio child. Because the switch is
undocumented and the process-global failure domain is larger, it is rejected
for the workbench rather than retained as a capability-probed fallback.

The bundle also contains a second inversion experiment:
`CODEX_APP_SERVER_WS_URL=ws://127.0.0.1:PORT` makes the desktop a WebSocket
client of a listener that Archboard starts and owns. This is not a way to
attach Archboard to the desktop's already-running private child; the listener
must exist first and the desktop must be relaunched. It has less process-global
daemon coupling, but more transport exposure and no supported desktop contract.
OpenAI labels the app-server WebSocket transport experimental and unsupported,
so this deserves a lab-only capability probe, not a supported Archboard mode.

## What is installed

The running application is the official Linux desktop archive repackaged by
`numtide/llm-agents.nix`:

- wrapper: `/nix/store/9w0sagmsi510bsrn98xlz4d209jhhzph-chatgpt-26.818.61809/bin/chatgpt`
- unwrapped application:
  `/nix/store/00jq8xlldnqx1czxd1qx7n1ayazskaq0-chatgpt-unwrapped-26.818.61809/lib/chatgpt/`
- Electron archive: `resources/app.asar` (280,685,616 bytes)
- bundled app-server binary: `resources/codex` (258,236,032 bytes,
  SHA-256 `1c8b7f5221f6779c1e689b00bfa2dd95503f2aa595b9e6c752550ddd8ddf26b6`)
- separately installed CLI: `/home/msc/.cache/.bun/bin/codex` (SHA-256
  `134063e133f0b4244fa3b251acf973d4fe4b4aeeacbdc135211bf480f59f1477`)

The Nix derivation fetches the platform archive by URL and hash, patches ELF
loading, and wraps the result. Its ASAR patch makes two unrelated Linux fixes:
it bypasses a `process.report` fallback in `detect-libc`, and makes copied
plugin material writable. It does not alter app-server launch, transports,
authentication, or IPC. See the upstream
[`unwrapped.nix`](https://github.com/numtide/llm-agents.nix/blob/main/packages/chatgpt/unwrapped.nix),
[`package.nix`](https://github.com/numtide/llm-agents.nix/blob/main/packages/chatgpt/package.nix),
and
[`patch-asar.py`](https://github.com/numtide/llm-agents.nix/blob/main/packages/chatgpt/patch-asar.py).
The installed ASAR contains `sourceMappingURL` comments but no `.map` entries,
so this investigation extracted the named minified modules from the archive
rather than relying on unavailable source maps.

## Observed topology

At inspection time the relevant process tree was:

```text
ChatGPT Electron main, PID 3046
  ├─ bundled codex, PID 3363
  │    -c features.code_mode_host=true app-server --analytics-default-enabled
  │    stdin  socket:[42256] <-> Electron fd 162 socket:[42255]
  │    stdout socket:[42258] <-> Electron fd 164 socket:[42257]
  │    stderr socket:[42260] <-> Electron fd 166 socket:[42259]
  └─ codex-code-mode-host, PID 4908 (child of the app-server)

ChatGPT Electron main
  └─ LISTEN ~/.codex/ipc/ipc.sock (desktop IPC router; not app-server)
```

`ss -xapn` established the peer relationships above. No process listened on
`~/.codex/app-server-control/app-server-control.sock`, and both the bundled and
standalone `codex app-server daemon version` commands failed with `ENOENT` for
that path. The desktop log independently recorded:

```text
Initializing app-server transport
Starting app-server connection hostId=local transport=stdio
Current reported app-server version: currentVersion=0.149.0-alpha.4.3 hostId=local
```

There is no safe fd-level workaround. Duplicating or interposing on one of the
socketpair endpoints would put two readers and writers on a connection whose
request IDs, reverse requests, and initialization state belong to Electron.
That can steal frames or corrupt request correlation. It is not a supported
transport.

The log was
`~/.local/state/codex/logs/2026/08/30/codex-desktop-fa5f7fd8-db5c-44b8-b9f6-c324901636fa-3046-t0-i1-001239-0.log`.

OpenAI's app-server documentation says stdio is newline-delimited JSON, while
the Unix control socket is WebSocket framing over an HTTP Upgrade handshake.
It describes the Unix socket as a local app-server control-plane transport and
`codex app-server proxy` as the stdio bridge to it. A TCP WebSocket listener can
be started with `codex app-server --listen ws://127.0.0.1:4500`, but that
transport is explicitly experimental and unsupported. Plain WebSocket should
remain on loopback or behind an SSH tunnel; non-local use needs authentication
and TLS. See the official
[`App Server transport documentation`](https://developers.openai.com/codex/app-server#transport).

### Why `~/.codex/ipc/ipc.sock` is not reusable

Inspection of `.vite/build/src-DlBR1tzg.js` extracted from `app.asar` shows that
the desktop IPC socket uses:

- a four-byte little-endian length prefix followed by JSON, not JSONL or
  WebSocket frames;
- messages named `broadcast`, `request`, `response`,
  `client-discovery-request`, and `client-discovery-response`;
- an `initialize` request that registers a `clientType` with an `IpcRouter`;
- client discovery and forwarding between desktop clients.

That protocol routes desktop actions between processes. It neither exposes the
app-server connection nor speaks the documented app-server API. Sending an
app-server `initialize` payload to it would at best register a malformed
desktop IPC client. Archboard must not probe it by writing.

The router does enforce same-user filesystem ownership: `~/.codex/ipc` is mode
`0700`, `ipc.sock` is mode `0600`, and the source checks that both directory and
socket are owned by the current UID. This is local ownership isolation, not an
app-server capability or authentication boundary.

## Desktop launch logic and undocumented switches

The extracted desktop code constructs the ordinary local command as:

```text
codex -c features.code_mode_host=true app-server --analytics-default-enabled
```

It copies the desktop process environment, then sets:

```text
LOG_FORMAT=json
RUST_LOG=${RUST_LOG:-warn}
CODEX_INTERNAL_ORIGINATOR_OVERRIDE="Codex Desktop"
```

The live child had those exact three values. It also inherited the user's
general login environment, including the _presence_ of API-key/token variables.
No secret values were printed. A future Archboard launcher should pass an
allowlisted environment rather than copy the full desktop or interactive shell
environment.

Relevant undocumented desktop variables found in the bundle are:

| Variable                              | Observed meaning                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `CODEX_APP_SERVER_USE_LOCAL_DAEMON=1` | On non-Windows local hosts, try the managed Unix-socket daemon before spawning stdio.                  |
| `CODEX_APP_SERVER_WS_URL`             | Override the host configuration's `websocket_url` and make the desktop connect as a WebSocket client.  |
| `CODEX_APP_SERVER_FORCE_CLI=1`        | Defeat both direct-WebSocket selection and the daemon branch, forcing a CLI child.                     |
| `CODEX_CLI_PATH`                      | Override CLI discovery; its presence also defeats the daemon branch.                                   |
| `CODEX_INTERNAL_ORIGINATOR_OVERRIDE`  | Sets the desktop-originator identity used in ChatGPT requests; desktop defaults it to `Codex Desktop`. |
| `CODEX_APP_SERVER_CHATGPT_BASE_URL`   | Converted to `-c chatgpt_base_url=...` on the spawned app-server command.                              |
| `CODEX_APP_SERVER_OPENAI_BASE_URL`    | Converted to `-c openai_base_url=...` on the spawned app-server command.                               |
| `CODEX_SQLITE_HOME`                   | Changes where app-server SQLite state is reconciled/stored.                                            |

The daemon branch is narrower than the variable name suggests. It is selected
only when all of these hold:

1. platform is not Windows and the host is local;
2. `CODEX_APP_SERVER_USE_LOCAL_DAEMON=1`;
3. `CODEX_APP_SERVER_FORCE_CLI` is not `1`;
4. neither `CODEX_CLI_PATH` nor a configured custom CLI command is active;
5. the app has no platform-specific bundled Git path (false on this Linux build);
6. `codex app-server daemon version` connects within 2.5 seconds and reports a
   compatible version.

The desktop does **not** start the daemon in this branch. It probes an already
running daemon and silently uses its normal stdio child if the probe fails. The
bundle's minimum accepted app-server version is `0.141.0`; individual features
have higher gates, including `0.149.1` for `compactionImageBudget` (with a
special allowance for the bundled `0.149.0-alpha.4.3`). These internals are not
a supported desktop configuration contract and can change with any app build.

### Nix-owned Unix listener

An isolated probe verified that the Nix-packaged desktop binary can provide the
expected control endpoint without the OpenAI standalone installer:

```text
CODEX_HOME=<temporary-home> resources/codex \
  -c features.code_mode_host=true app-server --listen unix://
```

The process created `app-server-control/` with mode `0700` and
`app-server-control.sock` with mode `0600`. Against that running process,
`codex app-server daemon version` returned `status: "running"` and the bundled
CLI/app-server version `0.149.0-alpha.4.3`. It also returned
`managedCodexVersion: null`, which proves the control socket does not require a
managed standalone installation once an external owner has started the server.

`codex app-server daemon start` is a different concern. That launcher insists
on `$CODEX_HOME/packages/standalone/current/codex` because it owns the process
and update lifecycle. On this NixOS installation, Nix owns updates. Archboard or
a Nix/system service can own the direct Unix-listener process instead of trying
to make the OpenAI launcher manage a Nix-store binary.

### Direct WebSocket inversion

**Verified bundle behavior:** in extracted `.vite/build/src-DlBR1tzg.js`, the
helper minified as `oB(e)` returns `null` when
`CODEX_APP_SERVER_FORCE_CLI=1`; otherwise it returns
`process.env.CODEX_APP_SERVER_WS_URL ?? e.websocket_url` when that value is a
string. Extracted `.vite/build/main-Io6iABGI.js` calls this selection before it
constructs the normal daemon/stdio transport. A selected URL constructs the
reconnecting WebSocket client directly. Therefore the effective order is:

1. a direct WebSocket URL from `CODEX_APP_SERVER_WS_URL`, or the host
   configuration's `websocket_url`;
2. otherwise, the compatible local daemon when its narrower conditions hold;
3. otherwise, a private stdio CLI child.

`CODEX_APP_SERVER_FORCE_CLI=1` skips the first two. When a direct URL is
selected, `CODEX_APP_SERVER_USE_LOCAL_DAEMON=1` has no effect because transport
selection never reaches the daemon branch.

This enables inversion, not attachment: Archboard could start an exact-version
app-server with an ephemeral loopback listener, connect its own independent
client, set `CODEX_APP_SERVER_WS_URL` for a newly launched desktop process, and
then let the desktop connect as another client. The existing desktop-owned
stdio child cannot be converted into or exposed as that listener. Whether one
listener safely supports the two clients' complete simultaneous workloads is
still unverified on this installation.

The bundle applies a notable network policy. It connects directly only when
the parsed hostname is exactly `localhost`, `127.0.0.1`, or `[::1]`. Every
other hostname gets a SOCKS agent fixed at
`socks5h://127.0.0.1:1080`. The direct-WebSocket construction also passes no
`getWebsocketHandshake`, so this environment override supplies neither custom
headers nor subprotocols. OpenAI's documented listener authentication uses a
Bearer token during the WebSocket handshake. Consequently, a non-loopback or
authenticated listener is not a safe Archboard integration through this
environment variable unless a future desktop build exposes and verifies the
required handshake. URL credentials are not an equivalent substitute.

Compared with `CODEX_APP_SERVER_USE_LOCAL_DAEMON=1`, the loopback inversion
lets Archboard own the server lifecycle and avoids the daemon's fixed control
socket and daemon-wide state. The daemon experiment, however, stays on a
mode-restricted Unix socket and has a built-in version probe plus stdio
fallback. Both desktop switches are undocumented and version-coupled. The
WebSocket override is the weaker production choice because the underlying
transport is officially experimental and because a TCP listener broadens the
same-host access boundary. Keep it lab-only; retain an Archboard-owned stdio
child as the supported path.

## Protocol and capability differences

The two installed binaries generated byte-for-byte identical experimental JSON
schema trees in this investigation: 401 files, approximately 4.9 MiB each, and
no `diff -qr` differences. This is useful evidence of current wire
compatibility, not a forward-compatibility promise. OpenAI explicitly says
generated schemas are specific to the Codex version that produced them and
that experimental APIs have no backwards-compatibility guarantee.

| Concern                         | Current desktop child                                         | Archboard standalone default                                 |
| ------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| Binary                          | bundled `0.149.0-alpha.4.3`                                   | installed `0.149.1`                                          |
| Transport                       | one private stdio/socketpair connection                       | Archboard-owned stdio child                                  |
| Forced config                   | `features.code_mode_host=true`; first-party analytics default | none unless Archboard opts in                                |
| Client identity                 | `Codex Desktop`, desktop build version                        | explicit Archboard name/title/version                        |
| Experimental API                | desktop always sends `experimentalApi: true`                  | opt in only for methods Archboard implements                 |
| MCP extensions                  | desktop advertises its OpenAI form/elicitation support        | advertise only implemented extensions                        |
| Notifications                   | desktop suppresses an internal exact-method list              | Archboard chooses its own list                               |
| Attestation on this Linux build | `requestAttestation: false`                                   | false/omitted                                                |
| UI mediation                    | desktop handles approvals, forms, and desktop-only requests   | Archboard must implement or avoid each advertised capability |

The app-server handshake is per connection: a client sends `initialize`, then
`initialized`; repeated initialization is rejected. Client capabilities are
therefore not inherited from another client. This is another reason that
"borrowing" the desktop connection is the wrong abstraction. Each client
should have its own transport and truthful capability declaration.

## Authentication and attestation

Both binaries resolve `codexHome` to `/home/msc/.codex`. A controlled standalone
probe sent `initialize`, `initialized`, and then
`account/read { refreshToken: false }`. It reported a ChatGPT-managed account,
plan `pro`, and `requiresOpenaiAuth: true`. No turn was started and no token was
refreshed. This verifies that a standalone Archboard process can use the
existing persisted Codex authentication without the desktop process. It was a
read-only feasibility probe, not the selected ownership design.

OpenAI documents ChatGPT-managed auth as Codex-owned OAuth tokens persisted to
disk and refreshed automatically. App-server also supports API-key and other
auth modes through its account RPCs. See
[`Auth endpoints`](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md#auth-endpoints).
Sharing `CODEX_HOME` therefore shares credentials and user configuration even
when processes are isolated; Archboard must not expose `account/logout`, login,
or config-writing operations without an explicit user action.

The accepted design does not share that home. Archboard uses a dedicated Codex
and SQLite home with its own supported sign-in. It may seed selected non-secret
configuration once and pin invariants through explicit `-c` overrides, but it
does not symlink mutable `auth.json` or `config.toml`, export a bearer token from
another app-server, or inherit a `CODEX_SQLITE_HOME` override.

Attestation is a reverse request from app-server to a capable desktop client,
not a token placed in the child environment. The desktop initializes with
`requestAttestation: supportsAttestationRequests()` and registers a handler for
`attestation/generate`. On supported builds the handler uses a packaged native
device-check addon and returns an opaque `v1...` token. The current bundle's
support predicate is macOS or Windows, so it is false on this Linux host.

OpenAI documents that app-server requests attestation just in time and omits
the upstream attestation header when no initialized client opted in. An
Archboard client must leave the capability false unless it actually implements
the reverse request. See
[`Attestation generation`](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md#attestation-generation).

## Security and ownership constraints

A shared daemon would reduce process count, but it creates a larger trust and
failure domain:

- every same-UID client reaching the mode-`0700` control directory can exercise
  the app-server API with the user's persisted account;
- clients share process-global runtime state, including ephemeral skill roots,
  remote-control state, caches, environment, and lifecycle;
- one client can invoke account/config/plugin mutations that affect the other;
- restarting or upgrading the daemon interrupts both surfaces;
- the desktop's UI prompts and attestation handler are capabilities of its own
  connection, not automatically services for Archboard's connection.

Unix ownership protects against other local users, but it does not isolate two
same-user clients. A standalone child preserves process isolation while still
sharing only the intended persisted account and configuration.

A loopback TCP listener has a different boundary: it prevents access from the
network but does not use the daemon socket's filesystem owner and mode checks.
If the inversion experiment is run, bind an ephemeral port on `127.0.0.1`
explicitly, keep the listener alive only for the test, reject unexpected
clients where the protocol permits, and never publish it on `0.0.0.0`. The
desktop branch's fixed SOCKS behavior and absent handshake customization are
additional reasons not to use a non-loopback URL.

## Safe capability probe and fallback

The following probe sequence is read-only and does not contact the private
desktop stdio stream or write to desktop IPC:

1. Run `codex --version` and the desktop bundle's `resources/codex --version`.
2. Run `codex app-server daemon version`. Success plus a same-user socket at
   `$CODEX_HOME/app-server-control/app-server-control.sock` establishes only
   that the managed control plane is present. `ENOENT` means it is absent.
3. Generate schemas from the exact selected binary into a temporary directory
   with `codex app-server generate-json-schema --experimental --out DIR` and
   compare the methods Archboard needs.
4. Spawn `codex app-server --listen stdio://`, send a minimal truthful
   `initialize`, then `initialized` and
   `account/read { "refreshToken": false }`. Redact account identity and stop
   the child. Do not start a thread during the probe.
5. For the Unix-sharing experiment, start the exact Nix-selected binary with
   `app-server --listen unix://`, verify the socket ownership and mode, then
   require `app-server daemon version` to report the same version before
   relaunching the desktop.
6. For a separately authorized WebSocket experiment only, start the exact
   binary with `--listen ws://127.0.0.1:EPHEMERAL_PORT`, connect one Archboard
   client, then relaunch the desktop with `CODEX_APP_SERVER_WS_URL` set to that
   URL. Abort to stdio if either independent initialization fails. Do not probe
   the private desktop child's fds or `~/.codex/ipc/ipc.sock`.

Observed result on 2026-08-30:

```json
{
	"initialize": {
		"userAgent": "Codex Desktop/0.149.1 (NixOS 26.11.0; x86_64) unknown (archboard_capability_probe; 0)",
		"codexHome": "/home/msc/.codex",
		"platformFamily": "unix",
		"platformOs": "linux"
	},
	"account": {
		"type": "chatgpt",
		"planType": "pro",
		"requiresOpenaiAuth": true
	}
}
```

Fallback policy:

1. Default to an Archboard-owned stdio child from the selected `codex` binary.
2. Generate or verify bindings against that exact version; do not assume the
   desktop bundle and PATH binary remain aligned.
3. Advertise only capabilities Archboard handles, and treat unknown methods or
   fields as a version mismatch with an actionable error.
4. Do not discover or try a shared daemon as a production fallback.
5. Never treat `~/.codex/ipc/ipc.sock` as an app-server endpoint.

### Codex 0.151.0 contract recheck

`codex app-server generate-ts --experimental` is required. Omitting
`--experimental` removes the realtime client methods even though some realtime
notification types remain, so a nonexperimental generated tree is an invalid
workbench contract.

The 0.151.0 experimental tree adds a smaller coordination seam than the Desktop
MCP bundle: `thread/start.dynamicTools` persists an eager function or namespace
catalogue, and calls arrive on the same connection as typed `item/tool/call`
server requests carrying `threadId`, `turnId`, `callId`, namespace, tool, and
decoded arguments. Archboard can therefore mediate its six coordination tools
inside the owned session. No MCP child, private host socket, or untyped metadata
hop is required.

Persistence makes the ownership boundary stricter than transport alone.
Version 0.151.0 restores dynamic tools from rollout metadata, persists queue
state separately, and can dispatch queued work during a cold resume. Archboard
therefore uses a dedicated `CODEX_HOME`, an explicitly dedicated
`CODEX_SQLITE_HOME`, and its own supported sign-in. A host-owned epoch manifest
outside both Codex stores makes older threads list/read-only and refuses resume,
fork, turn, queue-start, and tool execution on a replacement child. This prevents
accidental sharing; it cannot stop another same-user process that deliberately
opens those paths because 0.151.0 has no owner capability.

The same tree exposes realtime V3 startup context through
`includeStartupContext`, role-bearing `initialItems`,
`realtimeStartInstructions`, and `realtimeEndInstructions`. Archboard's accepted
voice contract attaches realtime to a persistent configurable fast coordinator
linked to the pane's workhorse. Each start supplies a fresh semantic brief;
selection and settled human changes arrive as live developer context. The
coordinator remains capable under normal thread permissions. It queues only to
an Archboard-created workhorse with proven persistent instructions; attached
busy work is steered with exact additional context when valid or refused until
idle. Workhorse lifecycle events become ordered callbacks instead of blocking in
a wait call. Realtime V3 does not expose typed dynamic-tool calls, so spoken
approval delegates the final reply into a later ordinary coordinator turn,
which returns the schema-constrained verdict through a separate resolver tool.

## Experimental shared-server validation, if pursued

The isolated Unix-listener/version probe was performed in a temporary Codex
home and its process was stopped afterward. Relaunching the desktop and testing
two simultaneous clients still changes live runtime state and was not performed.
A later, explicit daemon experiment should:

1. start the Nix-selected binary directly with `app-server --listen unix://`
   and the exact CLI version Archboard intends to support;
2. confirm directory/socket ownership and mode before connecting;
3. initialize two independent proxy clients and verify simultaneous read-only
   `account/read`, `model/list`, and thread subscription behavior;
4. relaunch the desktop with `CODEX_APP_SERVER_USE_LOCAL_DAEMON=1` and verify its
   log reports a WebSocket/Unix transport rather than stdio;
5. exercise approvals, interruption, desktop restart, daemon restart, version
   mismatch, and one client disconnecting while the other remains active;
6. verify that process-global operations are either prohibited by Archboard or
   have an explicit ownership contract;
7. remove the opt-in and confirm the desktop returns to its private stdio child
   and Archboard falls back to its standalone child.

Without those gates, sharing leaves more states, coupling, and security surface
than the single saved process justifies.

A direct-WebSocket inversion experiment needs separate gates:

1. start an exact-version app-server on an ephemeral `127.0.0.1` listener and
   initialize Archboard as the first client;
2. relaunch the desktop with only `CODEX_APP_SERVER_WS_URL` added and verify its
   log reports the expected URL transport without spawning a private child;
3. prove two independent initializations, request-ID isolation, notifications,
   approvals, interruption, reconnect, and one-client disconnect behavior;
4. verify the port is loopback-only and closes when the Archboard-owned server
   exits;
5. relaunch without the variable and confirm the desktop returns to its private
   stdio child;
6. fail closed to Archboard's standalone stdio child on any version, handshake,
   listener-ownership, or multi-client failure.

Passing those gates would support only an explicitly experimental integration
for the tested desktop and CLI versions. It would not turn the undocumented
environment variable or the WebSocket transport into a supported contract.

## Commands and paths inspected

Representative read-only commands:

```bash
codex --version
codex app-server --help
codex app-server daemon --help
codex app-server proxy --help
ps -eo pid,ppid,comm,args --sort=pid | rg -i 'codex|chatgpt|openai'
ss -xapn
find /proc/3363/fd -maxdepth 1 -type l -printf '%f -> %l\n'
perl -0ne '...print environment variable names only...' /proc/3363/environ
stat -c '%A %a %U:%G %n' ~/.codex/ipc ~/.codex/ipc/ipc.sock
asar list /nix/store/.../lib/chatgpt/resources/app.asar
asar extract-file /nix/store/.../lib/chatgpt/resources/app.asar \
  .vite/build/src-DlBR1tzg.js
asar extract-file /nix/store/.../lib/chatgpt/resources/app.asar \
  .vite/build/main-Io6iABGI.js
codex app-server generate-json-schema --experimental --out DIR
codex app-server daemon version
```

Other inspected files:

- `/nix/store/.../lib/chatgpt/resources/app.asar`:
  `.vite/build/main-Io6iABGI.js`, `.vite/build/src-DlBR1tzg.js`
- `/nix/store/.../lib/chatgpt/resources/owl-electron-app.json`
- `/nix/store/.../lib/chatgpt/resources/linux-package-metadata.json`
- `/proc/3046/{environ,fd}` and `/proc/3363/{environ,fd}`
- `~/.codex/ipc/ipc.sock` and `~/.codex/app-server-control/`
- the desktop log named above

No installation files, credentials, configuration, backlog tasks, or repo
files other than this note were modified. Temporary ASAR/schema extraction
directories were removed after inspection.
