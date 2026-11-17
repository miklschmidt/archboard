---
status: accepted
---

# The workbench owns one Codex app-server session

Amended by [ADR 0047](0047-built-in-agents-support-architecture-and-hand-off-implementation.md):
the built-in agents support architecture work and hand off implementation to
the user's own coding agent.

## Issue

The workbench must show and control the same agent state that the person is
looking at. Attaching to the agent process of another desktop client makes
ownership, approvals, queued work, reconnects, and shutdown depend on an
undocumented external lifecycle. Routing board changes through ambient process
configuration creates a second, invisible answer to “which agent is this pane
talking to?”

## Decision

Archboard owns one private Codex app-server child and its complete lifecycle.
That child runs with dedicated application state and a supported sign-in, shared
only with the other canvases on the machine. It is not shared with ChatGPT
Desktop, another Codex client, or an ambient daemon. A browser can temporarily
own presentation of interactive requests, but it never becomes the process owner
or a second app-server client.

The canvases on one machine share one Codex home and so one sign-in. Each canvas
still owns one child and its own epoch ledger. So a canvas lists the threads of
another canvas as inspect-only, and signing out in one canvas signs out every
canvas.

A browser tab talks to Codex only through the thread link of its tab session.
The link binds the session to one workhorse for each checkout, which the
current child controls ([ADR
0050](0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md)).
Each tab session has its own threads, queue, command lease and approvals.

Replacing the child invalidates every execution proof and unbinds every tab
session. An execution proof shows that an operation was committed, was
delivered, and belongs to the epoch that runs now. A caller must hold one before
it acts on a thread that it created. Earlier threads can remain inspectable, but
Archboard does not resume them or deliver input, tools, queued work, or board
context to them. Dedicated state is not a security boundary against a
malicious process that runs as the same user.

The epoch ledger exists to work around a Codex behavior. Resuming an older
thread loses the dynamic tools that the thread started with. So Archboard must
know which threads belong to a previous child and must refuse to resume them.
If upstream fixes this, the epoch mechanism must be removed. Until then, the
ledger has no durability machinery. Archboard treats a ledger that it cannot
read as "no prior epochs", which leaves every earlier thread inspect-only.

Each tab session owns one coordinator at a time. The coordinator carries at
most one voice session. A new voice session starts a new coordinator thread, so
a second talk inherits no handoff, transcript or instruction from the first.

The coordinator can answer quick questions and perform one explicit bounded
board action. Sustained work defaults to the workhorse, and the two histories
stay separate. Live voice attaches to the coordinator, never directly to the
workhorse. The coordinator does not block to wait for the workhorse.

Spoken approval is state-gated. The person hears the exact stored effect, and a
later ordinary coordinator turn can resolve only that pending one-time choice.
The host executes the stored effect at most once. A request that blocks the
coordinator, cannot be correlated safely, or offers a broader grant remains
visual-only. Coordinator model judgment is therefore part of the security
boundary, and the interface must say so.

The existing semantic change feed remains the sole source of compact board
context. Archboard never sends an agent change back to the tab session whose
threads made it. There is no environment route, recent-thread heuristic, or
second board snapshot. The child's environment names the server that started
it, so a thread that runs `archboard` talks to its own server and never starts
another. This is an address, not a route for board context.

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
- One thread link for the whole canvas put every tab into one conversation. A
  Talk in one tab then stopped the voice of another, and a recording was refused
  while anybody talked.

## Consequences

Each tab costs a workhorse thread and a coordinator thread, and a recording is a
tab of its own.

The semantic-push intent of ADR-0005 survives. The explicit thread link and
owned session here supersede its routing and process-ownership decision.
