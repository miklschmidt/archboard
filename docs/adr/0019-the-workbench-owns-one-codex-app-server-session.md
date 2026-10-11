---
status: accepted
---

# The workbench owns one Codex app-server session

Amended by [ADR 0047](0047-built-in-agents-support-architecture-and-hand-off-implementation.md):
the built-in agents support architecture work and hand off implementation to
the user's own coding agent.

Amended by TASK-302 (2026-09-23): a canvas has one thread link, not one per
pane, and nobody makes it by hand. If sign-in is needed, the first message or
press of Talk signs in, starts Codex, creates the workhorse and links it.
Whichever pane is focused speaks for the conversation, with its board as
context. The sentences below say so. Everything else stands.

Amended by TASK-313 (2026-09-23): the canvases on one machine share one Codex
home, one Codex database and so one sign-in. Codex takes several processes on
one home, and it reloads the sign-in from disk before it refreshes it.

Amended by TASK-319 (2026-10-11): the person sees what the voice coordinator
does. Its turns show in the one conversation, among the workhorse's turns. A
workhorse turn that the coordinator delegated names the coordinator turn that
did it. So "the state of the workhorse and the state of the coordinator remain
visibly separate" (Consequences) now means that the two are told apart. A
coordinator turn has its own head and mark. The dock, Stop and the composer
speak of the workhorse only. The two threads and their lifetimes stay separate,
and the decision above stands.

Archboard keeps two things about its own child: the owner lock and the epoch
ledger. An epoch is one run of the child, and the epoch ledger records which
epoch owns which thread. The lock and the ledger belong to one canvas, under
`codex-workbench/canvases/<port>`. One process writes the ledger, and the child
of a second canvas makes the ledger of this canvas stale. Each canvas still owns
one child. Three consequences follow:

- A canvas lists the threads of another canvas as foreign and inspect-only,
  because its own ledger does not know them.
- Signing out in one canvas signs out every canvas.
- A canvas that is already running shows a sign-in or sign-out made in another
  canvas only after its child restarts.

Amended by TASK-301 (2026-09-29): a coordinator carries at most one voice
session. If a voice start finds that the coordinator already carries a voice
session, it starts a new coordinator thread first. The old coordinator stays
current until the new one is ready. After that, nothing drives it again.

A turn that the last session left running stays on the old thread. Whatever that
turn answers stays there too. No later session speaks from that thread. A second
talk on one child therefore inherits no handoff, transcript or instruction from
the first. A workhorse operation that the old coordinator started runs to its
end. The new coordinator hears what the workhorse did as workhorse news. The
sentences below say so. Everything else stands.

Amended by TASK-374 (2026-09-29): the old coordinator does not stay loaded in
the child. After its voice session closes and no turn runs on it, Archboard
unsubscribes from it with `thread/unsubscribe`. Codex then unloads the thread
and keeps its rollout. The unsubscribe waits for the turn, because Codex sends
that turn's tool calls and approvals only to subscribers.

Amended by TASK-373 (2026-09-29): each browser tab is a tab session, and this
replaces the single link of TASK-302. A tab session is one tab's conversation.
The tab keeps the session id in sessionStorage. So a reload keeps the
conversation, and a new tab or window starts a new one.

Each tab session has its own thread link, workhorse, coordinator, voice session,
board-change delivery, queue, command lease and approvals. So two tabs can talk
at the same time. The coordinator starts with the first message or Talk of the
tab, not at sign-in.

A session ends 60 seconds after the last socket of its panes closes. A reload
within that time keeps the conversation and its approvals, but it stops voice.
At the end, Archboard settles the approvals of the session, stops its
board-change delivery and clears its link. After no turn runs on a thread of the
session, Archboard unsubscribes from it, so Codex unloads it.

The thread selector, its list of candidate threads and the attach, relink and
refresh commands are gone. The sentences below say so. Everything else stands.

Amended by TASK-379 (2026-09-29): the environment of the child names the server
that started it. `ARCHBOARD_URL` and `ARCHBOARD_VAULT` are the URL and vault of
that server, and `ARCHBOARD_NO_AUTOSTART` is `1`. So a thread that runs
`archboard` talks to its own server and never starts another. This is an
address, not a route for board context. Board changes still reach a thread only
through the change feed. Everything else stands.

## Issue

The workbench must show and control the same agent state that the person is
looking at. Attaching to the agent process of another desktop client makes
ownership, approvals, queued work, reconnects, and shutdown depend on an
undocumented external lifecycle. Routing board changes through ambient process
configuration creates a second, invisible answer to “which agent is this pane
talking to?”

Voice adds another agent role. Connecting a low-latency voice model directly to
a busy implementation thread mixes conversation, orchestration, and sustained
work in one history. It also leaves approval authority ambiguous.

## Decision

Archboard owns one private Codex app-server child and its complete lifecycle.
That child runs with dedicated application state and a supported sign-in, shared
only with the other canvases on the machine. It is not shared with ChatGPT
Desktop, another Codex client, or an ambient daemon. A browser can temporarily
own presentation of interactive requests, but it never becomes the process owner
or a second app-server client.

A browser tab talks to Codex only through the thread link of its tab session. A
tab session is the conversation of one tab, and the tab keeps its id in
sessionStorage. The link binds the session to one workhorse that the current
child controls. The first thing the person asks in the tab makes the link: a
message or Talk. No separate step makes it.

Both panes of a tab show and speak for the same conversation. A message carries
the board of the focused pane as its context. Every other tab holds a
conversation of its own.

Replacing the child invalidates every execution proof and unbinds every tab
session. An execution proof shows that an operation was committed, was
delivered, and belongs to the epoch that runs now. A caller must hold one before
it acts on a thread that it created. Earlier threads can remain inspectable, but
Archboard does not resume them or deliver input, tools, queued work, or board
context to them. Dedicated state prevents accidental discovery. It is not a
security boundary against a malicious process that runs as the same user.

The epoch ledger exists to work around a Codex behavior. Resuming an older
thread loses the dynamic tools that the thread started with. So Archboard must
know which threads belong to a previous child and must refuse to resume them.
The maintainer expects a fix upstream. If upstream fixes this, the epoch
mechanism must be removed.

Until then, the ledger is one file replaced atomically by a rename. It has no
lock file, second copy, or other durability machinery. Archboard treats a ledger
that it cannot read as "no prior epochs". That leaves every earlier thread
inspect-only.

Archboard creates every workhorse that it drives. Each workhorse receives a
small typed coordination catalog on the owned connection. Mutating coordination
is bound to the caller, the target state, the current ownership, and a fresh
person-approved effect. If waiting across agents introduces a direct or
transitive cycle, Archboard rejects it. Archboard does not add an internal MCP
process for these operations.

Each tab session owns one coordinator at a time. The coordinator starts with the
first message or Talk of the session, and it carries at most one voice session.
So two tabs can talk at once, each on its own coordinator.

The coordinator is a normal capable Codex thread with ordinary investigation
tools, sandbox, and approvals. It can answer quick questions and perform one
explicit bounded board action. Sustained architectural inspection, analysis,
and proposal work defaults to the workhorse. The histories of the coordinator
and workhorse stay separate.
They cross-link delegation, queue, steering, callbacks, approvals, and results.

Live voice attaches to the coordinator, never directly to the workhorse. The
coordinator does not block to wait for the workhorse to complete. Authoritative
events return as ordered, non-reentrant callbacks. Archboard allows queueing
only where it can prove that the workhorse will retain the required context. A
busy workhorse can take a related correction, but Archboard refuses unrelated
work until the workhorse is idle.

Spoken approval is state-gated. The person hears the exact stored effect, and a
later ordinary coordinator turn can resolve only that pending one-time choice.
Before the host executes the stored effect at most once, it makes sure that the
requester, target, effect, voice session, and expiry are still valid. A request
that blocks the coordinator, cannot be correlated safely, or offers a broader
grant remains visual-only. Coordinator model judgment is therefore part of the
security boundary, and the interface must say so.

The existing semantic change feed remains the sole source of compact board
context. Each tab session receives the feed on its own. A change goes to the
workhorse that the link of each tab session names. While the voice of a session
is live, the change also goes to its coordinator.

Archboard never sends an agent change back to the tab session whose threads made
it. So a change that the workhorse of one tab made is news to every other tab.
There is no environment route, recent-thread heuristic, or second board
snapshot.

## Rejected alternatives

The decision rejects these alternatives:

- Sharing a desktop or daemon process couples Archboard to the lifecycle,
  capabilities, and process-global state of another client.
- Sharing the normal Codex application state permits accidental discovery and
  resumption of persisted tools or queued work.
- A private MCP adapter duplicates routing and approval state that the workbench
  session already owns.
- Retaining the ambient control-socket route of ADR-0005 leaves two clients and
  two selectors that can disagree with the visible thread link.
- Using the workhorse as the voice participant mixes low-latency conversation
  with sustained implementation and makes intervention policy opaque.
- One thread link for the whole canvas (TASK-302) put every tab into one
  conversation. A Talk in one tab then stopped the voice of another, and a
  recording was refused while anybody talked.

## Consequences

Archboard must maintain its own Codex sign-in, process status and reconnect
story. It must carry a message or a Talk through each of them, without asking
the person to set anything up. A child restart is intentionally conservative.
Prior work remains inspectable but not executable. The next message or Talk in a
tab creates a new link for that tab. The state of the workhorse and the state of
the coordinator remain visibly separate.

Each tab costs a workhorse thread and a coordinator thread, and a recording is a
tab of its own. A tab session that ends settles what it was asked and gives up
its threads, so a closed tab holds nothing in the child.

The semantic-push intent of ADR-0005 survives. The explicit thread link and
owned session here supersede its routing and process-ownership decision.
