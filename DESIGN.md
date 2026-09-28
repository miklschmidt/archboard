# Design and Codex integration

How archboard's semantic boards plug into Codex and GPT-Live voice. Everything marked verified was established by reading the Codex
source at commit `f5a3dc5540` or by testing this build. The visual direction
for the chrome is the [operator canvas shell reference](docs/design/operator-canvas-shell.md).

## The constraint that drives the design

**The GPT-Live voice model never sees tool calls or tool results** (verified:
`codex-rs/core/src/session/turn.rs`, `realtime_text_for_event`). Only agent
prose and approval prompts reach it, under a 1,000-token budget; since Codex
0.158.0 a session started with `backendReasoningStatus` also relays reasoning
summaries as quiet status, and Archboard never sets it. In the V3
sessions Archboard starts they arrive as the result of the voice model's own
handoff, on a speakable or a commentary channel; the `[USER] ` and `[BACKEND] `
text prefixes belong to the V2 protocol and are never added (rechecked against
Codex 0.158.0, `realtime_conversation.rs`). The realtime session is one long-lived
thread on the Codex `Session` (the `realtime_conversation` feature flag gates only
the TUI's voice), and delegation crosses as one opaque text envelope whose fields
are capped at 4 KiB each; a second delegation mid-turn steers the running turn.

So no amount of read quality reaches the voice model directly. The Codex thread
reads the board and re-narrates it in prose. Every read path therefore targets
what an agent can compress into a spoken sentence, not a complete dump:
"Postgres is talking to three services directly, two of which also go through
the queue", never 47 subjects with ids. A semantic board is what makes that
cheap — the board already says what the parts are and how they are wired, so
there is nothing to infer from a picture.

## Three channels, three jobs

### 1. Turn-start baseline — owned thread context

The configured app-server child is the turn boundary, so Archboard supplies
context there rather than through the user's global Codex configuration. New
workhorses receive the tracked shared developer instructions at `thread/start`;
a turn Archboard starts carries them once as `additionalContext.archboard`.
Linking, rejoining or reconnecting changes no thread configuration. A voice
coordinator receives its own tracked developer document, which neither contains
nor refers to the workhorse's (TASK-297). The coordinator's primary objective is
board work and it must read the `archboard` skill before handling its first
request. Each model is given its own prompt and no other's. Realtime's `prompt`
gives the voice model its board-focused role and handoff instructions and
nothing else: no developer items, no JSON, and no Codex startup context
(`includeStartupContext` is false, because Codex would otherwise prepend a
`<startup_context>` of recent threads and a workspace scan to the prompt).
`realtimeStartInstructions` carries only what a voice session adds for the
coordinator, the channel rule; Codex renders it into the coordinator's world state on every
turn, so it never repeats the developer document. A compact role-bearing
semantic brief (repository, workhorse, coordinator, board, pane, version,
selection, claim, doing state, change cursor, board description) is captured at
each start for that session's callbacks, and reaches neither model's start. The
coordinator alone receives a bounded catalogue of vault board addresses and
variants, as a developer item on its own thread when the voice session starts
and again, replacing it, whenever a recursive vault watch sees the inventory
change, including unopened boards and external creation or deletion.
Content-only writes are deduplicated. Catalogue delivery belongs to that exact
voice session and ends with it; an unconfirmed injection is reported and never
retried automatically.
There is no hook process, hook trust grant or second context diff.

### 2. Mid-conversation context — the bound app-server session

The workbench owns one private stdio app-server child and one thread link from
the Archboard server to its workhorse, made by the first message or Talk; that link is
the only automatic target for semantic board updates. Archboard never inspects recent activity, reads an
environment-selected thread, or connects a second client. The child runs in an
Archboard-only `CODEX_HOME` and `CODEX_SQLITE_HOME` with one sign-in, shared by
the Archboard servers on the machine, and each server's own epoch manifest outside Codex
storage makes every thread its current child does not own inspect-only: an operational boundary against cold resume of persisted dynamic
tools, not protection against a process pointed at those paths on purpose.

The change feed settles a user's gesture, discards visual noise and renders
a compact semantic delta. Immediately before delivery Archboard revalidates the
child, epoch, thread link, loaded membership, controllability, thread status,
semantic cursor and origin. A human or mixed-origin layout or structural update
gets one `thread/inject_items` attempt on the same owned connection: one
developer message with one `input_text` part, entering model-visible history
without starting a turn. Agent-only and cosmetic updates are discarded. Each
event settles once as `delivered`, `not_delivered` with a reason, or
`outcome_unknown` after a lost response; Archboard never retries an unknown
mutation, falls back to turn or steer, or selects another thread.

What the voice model says is decided by channel, not by role. Read against Codex
0.158.0: a V3 session is full duplex, `thread/realtime/appendText` is a quiet
`session.context.append` whatever role it carries, and nothing answers it. A
coordinator message is spoken when it goes out on the speakable channel, and in
the `bemTags` handoff mode these sessions run in that is chosen by the message's
first characters: `[FINAL]` is spoken, `[COMMENTARY]` is quiet context, and a
headerless message is held back until it is complete and then treated as final.
So the coordinator's start instructions state the rule, and a preamble is never
read out as if it were the answer. It is also why work that ends later cannot be
told to the voice model directly. Instead, while voice is live the coordinator
is given **workhorse news**: when a turn on the linked workhorse thread ends
(finished, failed or stopped) or starts waiting on the user, whoever started the
turn, from the coordinator's own delegation or from the agent bar, and what the
workhorse tells it with its `tell_coordinator` tool: a question for the user, a
milestone or what stops it. A turn's news comes from the workhorse thread's own
notifications, one source for every turn. Each piece reaches
the coordinator as one plain sentence with no identities in it, from the
reviewed `workhorse_outcome_report` producer; the coordinator reads the rest
through `inspect_workhorse`. It is one `turn/start`, which Codex adds to the
coordinator's running turn when there is one and starts a turn with otherwise,
so nothing waits for the coordinator to be idle and nothing lands in its
history without a turn that acts on it. What it replies under `[FINAL]` is
spoken without the user asking again; a `[COMMENTARY]` reply stays silent. With
no voice session, and while a recording holds the voice, the coordinator is
told nothing: it is the voice model's subconscious and never runs without it.
Then `tell_coordinator` sends nothing and answers that nobody is listening.
Of a coordinator operation's own callbacks only an outcome nobody can vouch for
(outcome unknown) is told the same way; the rest (accepted, queued, started,
progress, and the completed, failed and attention that workhorse news already
covers) are recorded with the reason `recorded_only`. No path appends a
callback envelope to the voice session.

What a pane reports reaches the voice model only as **pane news**: one sentence
of names saying where the user's reading now stands ("The user is now looking at
board "payments", with "Ledger" selected (data)."), and only the parts the pane
marked as changed by the user's own hand (ADR 0034). It describes the state,
never the gesture, always names the board, names at most three subjects before
counting the rest, and carries no identifier, pane letter or JSON, because a
speech model says what is in its context. It is quiet context for the voice
model alone: a hint for what "this" means, never a substitute for the
coordinator's live lookup, and the coordinator is not told because it reads the
pane through its tools. A report nobody's hand caused (a driven walkthrough
step, a board an agent switched the pane to, a redraw after an agent's write) is
recorded with the reason `agent` and told to nobody; appending every report was
the feedback loop of 2026-09-20, in which each step the voice model asked for
came back to it as news. With no voice session nothing is sent
(`voice_inactive`).

Realtime voice attaches to a persistent fast coordinator thread linked to the
Archboard server's workhorse, not to the workhorse itself, so quick questions, lookups and
immediate board interaction stay responsive while a heavier turn continues. The
coordinator starts with `project_doc_max_bytes: 0`, so the checkout's `AGENTS.md`,
which is written for an agent working in the repository, never reaches it. The
coordinator may perform one explicit unambiguous board operation directly;
sustained work defaults to delegation. Busy unrelated work uses the app-server
thread queue only for an Archboard-created workhorse; an attached busy
workhorse can be steered with exact context or is refused until idle.

Spoken approval is state-gated. Realtime cannot emit a typed tool verdict, so a
later ordinary coordinator turn classifies one final user reply that the Archboard server bound to the request and
calls a dedicated typed resolver. Only the next matching final user item from
the same realtime session may arm the immutable request; its item id and
sequence are part of the authority. Target, effect,
child epoch, realtime session and expiry are compare-and-swapped before
one-time execution. A request that blocks the coordinator stays visual-only.

A walkthrough is narrated through the same constraint (TASK-251): the user
steps the presentation by hand and the voice explains the step on screen. A V3
delegation carries the latest user-side item replayed (usually the user's last
utterance) and never words the voice model composed, which is too little for
the voice model to steer a talk, so it never asks for a step. Pressing Narrate
beside a walkthrough sends it with `realtimeStart`; the server reads it from
the board the pane is showing, and the voice `prompt` gains only its name and
how to explain a step it is handed. The coordinator is told nothing of it, and
the session opens with no initial item. While Codex starts the session the Archboard server
asks the pane for step 1 (`pane_present`), and once the pane's own report says
the step has arrived it hands the step to the voice model through
`realtimeAppendSpeech`, serialized behind the start, so the voice begins on
step 1 without being spoken to and without a coordinator turn. A step is handed
over as its heading, its body and what it highlights, named in words and, on a
variant read against another (the board's current one, or on a board with none
the one it came from), with how each stands against it and what moved
(TASK-309), so the voice can explain the change the picture marks. Every step
the user moves to by hand after that is handed over the same way, in the same
words, and leaving is handed over as a line the voice model acknowledges before
it stops. In a V3 session appended text is quiet context whatever its role, and
what the voice model says is what arrives as speakable text, which is why both
travel as speech. Nothing is retried: the next step says where the picture is.
After explaining a step the voice waits for the user. The position stays the
browser's: the pane is asked once, and its report is the acknowledgement.

A recording (TASK-304, ADR 0035) is a narration nobody is at the controls of.
`archboard semantic record` opens the Archboard server's page with `?record=<walkthrough>`
in a private headless Chromium: the page shows the one pane at 1920x1080,
captures its own tab and mixes the voice's WebRTC stream into the same file.
It starts voice with `presentation.recording`, which gives the voice model its
persona and a recording section and none of the conversation rules (explain
each step as it lands, then stop, because silence moves the screen on), gives
the coordinator a rule to write only quiet commentary while the recording holds
the voice, turns the delegation filler off, and opens no step from the server. Then the page steps the walkthrough
itself. A step the page moves to answers no request, so its report reaches the
voice model as speech by the same path as a step chosen by hand. The page moves
on once every line the voice said about the step is final and its measured
output has been quiet for a moment, because a final line can come before its
audio has finished playing. A recording start is refused while voice is live on
the server, and every wait in it is bounded and fails with the reason. The
recording page's pane registers as a recording's, which the server leaves out
of pane addressing and which other browsers do not subtitle.

### 3. On-demand query — CLI

The agent pulls persisted board state with `semantic show`, `semantic compare`
and `semantic inspect`; writing, branching, rendering and rasterizing need no
browser, and only `browser` commands touch live panes. The CLI
auto-starts the Archboard server. The former MCP catalogue was retired (ADR 0008);
the loopback REST interface remains the seam behind the CLI and browser.

## Security

A workbench that can answer approvals, send turns and expose coordination
tools carries real authority, so the Archboard server stays loopback-only while
the workbench is enabled: loopback peer, loopback Host, same-origin HTTP and
WebSocket. A browser lease owns interactive reverse requests and is explicitly
transferred; a child exit invalidates every thread-ownership proof.
Dynamic-tool mutations bind approval to child epoch, requesting thread and
turn, target state and a canonical effect fingerprint, revalidated before
dispatch; general waits join a session-owned wait-for graph that rejects
cycles. Remote access must tunnel over SSH or run without the workbench.

By default every Codex thread runs in the auto-review mode of Codex. If
`config.toml` does not set these settings, Archboard puts them in, and it never
overwrites a setting that Codex or a person made. The sandbox can write the
workspace and reach the network, because every archboard command that an agent
runs reaches the Archboard server over loopback. When the sandbox refuses a
command, Codex gives it to its reviewer subagent, which approves or denies it.
Codex does not ask the user. If the config keeps Codex's store in another
SQLite home or is not TOML, Archboard refuses to start Codex.

## What we are not doing

Patching Codex. Its in-tree `world_state` engine is the right abstraction for
a canvas, but every section is core Rust with no plugin surface; using it means
maintaining a fork. The owned app-server session supplies baseline
instructions, turn context, quiet history injection and realtime context
without that. Revisit only if Codex exposes a supported registration surface.

## Roadmap

Backlog.md is authoritative (`backlog task list --plain`); completed work is
in its closed tasks and `docs/adr/`.

## Code bindings

A node's code binding is part of its meaning and is stored on the node, as
portable metadata and never as a local link:

```json
{
	"name": "AuthService",
	"kind": "service",
	"binding": {
		"repo": "github.com/acme/api",
		"path": "src/auth/service.ts",
		"branch": "main",
		"commit": "62f0cef",
		"confirmedAt": "2026-08-24T10:30:00Z"
	}
}
```

When a user opens the code, archboard resolves the binding through this
machine's checkout registry: a local target when the file or directory exists,
otherwise a validated GitHub HTTPS target for an exact
`github.com/owner/repository` identity, and no invented target for other hosts.
Nothing resolved is written back to the note, and no presentation emits
`file://`.
