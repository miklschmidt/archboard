# Design and Codex integration

What archboard builds on its Excalidraw base and how it plugs into Codex and
GPT-Live voice. Everything marked verified was established by reading the Codex
source at commit `f5a3dc5540` or by testing this build. The visual direction
for the chrome is the [operator canvas shell reference](docs/design/operator-canvas-shell.md).

## The constraint that drives the design

**The GPT-Live voice model never sees tool calls or tool results** (verified:
`codex-rs/core/src/session/turn.rs`, `realtime_text_for_event`). Only agent
prose and approval prompts reach it, prefixed `[BACKEND] ` under a 1,000-token
budget. The realtime session is one long-lived thread on the Codex `Session`,
feature-gated off by default, and delegation crosses as one opaque text
envelope capped at 4 KiB; a second delegation mid-turn steers the running turn.

So no amount of `describe` quality reaches the voice model directly. The Codex
thread reads the canvas and re-narrates it in prose. Every read path therefore
targets what an agent can compress into a spoken sentence, not a complete scene
dump: "Postgres is talking to three services directly, two of which also go
through the queue", never 47 elements with ids and coordinates.

## Three channels, three jobs

### 1. Turn-start baseline — owned thread context

The configured app-server child is the turn boundary, so Archboard supplies
context there rather than through the user's global Codex configuration. New
workhorses receive the tracked shared developer instructions at `thread/start`;
a turn Archboard starts carries them once as `additionalContext.archboard`.
Linking, rejoining or reconnecting changes no thread configuration. A voice
coordinator receives the same instructions plus its role extension, and each
realtime start carries a compact role-bearing semantic brief (repository,
workhorse, coordinator, board, pane, version, selection, claim, doing state,
change cursor, board description) within the generated item and token limits.
The coordinator's primary objective is board work and it must read the
`archboard` skill before handling its first request. Realtime's `prompt` gives
the voice model its own board-focused role and handoff instructions;
`realtimeStartInstructions` supplies coordinator mode instructions and the same
board brief to ordinary coordinator turns. These fields reach different models.
Both models also receive a bounded catalogue of vault board addresses and
variants at voice start. A recursive vault watch sends a replacement catalogue
as quiet developer items to both histories when the inventory changes, including
unopened boards and external creation or deletion. Content-only writes are
deduplicated. Catalogue delivery belongs to that exact voice session and ends
with it; an unconfirmed injection is reported and never retried automatically.
There is no hook process, hook trust grant or second context diff.

### 2. Mid-conversation context — the bound app-server session

The workbench owns one private stdio app-server child and one explicit thread
link from a pane to its workhorse; that link is the only automatic target for
semantic board updates. Archboard never inspects recent activity, reads an
environment-selected thread, or connects a second client. The child runs in an
Archboard-only `CODEX_HOME` and `CODEX_SQLITE_HOME` with its own sign-in, and
an epoch manifest outside Codex storage makes every prior-child thread
inspect-only: an operational boundary against cold resume of persisted dynamic
tools, not protection against a process pointed at those paths on purpose.

The change feed settles a person's gesture, discards visual noise and renders
a compact semantic delta. Immediately before delivery Archboard revalidates the
child, epoch, pane link, loaded membership, controllability, thread status,
semantic cursor and origin. A human or mixed-origin layout or structural update
gets one `thread/inject_items` attempt on the same owned connection: one
developer message with one `input_text` part, entering model-visible history
without starting a turn. Agent-only and cosmetic updates are discarded. Each
event settles once as `delivered`, `not_delivered` with a reason, or
`outcome_unknown` after a lost response; Archboard never retries an unknown
mutation, falls back to turn or steer, or selects another thread.

Realtime voice attaches to a persistent fast coordinator thread linked to the
pane's workhorse, not to the workhorse itself, so quick questions, lookups and
immediate board interaction stay responsive while a heavier turn continues. The
coordinator may perform one explicit unambiguous board operation directly;
sustained work defaults to delegation. Busy unrelated work uses the app-server
thread queue only for an Archboard-created workhorse; an attached busy
workhorse can be steered with exact context or is refused until idle.

Spoken approval is state-gated. Realtime cannot emit a typed tool verdict, so a
later ordinary coordinator turn classifies one host-bound final user reply and
calls a dedicated typed resolver. Only the next matching final user item from
the same realtime session may arm the immutable request; its item id and
sequence are part of the authority. Target, effect,
child epoch, realtime session and expiry are compare-and-swapped before
one-time execution. A request that blocks the coordinator stays visual-only.

### 3. On-demand query — CLI

The agent pulls persisted board state with `describe`, `query`, `changes` and
`compare`; conversion, rendering, inspection, snapshots, branches and exports
need no browser, and only `browser` commands touch live panes. The CLI
auto-starts the canvas server. The former MCP catalogue was retired (ADR 0008);
the loopback REST interface remains the seam behind the CLI and browser.

## Security

A workbench that can answer approvals, send turns and expose coordination
tools carries real authority, so the canvas server stays loopback-only while
the workbench is enabled: loopback peer, loopback Host, same-origin HTTP and
WebSocket. A browser lease owns interactive reverse requests and is explicitly
transferred; a child exit invalidates every thread-ownership proof.
Dynamic-tool mutations bind approval to child epoch, requesting thread and
turn, target state and a canonical effect fingerprint, revalidated before
dispatch; general waits join a session-owned wait-for graph that rejects
cycles. Remote access must tunnel over SSH or run without the workbench.

## What we are not doing

Patching Codex. Its in-tree `world_state` engine is the right abstraction for
a canvas, but every section is core Rust with no plugin surface; using it means
maintaining a fork. The owned app-server session supplies baseline
instructions, turn context, quiet history injection and realtime context
without that. Revisit only if Codex exposes a supported registration surface.

## Roadmap

Backlog.md is authoritative (`backlog task list --plain`); completed work is
in its closed tasks and `docs/adr/`.

**Later**

- **Architecture node kinds** as a controlled vocabulary: service, queue,
  datastore, gateway, external. Boxes and arrows with infra-flavoured types, no
  resource graph underneath.

## Verified element metadata

`customData` and human-authored `link` values survive the full round-trip,
including the frontend sync after a human drags an element. Archboard's
channel is `customData.archboard`; code bindings live there as portable
metadata, never as stored local links:

```json
{
	"type": "rectangle",
	"label": { "text": "AuthService" },
	"customData": {
		"archboard": {
			"kind": "service",
			"node": "auth-service",
			"binding": {
				"repo": "github.com/acme/api",
				"path": "src/auth/service.ts",
				"branch": "main",
				"commit": "62f0cef",
				"confirmedAt": "2026-08-24T10:30:00Z"
			},
			"variant": "current"
		}
	}
}
```

On the way out, archboard resolves the binding through this machine's checkout
registry: a local target when the file or directory exists, otherwise a
validated GitHub HTTPS target for an exact `github.com/owner/repository`
identity, and no invented target for other hosts. The overlay exists only on
an outbound copy and is stripped before the note is written; new presentations
never emit `file://`. Elements synced from the browser are tagged
`"source": "frontend_sync"`.
