---
status: accepted
---

# The workbench owns one Codex app-server session

Amended by TASK-302 (2026-09-23): a canvas has one thread link, not one per
pane, and nobody makes it by hand. The first message or press of Talk signs in
if needed, starts Codex, creates the workhorse and links it; whichever pane is
focused speaks for the conversation, with its board as context. The sentences
below say so; everything else stands.

Amended by TASK-313 (2026-09-23): the canvases on one machine share one Codex
home, one Codex database and so one sign-in; Codex takes several processes on
one home, reloading the sign-in from disk before it refreshes it. What
Archboard keeps about its own child, the owner lock and the epoch ledger, is one
canvas's, under `codex-workbench/canvases/<port>`, because the ledger is written
by one process and a second canvas's child would make this one's stale. Each
canvas still owns one child. Three consequences follow: a canvas lists another
canvas's threads, which its own ledger does not know, as foreign and
inspect-only; signing out in one canvas signs out every canvas; and a canvas
that is already running shows a sign-in or sign-out made in another only after
its child restarts.

Amended by TASK-301 (2026-09-29): a coordinator carries at most one voice
session. A voice start that finds the coordinator already carried one starts a
new coordinator thread first. The old coordinator stays current until the new
one is ready, and it is never driven again after that. A turn that the last
session left running, and whatever that turn answers, stay on the old thread,
which no later session speaks from. A second talk on one child therefore
inherits no handoff, transcript or instruction from the first. A workhorse
operation that the old coordinator started runs to its end, and the new
coordinator hears what the workhorse did as workhorse news. The sentences below
say so. Everything else stands.

## Issue

The workbench must show and control the same agent state that the person is
looking at. Attaching to another desktop client's agent process would make
ownership, approvals, queued work, reconnects, and shutdown depend on an
undocumented external lifecycle. Routing board changes through ambient process
configuration would create a second, invisible answer to “which agent is this
pane talking to?”

Voice adds another agent role. Connecting a low-latency voice model directly to
a busy implementation thread would mix conversation, orchestration, and
sustained work in one history, and would leave approval authority ambiguous.

## Decision

Archboard owns one private Codex app-server child and its complete lifecycle.
That child has dedicated application state and a supported sign-in, shared only
with the other canvases on the machine. It is not shared with ChatGPT Desktop,
another Codex client, or an ambient daemon. A
browser may temporarily own presentation of interactive requests, but it never
becomes the process owner or a second app-server client.

A canvas talks to Codex only through its **thread link**, which binds the
canvas to one workhorse controlled by the current child. The link is made by
the first thing the person asks — a message or Talk — and never by a separate
step; every pane shows and speaks for the same conversation, the focused pane's
board being the context a message carries. Replacing the child
invalidates every execution proof: earlier threads may remain inspectable, but
Archboard does not resume them or deliver input, tools, queued work, or board
context to them. Dedicated state prevents accidental discovery; it is not a
security boundary against a malicious process running as the same user.

The epoch manifest that records which child owns which thread exists to work
around a Codex behaviour: resuming an older thread loses the dynamic tools it
was started with, so Archboard must know which threads belong to a previous
child and refuse to resume them. The maintainer expects this to be fixed
upstream, and the epoch mechanism should be removed when it is. Until then the
ledger is one file replaced atomically by a rename, with no lock file, second
copy, or other durability machinery; a manifest that cannot be read is treated
as "no prior epochs", which leaves every earlier thread inspect-only.

Archboard-created workhorses receive a small typed coordination catalogue on
the owned connection. Attached threads remain usable without pretending that
they have tools they were not started with. Mutating coordination is bound to
the caller, target state, current ownership, and a fresh person-approved
effect. Waiting across agents is rejected when it would introduce a direct or
transitive cycle. Archboard does not add an internal MCP process for these
operations.

Each valid thread link may also own one coordinator at a time, and a
coordinator carries at most one voice session. The coordinator
is a normal capable Codex thread with ordinary investigation tools, sandbox,
and approvals. It may answer quick questions and perform one explicit bounded
board action, while sustained or multi-step implementation defaults to the
workhorse. Coordinator and workhorse histories stay separate and cross-link
delegation, queue, steering, callbacks, approvals, and results.

Live voice attaches to the coordinator, never directly to the workhorse. The
coordinator does not block waiting for workhorse completion; authoritative
events return as ordered, non-reentrant callbacks. Queueing is allowed only
where Archboard can prove the workhorse will retain the required context. A
busy attached workhorse may receive a related correction, but unrelated work is
refused until it is idle.

Spoken approval is state-gated. The person hears the exact stored effect, and a
later ordinary coordinator turn may resolve only that pending one-time choice.
The host revalidates the requester, target, effect, voice session, and expiry
before executing the stored effect at most once. A request that blocks the
coordinator, cannot be correlated safely, or offers a broader grant remains
visual-only. Coordinator model judgment is therefore part of the security
boundary and the interface must say so.

The existing semantic change feed remains the sole source of compact board
context. Human or mixed-origin changes go only to the workhorse named by the
thread link and, while voice is active, its linked coordinator. Agent-only
changes are not narrated back to their author. There is no environment route,
recent-thread heuristic, or second board snapshot.

## Rejected alternatives

- Sharing a desktop or daemon process couples Archboard to another client's
  lifecycle, capabilities, and process-global state.
- Sharing the normal Codex application state permits accidental discovery and
  resumption of persisted tools or queued work.
- A private MCP adapter duplicates routing and approval state already owned by
  the workbench session.
- Retaining ADR-0005's ambient control-socket route would leave two clients and
  two selectors that can disagree with the visible thread link.
- Using the workhorse as the voice participant mixes low-latency conversation
  with sustained implementation and makes intervention policy opaque.

## Consequences

Archboard must maintain its own Codex sign-in, process status and reconnect
story, and must carry a message or a Talk through each of them without asking
the person to set anything up. A child restart is intentionally conservative:
prior work remains inspectable but not executable, and the next message or
Talk creates a new current link. Workhorse and coordinator state remain
visibly separate.

ADR-0005's semantic-push intent survives, but its routing and process-ownership
decision is superseded by the explicit thread link and owned session here.
