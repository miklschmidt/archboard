---
status: accepted
---

# The workbench owns one Codex app-server session

The agent workbench starts one configured Codex binary as a private stdio
`app-server` child and owns its complete lifecycle. Protocol types are generated
from that same binary with experimental fields included. Archboard does not
attach to ChatGPT Desktop, a shared daemon, the desktop IPC router, or an
ambient control socket. A browser connection can temporarily own interactive
reverse requests, but it never becomes an app-server client or process owner.

## The decision

Every general task that Archboard starts receives the reviewed six-operation
`archboard_app` namespace in `thread/start.dynamicTools`. A voice coordinator
receives a smaller namespace whose workhorse target is supplied by the host.
Tool calls return as typed `item/tool/call` server requests on the same
connection. Archboard validates the server-supplied task, turn, and call
identity, applies the matching target-state and approval policy, and delegates
to the one session runtime. There is no internal MCP adapter, second child,
private host socket, or copy of Desktop app-tool code. An attached task that was
not started with the general catalogue remains usable but does not pretend those
tools are available.

Live voice does not attach the low-latency model directly to a busy workhorse.
One persistent coordinator task is linked to the pane, board, and workhorse.
It uses a globally configured fast model and effort, prefers priority service
with a visible standard fallback, and runs under the ordinary workbench sandbox
and approval policy. Realtime V3 attaches to that coordinator. The coordinator
can investigate with normal Codex capabilities and perform one explicit,
unambiguous board operation directly, while sustained code and repository work
defaults to workhorse delegation. Bound operations inspect, delegate or queue,
manage the queue, and steer according to a visible global intervention policy.
Authoritative app-server events notify it; it never blocks in a wait tool.

Coordinator and workhorse histories remain separate and are cross-linked at
each delegation, queue mutation, steer, callback, approval, and result. Spoken
approval may select only one-time accept or decline, but the coordinator model
decides whether a request is low risk with no host-side request-class exclusion.
That model judgment is deliberately part of the security boundary and must be
named in the UI and tests.

The existing semantic change feed remains the source of compact board context.
Its history target is the exact controllable workhorse bound to the pane, never
an environment variable, recent-task heuristic, or loaded-task count. Quiet
human or mixed-origin updates enter that task through the same owned app-server
connection without starting a turn. While voice is active, the linked
coordinator receives the same event as realtime developer context. Agent-only
changes are discarded. Each voice start refreshes a compact semantic brief;
there is no second board snapshot or routing mechanism.

A browser reconnect may rehydrate state only while the same child and thread link
remain alive. Child exit invalidates every ownership proof. A replacement child
may list persisted tasks for inspection, but it never resumes one or delivers
input automatically.

## Rejected alternatives

Sharing the Desktop or daemon process couples Archboard to undocumented launch
behavior, process-global state, and another client's capabilities. A private MCP
adapter duplicates routing and approval state now carried directly by generated
dynamic-tool requests. Keeping ADR-0005's separate control-socket injector would
leave two app-server clients, two task selectors, and an ambient route that can
disagree with the visible thread link.

## Consequences

ADR-0005's push intent survives, but its control-socket discovery,
`ARCHBOARD_INJECT*` configuration, explicit thread environment route, status and
test surface, and loud-injection experiment are removed when the workbench
lands. Until then, ADR-0005 describes the shipped implementation. Direct tests
must prove exact task routing, self-injection refusal, same-child reconnect,
child-exit invalidation, and isolation between two app-server children sharing
one `CODEX_HOME`.
