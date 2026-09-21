# Design and Codex integration

How archboard's semantic boards plug into Codex and GPT-Live voice. Everything marked verified was established by reading the Codex
source at commit `f5a3dc5540` or by testing this build. The visual direction
for the chrome is the [operator canvas shell reference](docs/design/operator-canvas-shell.md).

## The constraint that drives the design

**The GPT-Live voice model never sees tool calls or tool results** (verified:
`codex-rs/core/src/session/turn.rs`, `realtime_text_for_event`). Only agent
prose and approval prompts reach it, under a 1,000-token budget. In the V3
sessions Archboard starts they arrive as the result of the voice model's own
handoff, on a speakable or a commentary channel; the `[USER] ` and `[BACKEND] `
text prefixes belong to the V2 protocol and are never added (rechecked against
Codex 0.155.1, `realtime_conversation.rs`). The realtime session is one long-lived thread on the Codex `Session`,
feature-gated off by default, and delegation crosses as one opaque text
envelope capped at 4 KiB; a second delegation mid-turn steers the running turn.

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

The change feed settles a user's gesture, discards visual noise and renders
a compact semantic delta. Immediately before delivery Archboard revalidates the
child, epoch, pane link, loaded membership, controllability, thread status,
semantic cursor and origin. A human or mixed-origin layout or structural update
gets one `thread/inject_items` attempt on the same owned connection: one
developer message with one `input_text` part, entering model-visible history
without starting a turn. Agent-only and cosmetic updates are discarded. Each
event settles once as `delivered`, `not_delivered` with a reason, or
`outcome_unknown` after a lost response; Archboard never retries an unknown
mutation, falls back to turn or steer, or selects another thread.

What the voice model says is decided by channel, not by role. Read against Codex
0.155.1: a V3 session is full duplex, `thread/realtime/appendText` is a quiet
`session.context.append` whatever role it carries, and nothing answers it. A
coordinator message is spoken when it goes out on the speakable channel, and in
the `bemTags` handoff mode these sessions run in that is chosen by the message's
first characters: `[FINAL]` is spoken, `[COMMENTARY]` is quiet context, and a
headerless message is held back until it is complete and then treated as final.
So the coordinator's start instructions state the rule, and a preamble is never
read out as if it were the answer. It is also why work that ends later cannot be
told to the voice model directly: while voice is live, a terminal workhorse
outcome (completed, failed, attention, outcome unknown) starts one ordinary
coordinator turn from the reviewed `workhorse_outcome_report` producer, because
the coordinator knows whether the work came from a voice request. What it
replies under `[FINAL]` is spoken without the user asking again; a
`[COMMENTARY]` reply stays silent. The host waits a bounded time for an idle
coordinator and otherwise falls back to the injected developer message, so an
outcome is neither lost nor said twice. Other callbacks stay quiet context.

Realtime voice attaches to a persistent fast coordinator thread linked to the
pane's workhorse, not to the workhorse itself, so quick questions, lookups and
immediate board interaction stay responsive while a heavier turn continues. The
coordinator starts with `project_doc_max_bytes: 0`, so the checkout's `AGENTS.md`,
which is written for an agent working in the repository, never reaches it. The
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

A walkthrough is narrated as a talk through the same constraint (TASK-251). A
step cannot reach the voice model as data, so the loop is paced by the voice
model and carried by the coordinator. Starting voice to narrate a walkthrough
(the Narrate control on a presented walkthrough) sends the chosen walkthrough
with `realtimeStart`; the server reads it from the board the pane is showing
and tells both models only which walkthrough it is, by name: the voice `prompt`
gains how to pace the talk and `realtimeStartInstructions` the coordinator's
part. Neither is given the steps, so a step cannot be narrated before the pane
is on it.
The session's initial items end with the user's request itself (pressing
Narrate is asking for the talk), so the full-duplex voice model has something
to answer at once and paces the whole talk itself: it asks the coordinator for step 1; the
coordinator calls the typed `archboard_voice.present_step` with no step, because
a V3 delegation carries the user's last utterance and never words the voice
model composed, so only the host knows which step comes next (it names the
walkthrough when voice was not started in this mode, and a step only when the
user asked for one); the
host supplies the pane, board and variant, asks the pane for the step, and
answers only once the pane's own report says the step has finished arriving,
or with the reason it could not; the coordinator hands the step back as
speakable prose; the voice model explains it and asks for the next step only
when it has finished, so an interruption simply delays that request. The
position stays the browser's: the pane is asked, and its report is the
acknowledgement. A step the user chooses by hand, or leaving the
presentation, is injected into the coordinator's history and appended to the
voice session with the catalogue's discipline (serialized, deduplicated, never
retried). In a V3 (full-duplex) session appended text is quiet context whatever
its role, and what the voice model says is what arrives as speakable text, so a
by-hand step is handed to it through `realtimeAppendSpeech` in the coordinator's
hand-over words and it explains that step now; leaving is quiet context. A
narration starts with `delegationAckFiller` off, so a step is not preceded by
the Realtime API's "one moment". The silence between the end of one
explanation and the start of the next is measured by the canvas and read from
`GET /api/voice/narration-timing`.

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
