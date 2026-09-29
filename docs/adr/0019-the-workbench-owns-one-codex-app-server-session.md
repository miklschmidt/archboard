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

Amended by TASK-374 (2026-09-29): the old coordinator does not stay loaded in
the child. Once its voice session has closed and no turn runs on it, Archboard
unsubscribes from it with `thread/unsubscribe`. Codex then unloads the thread
and keeps its rollout. The unsubscribe waits for the turn, because Codex sends
that turn's tool calls and approvals only to subscribers.

Amended by TASK-373 (2026-09-29): each browser tab is a tab session, and this
replaces the single link of TASK-302. A tab session is one tab's conversation.
The tab keeps the session's id in sessionStorage, so a reload keeps the
conversation and a new tab or window starts a new one. Each tab session has its
own thread link, workhorse, coordinator, voice session, board-change delivery,
queue, command lease and approvals. So two tabs can talk at the same time. The
coordinator starts with the tab's first message or Talk, not at sign-in. A
session ends 60 seconds after the last socket of its panes closes. A reload
within that time keeps the conversation and its approvals, but it stops voice.
At the end, Archboard settles the session's approvals, stops its board-change
delivery and clears its link. It unsubscribes each of its threads once no turn
runs on it, so Codex unloads them. The thread selector, its list of candidate
threads and the attach, relink and refresh commands are gone. The sentences
below say so. Everything else stands.

Amended by TASK-379 (2026-09-29): the child's environment names the server that
started it. `ARCHBOARD_URL` and `ARCHBOARD_VAULT` are that server's URL and
vault, and `ARCHBOARD_NO_AUTOSTART` is `1`. So a thread that runs `archboard`
talks to its own server and never starts another. This is an address, not a
route for board context. Board changes still reach a thread only through the
change feed. Everything else stands.

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

A browser tab talks to Codex only through the **thread link** of its **tab
session**. A tab session is the conversation of one tab, and the tab keeps its
id in sessionStorage. The link binds the session to one workhorse that the
current child controls. The first thing the person asks in the tab makes the
link: a message or Talk. No separate step makes it. Both panes of a tab show and
speak for the same conversation. A message carries the board of the focused
pane as its context. Every other tab holds a conversation of its own.
Replacing the child invalidates every execution proof and unbinds every
tab session. Earlier threads can remain inspectable, but Archboard does not
resume them or deliver input, tools, queued work, or board context to them.
Dedicated state prevents accidental discovery. It is not a security boundary
against a malicious process that runs as the same user.

The epoch manifest that records which child owns which thread exists to work
around a Codex behaviour: resuming an older thread loses the dynamic tools it
was started with, so Archboard must know which threads belong to a previous
child and refuse to resume them. The maintainer expects this to be fixed
upstream, and the epoch mechanism should be removed when it is. Until then the
ledger is one file replaced atomically by a rename, with no lock file, second
copy, or other durability machinery; a manifest that cannot be read is treated
as "no prior epochs", which leaves every earlier thread inspect-only.

Archboard creates every workhorse that it drives, and each one receives a
small typed coordination catalogue on the owned connection. Mutating
coordination is bound to the caller, target state, current ownership, and a fresh person-approved
effect. Waiting across agents is rejected when it would introduce a direct or
transitive cycle. Archboard does not add an internal MCP process for these
operations.

Each tab session owns one coordinator at a time. The coordinator starts with
the first message or Talk of the session, and it carries at most one voice
session. So two tabs can talk at once, each on its own coordinator. The
coordinator is a normal capable Codex thread with ordinary investigation tools, sandbox,
and approvals. It may answer quick questions and perform one explicit bounded
board action, while sustained or multi-step implementation defaults to the
workhorse. Coordinator and workhorse histories stay separate and cross-link
delegation, queue, steering, callbacks, approvals, and results.

Live voice attaches to the coordinator, never directly to the workhorse. The
coordinator does not block waiting for workhorse completion; authoritative
events return as ordered, non-reentrant callbacks. Queueing is allowed only
where Archboard can prove the workhorse will retain the required context. A
busy workhorse can take a related correction, but Archboard refuses unrelated
work until the workhorse is idle.

Spoken approval is state-gated. The person hears the exact stored effect, and a
later ordinary coordinator turn may resolve only that pending one-time choice.
The host revalidates the requester, target, effect, voice session, and expiry
before executing the stored effect at most once. A request that blocks the
coordinator, cannot be correlated safely, or offers a broader grant remains
visual-only. Coordinator model judgment is therefore part of the security
boundary and the interface must say so.

The existing semantic change feed remains the sole source of compact board
context. Each tab session receives the feed on its own. A change goes to the
workhorse that the link of each tab session names. While the voice of a session
is live, the change also goes to its coordinator. Archboard never sends an agent
change back to the tab session whose threads made it. So a change that the
workhorse of one tab made is news to every other tab. There is no environment
route, recent-thread heuristic, or second board snapshot.

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
- One thread link for the whole canvas (TASK-302) put every tab into one
  conversation. A Talk in one tab then stopped the voice of another, and a
  recording was refused while anybody talked.

## Consequences

Archboard must maintain its own Codex sign-in, process status and reconnect
story, and must carry a message or a Talk through each of them without asking
the person to set anything up. A child restart is intentionally conservative.
Prior work remains inspectable but not executable, and the next message or
Talk in a tab creates a new link for that tab. Workhorse and coordinator state
remain visibly separate. Each tab costs a workhorse thread and a coordinator
thread, and a recording is a tab of its own. A tab session that ends settles
what it was asked and gives up its threads, so a closed tab holds nothing in
the child.

ADR-0005's semantic-push intent survives, but its routing and process-ownership
decision is superseded by the explicit thread link and owned session here.
