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

### 1. Turn-start baseline — `UserPromptSubmit` hook

Verified: voice-initiated turns and typed turns converge on the same function
(`turn_input::handle`), with no realtime special-casing in the hook path. So the
hook **does** fire for voice.

Config at `~/.codex/hooks.json` (or `[hooks.*]` in `config.toml`):

```json
{
	"hooks": {
		"UserPromptSubmit": [
			{
				"hooks": [
					{
						"type": "command",
						"command": "/path/to/archboard/bin/canvas-hook",
						"statusMessage": "reading archboard state"
					}
				]
			}
		]
	}
}
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

### 2. Mid-conversation context — the bound app-server session

The workbench owns one private stdio app-server child and one explicit thread
link from a pane to its workhorse. That link is the only automatic target for semantic board
updates. Archboard does not inspect recent activity, count loaded tasks, read an
environment-selected task id, or connect a second client to a control socket.

The existing change feed still performs the valuable work: settle a person's
gesture, discard visual noise, and narrate the semantic delta compactly. A human
or mixed-origin update is delivered with `thread/inject_items` on the same owned
connection, so it enters model-visible history without starting a turn. An
agent-only update is discarded instead of being narrated back to its author.
No controllable bound task means no delivery and an inspectable reason.

Realtime voice attaches to a persistent fast coordinator task linked to the
pane's workhorse, not to the workhorse itself. This keeps low-latency questions,
web and repository lookups, and immediate board interaction responsive while a
heavier turn continues. The coordinator has normal Codex capabilities and may
perform one explicit unambiguous board operation directly; sustained code or
repository work defaults to delegation. Busy unrelated work uses the app-server
thread queue, explicit corrections may steer according to a global policy, and
app-server lifecycle events notify the coordinator without a blocking wait.

Codex 0.151.0's experimental V3 contract provides startup context, role-bearing
initial items, session instructions, realtime text append, and transcript-tail
flush. Each start supplies a fresh semantic brief; while active, the coordinator
receives the same human board deltas plus live pane and selection context. Its
timeline remains distinct from the workhorse timeline and the UI cross-links
delegations, queue changes, callbacks, approvals, and results. There is no
second board snapshot or implicit task selector.

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
task-ownership proof.

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

Not worth it. A `UserPromptSubmit` hook that does its own diffing gets most of
the benefit at none of the maintenance cost. Revisit only if Codex ever exposes
`TurnInputContributor` registration to plugins.

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
