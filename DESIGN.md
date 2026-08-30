# Design and Codex integration

What archboard is building on top of its Excalidraw base, and how it plugs into
Codex + GPT-Live voice.

The approved visual direction for the application chrome is the
[operator canvas shell reference](docs/design/operator-canvas-shell.md). It
separates the composition and visual language to adopt from the mockup details
that do not represent real product state.

Everything below marked "verified" was established by reading the Codex source
at commit `f5a3dc5540` or by testing this build. Nothing here is inferred from
documentation.

## What the base gives us, and what it doesn't

Archboard starts from [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw)
v2.0.0 because the expensive part — the Excalidraw element schema, bindings,
rendering, mermaid conversion, and a command surface — was already solved
there. Archboard retained the CLI and later deleted the duplicated MCP
transport (ADR 0008). What the base does not give us:

| Gap                                    | Why it blocks us                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `describe` ignores `customData`/`link` | The agent's primary read path is blind to the semantic model                                                     |
| No persistence                         | In-memory; "current vs proposed" work cannot survive a restart                                                   |
| No multi-document                      | One global canvas; no variants, no per-project boards                                                            |
| No change-event feed                   | Nothing to react to when the human draws — **since TASK-018/019 there is one, and it can push to a live thread** |

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
Tool-call events, exec events, web search, and patch application all return
`None`. Only two things reach the voice layer:

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

### 1. Turn-start baseline — owned thread context

The configured app-server child is already the turn boundary, so Archboard
supplies context there instead of installing a hook into the user's global
Codex configuration. New workhorses receive the exact tracked shared developer
instructions at `thread/start`. A turn that Archboard starts on an attached
workhorse carries those instructions once as `additionalContext.archboard` with
kind `application`; merely linking, rejoining, or reconnecting changes no thread
configuration.

A voice coordinator receives the shared instructions plus its exact tracked
role extension when Archboard starts the coordinator thread. Each realtime V3
start includes Codex startup context, the same coordinator role instructions,
and a compact role-bearing semantic brief. The brief fits the generated
128-item and 8,192-estimated-token limits and names the repository, workhorse,
coordinator, board, pane, version, selection, claim, doing state, change cursor,
and compact board description.

There is no `canvas-hook` process, hook trust grant, global `hooks.json` edit, or
second context diff. The semantic change feed owns compact deltas; the thread
start and realtime adapters only choose when and where to deliver them.

### 2. Mid-conversation context — the bound app-server session

The workbench owns one private stdio app-server child and one explicit thread
link from a pane to its workhorse. That link is the only automatic target for semantic board
updates. Archboard does not inspect recent activity, count loaded threads, read an
environment-selected thread id, or connect a second client to a control socket.

The child runs in an Archboard-only `CODEX_HOME` and `CODEX_SQLITE_HOME` with a
separate supported sign-in. An epoch manifest outside Codex storage makes every
prior-child thread inspect-only. This avoids accidental cold resume of persisted
dynamic tools and queued work; it is an operational boundary, not protection
against a same-user process intentionally pointed at those private paths.

The existing change feed still performs the valuable work: settle a person's
gesture, discard visual noise, and narrate the semantic delta compactly. A human
or mixed-origin update is delivered with `thread/inject_items` on the same owned
connection, so it enters model-visible history without starting a turn. An
agent-only update is discarded instead of being narrated back to its author.
No controllable linked thread means no delivery and an inspectable reason.

Realtime voice attaches to a persistent fast coordinator thread linked to the
pane's workhorse, not to the workhorse itself. This keeps low-latency questions,
web and repository lookups, and immediate board interaction responsive while a
heavier turn continues. The coordinator has normal Codex capabilities and may
perform one explicit unambiguous board operation directly; sustained code or
repository work defaults to delegation. Busy unrelated work uses the app-server
thread queue only for an Archboard-created workhorse with proven persistent
instructions; an attached busy workhorse can be steered with exact context or is
refused until idle. App-server lifecycle events notify the coordinator without a
blocking wait.

Spoken approval is state-gated. Realtime V3 cannot emit a typed tool verdict, so
the later ordinary coordinator turn classifies the delegated final reply and
calls a dedicated typed resolver. A request blocking that coordinator remains
visual-only. One immutable approval may be pending application-wide; target,
effect, child epoch, realtime session, and expiry are compare-and-swapped before
one-time execution. Version 0.151.0 cannot correlate `appendSpeech` completion
with an item id, so Archboard arms the request from the expected session-scoped
assistant transcript sequence and presents that residual voice race explicitly.

Codex 0.151.0's experimental V3 contract provides startup context, role-bearing
initial items, session instructions, realtime text append, and transcript-tail
flush. Each start supplies a fresh semantic brief; while active, the coordinator
receives the same human board deltas plus live pane and selection context. Its
timeline remains distinct from the workhorse timeline and the UI cross-links
delegations, queue changes, callbacks, approvals, and results. There is no
second board snapshot or implicit thread selector.

ADR 0019 supersedes ADR 0005's legacy control-socket route, opt-in environment
switch, explicit thread environment variable, and loud-injection experiment.

### 3. On-demand query — CLI

The agent pulls board state with `archboard describe`, `query`, `selection`,
`panes`, `changes`, and `compare`. The CLI auto-starts the canvas server when a
command needs it, while vault-direct commands remain usable without a browser.

Archboard once maintained an MCP tool catalogue and dispatcher beside the CLI.
Nothing in current use required a shell-less transport, and the duplicate
interface added schemas, dispatch arms, docs, dependencies, and parity tests to
every capability. ADR 0008 records why it was retired. The loopback REST
interface remains the application seam behind the CLI and browser.

## Security — read before wiring the workbench

The private child removes the shared control socket, but not the authority of a
workbench that can answer approvals, send turns, and expose coordination tools.
The canvas server therefore remains loopback-only while the workbench is
enabled. Its browser bridge requires an actual loopback peer, loopback Host, and
same-origin HTTP and WebSocket requests. A browser lease owns interactive
reverse requests and is explicitly transferred; a child exit invalidates every
thread-ownership proof.

Dynamic-tool mutations also bind approval to child epoch, requesting thread and
turn, target state, and a canonical effect fingerprint. The target and effect are
revalidated immediately before dispatch. General waits add edges to a
session-owned wait-for graph and reject direct or transitive cycles before any
operation begins.

The Flip thin-client path must use an SSH tunnel that preserves the loopback
boundary, or run without the workbench. A LAN-bound unauthenticated listener
never receives a path to the app-server child.

## What we're NOT doing

**Patching Codex.** `codex-rs/core/src/context/world_state/` is a diff-only
external-state engine — `snapshot()` + `render_diff()` per turn, full context on
turn 1 and deltas thereafter. It is exactly the right abstraction for a canvas,
and strictly better than a hook: in-process, structured, no re-sending unchanged
text.

But every `WorldStateSection` implementation is in-tree core Rust, assembled at
startup. There is **no config or plugin surface** to register one. Using it means
forking and maintaining Codex itself.

Not worth it. The owned app-server session now supplies baseline instructions,
turn context, quiet history injection, and realtime developer context without a
Codex fork or a global `UserPromptSubmit` hook. Revisit the in-process extension
only if Codex exposes a supported registration surface that materially simplifies
that owned-session design.

## Roadmap

Ordered by dependency, not ambition. Backlog.md is authoritative —
`backlog task list --plain`; this is the narrative version.

**Done**

- **`describe` surfaces the semantic model** (TASK-001). Nodes separated from
  plain elements, grouped by kind, portable bindings described, bound labels
  folded back into their containers, and a speakable summary line leading. It
  degrades to a per-kind rollup on large scenes rather than dumping, which
  absorbed most of what was originally a separate "compressed description mode"
  item.
- **Obsidian export preserves custom frontmatter** (TASK-002), so board
  identity can live there. Prerequisite for everything multi-board.
- **Selection published to the server** (TASK-004), so the agent can act on
  what the human has picked rather than on ids nobody said out loud.
- **Promotion** (TASK-005) — declare selected elements a node and bind it in
  one gesture. The most touchscreen-native interaction in the product, and
  where the node ids `compare` joins on come from.
- **Multi-document** (TASK-003) — boards as individual vault files with
  identity in frontmatter, reaching the element store and the WebSocket
  protocol, not just the file layer. Includes the two-writer behaviour against
  Obsidian (ADR 0006).
- **`compare`** (TASK-007) — structured semantic diff between two variants,
  joined on node identity. Structured output only; prose is the agent's job.
  Written for **sufficiency, not narratability**: the consumer is a full agent
  thread that narrates the result itself and can ask a follow-up question, so
  nothing is summarised and nothing is truncated. Layout is carried as relative
  structure — cluster membership, containment, grouping, region, coarse
  direction, relative size — because a rearrangement is a statement about the
  design but a coordinate delta is noise; the result names what that model
  cannot express so the narrator does not overclaim.
- **`panes`** (TASK-006) — what the human is currently looking at: per pane,
  where it sits on the glass, which board and variant it holds, how much of that
  board is in view, and what is picked in it. **View state only**, and that line
  is load-bearing: it exists to resolve spatial deixis for a voice model that
  cannot see the screen, which means it has to be affordable on every turn, which
  it stops being the moment somebody inlines the elements to save a round trip.
  `describe` and `compare` are where contents live.
- **A board per pane** (TASK-021) — current beside proposed, which is the whole
  reason panes exist. Opening a board addresses one pane: `board_switched`
  reaches that pane's socket alone, only that pane's selection is retired, and
  each board is saved against its own baseline. `panes` needed no new shape —
  it already reported the board each pane adopted rather than a server-wide
  one — only the loss of the line explaining why the two were always the same.
  The hard half was authority, not display: with two boards on screen, "the
  board" has no referent, so **every call names its board and one that does not
  is refused** (ADR 0009). The active pointer is deleted rather than defaulted,
  because a default is the same ambient resolution in a costume. Panes keep one
  default, on the display axis only: `board open` with a single pane on screen
  goes into it, with two it needs `--pane`, and the answer always says where
  the board landed.

**Later**

- **Owned workbench session** — one exact-binary stdio child, thread links,
  generated experimental protocol, dynamic coordination tools, semantic context,
  linked workhorse and coordinator timelines, and browser-native realtime V3.
- **Architecture node kinds** as a controlled vocabulary — service, queue,
  datastore, gateway, external. Boxes-and-arrows with infra-flavoured types; no
  resource graph underneath.

## Verified element metadata

`customData` and human-authored `link` values survive the full round-trip in v2,
including the frontend sync after a human drags an element. Archboard's semantic
channel is `customData.archboard`; code bindings live there as portable
metadata, not as stored local links.

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

When an element is presented to a browser or API caller, archboard resolves the
binding through this machine's checkout registry. A valid local file or
directory gets an internal target addressed by board and element. If no local
target exists, an exact `github.com/owner/repository` identity gets a validated
GitHub HTTPS target at the recorded commit, branch, or `HEAD`. Other hosts get
no invented target. The overlay exists only on an outbound copy and is stripped
before the note is written.

New presentations never emit `file://`. One upgrade edge remains deliberate: a
pane may echo an old `file://` overlay after its checkout disappears. Without
retaining presentation history, archboard cannot distinguish that value from a
human-authored file link, so it preserves the value. While the canonical local
target still resolves, the exact old overlay is recognized and removed.
Elements synced from the browser are tagged `"source": "frontend_sync"`,
distinguishing human edits from agent-authored elements.
