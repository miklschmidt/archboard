# Design and Codex integration

What archboard is building on top of its Excalidraw base, and how it plugs into
Codex + GPT-Live voice.

Everything below marked "verified" was established by reading the code at
`/home/msc/Projects/codex` (@ `f5a3dc5540`) or by testing this build. Nothing
here is inferred from documentation.

## What the base gives us, and what it doesn't

Archboard starts from [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw)
v2.0.0 because the expensive part — the Excalidraw element schema, bindings,
rendering, mermaid conversion, and a 26-tool CLI/MCP surface — is already
solved there. What it does not give us:

| Gap | Why it blocks us |
|---|---|
| `describe` ignores `customData`/`link` | The agent's primary read path is blind to the semantic model |
| No persistence | In-memory; "current vs proposed" work cannot survive a restart |
| No multi-document | One global canvas; no variants, no per-project boards |
| No change-event feed | Nothing to react to when the human draws |

**We are not staying mergeable.** Archboard diverges for our use case without
regard for whether upstream would accept the change. Restructure freely: rename
things, delete what we don't use, break their conventions where ours are better.
The `upstream` remote is kept for reference and occasional cherry-picking, not
as a merge target.

Note this was not the original plan — the early docs and commits optimised for
upstreamability. If something looks conservative for no reason, that is why, and
it can go.

## The constraint that drives the design

**The GPT-Live voice model never sees tool calls or tool results.**

Verified at `codex-rs/core/src/session/turn.rs:1732` (`realtime_text_for_event`).
`McpToolCallBegin`, `McpToolCallEnd`, exec events, web search, patch apply —
all return `None`. Only two things reach the voice layer:

- `AgentMessage` prose
- approval/elicitation prompts

Backend text is prefixed `[BACKEND] ` and truncated to a **1,000-token budget**
(`realtime_conversation.rs:91`).

So no amount of `describe` quality reaches the voice model directly. The Codex
thread reads the canvas and **re-narrates it in prose**. Our output target is
therefore not "complete scene dump" but "something an agent can compress into a
spoken sentence":

> not: 47 elements, ids, coordinates
> but: "Postgres is talking to three services directly, two of which also go
> through the queue"

This single fact should shape every read-path decision in the fork.

## How the voice channel actually works (verified)

- It is **in this repo**, not the closed desktop app:
  `codex-rs/core/src/realtime_conversation.rs` (2,478 lines). Model
  `gpt-live-1-boulder-alpha`.
- Feature-gated **off by default**: `Feature::RealtimeConversation`,
  `Stage::UnderDevelopment`, `default_enabled: false`
  (`codex-rs/features/src/lib.rs:1457`).
- **One long-lived thread**, not one per interaction. The realtime session is a
  field on the Codex `Session` (`core/src/session/session.rs:60`) and starting
  it requires an existing thread id.
- Delegation crosses as a **single opaque text string** wrapped in an envelope:

```xml
<realtime_delegation>
  <input>run ls</input>
  <transcript_delta>user: Hi how are you
assistant: Doing well, what can I help you with?
user: run ls</transcript_delta>
</realtime_delegation>
```

Both fields capped at 4 KiB. A second delegation mid-turn **steers** the running
turn rather than starting a new one.

## Three channels, three jobs

### 1. Turn-start baseline — `UserPromptSubmit` hook

Verified: voice-initiated turns and typed turns converge on the same function
(`turn_input::handle`), with no realtime special-casing in the hook path. So the
hook **does** fire for voice.

Config at `~/.codex/hooks.json` (or `[hooks.*]` in `config.toml`):

```json
{"hooks":{"UserPromptSubmit":[{"hooks":[{
  "type":"command",
  "command":"/home/msc/Projects/whiteboard/bin/canvas-hook",
  "statusMessage":"reading whiteboard state"}]}]}}
```

The hook writes `hookSpecificOutput.additionalContext` to stdout; Codex converts
it to a **`developer`-role message appended immediately after the user message**,
verbatim with no wrapping tags (`core/src/hook_runtime.rs:682`,
`core/src/context/hook_additional_context.rs:14`).

Budget: **2,500 approximate tokens** by default, tunable per-handler via
`additionalContextLimit`. Over the limit it spills to a temp file and the model
sees only a head/tail preview — so treat 2,500 tokens as the real ceiling. This
reinforces the compression discipline above.

**Gotchas that will bite:**

- The hook's `prompt` field is the full `<realtime_delegation>` XML, **not** the
  bare utterance. Any regex written against plain prompts silently won't match.
  Upside: `transcript_delta` hands us the recent spoken conversation for free —
  useful for deciding which part of the canvas is worth injecting.
- **Trust gate.** Non-managed hooks only run if `config.toml` carries a matching
  `[hooks.state."<key>"].trusted_hash = "sha256:…"`, or
  `--dangerously-bypass-hook-trust` is set. The trust-granting UX is **TUI-only**
  — `codex exec` has no trust flow at all. Driving Codex programmatically means
  pre-writing the hash.
- Sync hooks are on the critical path (latency); async hooks cannot block or
  alter the turn, though they can still inject into a running turn via
  `inject_if_running`.

**Do our own diffing.** Codex re-sends whatever we emit every turn. Our hook
binary should keep a state file of what it last reported and emit only the
delta — "since last turn: you moved AuthService out of the API cluster and added
an unlabelled box next to Postgres." Cheaper, and far better prose material.

### 2. Mid-conversation push — app-server injection

**This is the unlock, and it does not go through MCP.** Because the live session
rides on an ordinary thread, anything that can reach that thread can push to it.

The app-server exposes a JSON-RPC control socket at
`$CODEX_HOME/app-server-control/app-server-control.sock` (mode 0600 in a 0700
dir, WebSocket-upgraded, **multi-client**). The TUI auto-joins this daemon when
the socket exists, and voice runs through app-server anyway — so in our use case
the daemon is already there.

Two distinct verbs, and the distinction is the whole design:

| Verb | Effect | Use for |
|---|---|---|
| `thread/inject_items` | Appends raw items to thread history, **without starting a turn** | Quiet state updates — agent sees the board next time it speaks |
| `turn/steer` | Injects input **into the running turn** (needs `expectedTurnId`) | Loud interruptions — agent reacts now |
| `turn/start` | Starts a turn, or steers if one is live | Loud, when no turn is running |

Verified: `thread/inject_items` → `thread.inject_response_items(items)`
(`app-server/src/request_processors/turn_processor.rs:878`), and raw
`TurnInput::ResponseItem` **skips `UserPromptSubmit`**
(`core/src/hook_runtime.rs:568`) — so our own injections cannot trigger our own
hook. No feedback loop by construction.

And output from an externally-initiated turn **is pushed into the voice
session**: the no-active-handoff branch emits
`RealtimeOutbound::StandaloneHandoff` under the id `"codex"`
(`realtime_conversation.rs:818-841`, verified). So a loud injection makes the
agent *speak*, unprompted. That is the difference between a tool the agent
queries and a colleague watching you draw.

Default to quiet. Every loud injection makes the agent talk over you — debounce,
and reserve it for semantically interesting changes (a new unlabelled node, a
severed edge), never per drag tick.

**Fallback with no daemon:** writing to `$CODEX_HOME/queue_1.sqlite` injects a
user turn from any process — polled via `PRAGMA data_version` every 10 s,
between turns only. Reaches even a bare TUI. Cruder, but zero infrastructure.

### 3. On-demand query — MCP tools

The existing 26 tools, plus architecture-shaped additions. The agent consumes
these; the voice model never sees them.

**MCP gives us no push whatsoever** — confirmed, and worth recording so nobody
re-investigates:

- Transports are **stdio and streamable-http only**. No SSE, no websocket.
- Protocol defaults to **2025-06-18**; 2026-07-28 is opt-in and, for stdio
  servers, additionally requires `CODEX_MCP_PROTOCOL_VERSION=2026-07-28`.
- Declared client capabilities are **elicitation only** — no sampling, no roots.
- Every standard notification (`progress`, `message`, `resources/updated`,
  `resources/list_changed`, `tools/list_changed`, `prompts/list_changed`,
  `cancelled`) is received and **discarded into tracing logs**
  (`rmcp-client/src/logging_client_handler.rs`). None reaches the model, UI, or
  thread.
- `resources/subscribe` is **never called** anywhere in the codebase.
- Resources *are* supported, but pull-only, as three model-invoked tools
  (`list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource`).
- The one in-protocol push that works is `elicitation/create`, and it prompts
  **the human**, not the model. Not useful to us.

So: MCP for pull, app-server for push. Don't waste time on resource
subscriptions.

## Security — read before wiring push

The app-server control socket is filesystem-permission-guarded but **multi-client
and unauthenticated beyond that**: any local process can steer your thread.
Our canvas server, meanwhile, **binds `127.0.0.1` with no authentication**.

Those two facts are individually fine and jointly dangerous. If the canvas is
ever exposed beyond loopback — notably the thin-client path in
`FLIP_WHITEBOARD.md`, where an N100 box on the LAN talks to the canvas — and the
canvas can inject turns into a Codex thread, then **anyone who can reach the
canvas can drive your coding agent**. That is a remote code execution path with
extra steps.

Rules:

- Turn injection stays loopback-only. Never reachable from a LAN-bound listener.
- If the thin-client path is used, the canvas is served over an SSH tunnel, or
  injection is disabled on that deployment.
- Treat "canvas can make the agent act" as a privileged capability with its own
  switch, not something implied by the canvas being up.

## What we're NOT doing

**Patching Codex.** `codex-rs/core/src/context/world_state/` is a diff-only
external-state engine — `snapshot()` + `render_diff()` per turn, full context on
turn 1 and deltas thereafter. It is exactly the right abstraction for a canvas,
and strictly better than a hook: in-process, structured, no re-sending unchanged
text.

But every `WorldStateSection` implementation is in-tree core Rust, assembled at
startup. There is **no config or plugin surface** to register one. Using it means
forking and maintaining Codex itself.

Not worth it. A `UserPromptSubmit` hook that does its own diffing gets most of
the benefit at none of the maintenance cost. Revisit only if Codex ever exposes
`TurnInputContributor` registration to plugins.

## Roadmap

Ordered by dependency, not ambition. Backlog.md is authoritative —
`backlog task list --plain`; this is the narrative version.

**Done**

- **`describe` surfaces the semantic model** (TASK-001). Nodes separated from
  plain elements, grouped by kind, bindings and links resolved, bound labels
  folded back into their containers, and a speakable summary line leading. It
  degrades to a per-kind rollup on large scenes rather than dumping, which
  absorbed most of what was originally a separate "compressed description mode"
  item.
- **Obsidian export preserves custom frontmatter** (TASK-002), so board
  identity can live there. Prerequisite for everything multi-board.

**Next**

- **Selection published to the server** (TASK-004). Today it never leaves the
  browser, so the agent cannot act on what you have picked.
- **Promotion** (TASK-005) — declare selected elements a node and bind it, in
  one gesture. The most touchscreen-native interaction in the product.
- **Multi-document** (TASK-003) — boards as individual vault files with
  identity in frontmatter. The element store is currently keyed by element id
  with no board dimension, so this reaches the store and the WebSocket
  protocol, not just the file layer. Includes defining the two-writer
  behaviour against Obsidian.
- **`panes`** (TASK-006) — what board and variant sit where, plus selection.
  View state only. Exists to resolve spatial deixis for voice.
- **`compare`** (TASK-007) — structured semantic diff between two variants,
  keyed on node identity. Structured output only; prose is the agent's job.

**Later**

- **Change-event feed** — semantic change events (node added, edge severed,
  cluster split) feeding both the hook's diffing and the turn-injection trigger.
- **App-server client** — `thread/inject_items` for quiet updates, `turn/steer`
  for loud ones, behind an explicit opt-in switch (see Security).
- **`canvas-hook` binary** — `UserPromptSubmit` handler with its own state file.
  The fallback for when no daemon is running; injection is better when one is.
- **Architecture node kinds** as a controlled vocabulary — service, queue,
  datastore, gateway, external. Boxes-and-arrows with infra-flavoured types; no
  resource graph underneath.

## Verified element metadata

`customData` and `link` survive the full round-trip in v2, including the
frontend sync after a human drags an element. This is the semantic channel.

```json
{"type":"rectangle","label":{"text":"AuthService"},
 "link":"file:///abs/path/src/auth/service.ts",
 "customData":{"kind":"service","path":"src/auth/service.ts","variant":"current"}}
```

`link` renders as a tappable affordance — tap the box on the Flip, open the file.
Elements synced from the browser are tagged `"source": "frontend_sync"`,
distinguishing human edits from agent-authored elements.
