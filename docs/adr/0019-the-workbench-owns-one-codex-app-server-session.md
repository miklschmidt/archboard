---
status: accepted
---

# The workbench owns one Codex app-server session

The agent workbench starts the exactly reviewed Codex 0.151.0 binary as a private
stdio `app-server` child and owns its complete lifecycle. Protocol types are
generated from that binary with experimental fields included. Archboard does not
attach to ChatGPT Desktop, a shared daemon, the desktop IPC router, or an ambient
control socket. A browser connection can temporarily own interactive reverse
requests, but it never becomes an app-server client or process owner.

The child uses a stable Archboard-only `CODEX_HOME` and an explicitly dedicated
`CODEX_SQLITE_HOME`, with its own supported sign-in. It never inherits either
path, symlinks the default mutable authentication or configuration files, or
borrows a bearer token from another app-server. This prevents accidental
discovery and sharing. Codex 0.151.0 has no owner capability, so it is not a
security boundary against another same-user process deliberately pointed at
those paths.

## The decision

Every general thread that Archboard starts receives the reviewed six-operation
`archboard_app` namespace in `thread/start.dynamicTools`. A voice coordinator
receives four host-bound workhorse operations plus a separate typed spoken-
approval resolver. Realtime V3 cannot invoke these tools; a spoken reply must
delegate into a later ordinary coordinator turn before the resolver can run.
Tool calls return as typed `item/tool/call` server requests on the same
connection. Archboard validates the server-supplied thread, turn, and call
identity, applies the matching target-state and approval policy, and delegates
to the one session runtime. There is no internal MCP adapter, second child,
private host socket, or copy of Desktop app-tool code. An attached thread that
was not started with the general catalogue remains usable but does not pretend
those tools are available.

Dynamic tools and queued submissions persist in Codex rollout and SQLite state.
An Archboard epoch manifest outside both stores records the child epoch and its
threads. A replacement child starts a new epoch: prior-epoch threads are list-
and read-only, and every resume, fork, turn, queue-start, or dynamic-tool
execution path is refused. A cold resume is never used for inspection because
0.151.0 may restore the dynamic catalogue and immediately dispatch persisted
queue work.

Live voice does not attach the low-latency model directly to a busy workhorse.
One persistent coordinator thread is linked to the pane, board, and workhorse.
It uses a globally configured fast model and effort, prefers priority service
with a visible standard fallback, and runs under the ordinary workbench sandbox
and approval policy. Realtime V3 attaches to that coordinator. The coordinator
can investigate with normal Codex capabilities and perform one explicit,
unambiguous board operation directly, while sustained code and repository work
defaults to workhorse delegation.

Queueing is allowed only for an Archboard-created workhorse with proven
persistent instructions. An attached busy workhorse can receive a related
`turn/steer` with exact additional context; unrelated work is refused until idle
rather than queued without that context. Exhaustive queue reads preserve mixed,
unowned entries during reorder, and `thread/queue/start` recovers an interrupted
queue. Authoritative app-server events become exactly-once callbacks and are
buffered rather than re-entering a coordinator dynamic call. The coordinator
never blocks in a wait tool. General dynamic waits use a session-owned wait-for
graph that rejects direct and transitive cycles before dispatch.

Coordinator and workhorse histories remain separate and are cross-linked at
each delegation, queue mutation, steer, callback, approval, and result. With
voice inactive, callbacks enter coordinator history through
`thread/inject_items`; with voice active they enter realtime developer context,
and only terminal or attention policy may request speech.

Spoken approval has one global pending slot. It is available to every request
class only when the ordinary coordinator thread is free to classify the later
delegated answer and one-time accept or decline is actually offered. A request
blocking that coordinator remains visual-only. The host stores an immutable,
fingerprinted approval record, speaks its exact description with
`thread/realtime/appendSpeech`, and arms it only after the expected session-
scoped assistant transcript sequence. The later ordinary coordinator turn calls
the typed resolver with only approval id and verdict. A compare-and-swap against
child epoch, realtime session, request identity, target state, effect, expiry,
and pending state executes the stored effect at most once. Coordinator model
judgment is part of the security boundary. Version 0.151.0 does not correlate
`appendSpeech` completion with a typed item id, so the remaining transcript-
sequence voice race is an explicitly accepted limitation named in UI and tests.

The existing semantic change feed remains the source of compact board context.
Its history target is the exact controllable workhorse linked to the pane, never
an environment variable, recent-thread heuristic, or loaded-thread count. Quiet
human or mixed-origin updates enter that thread through the same owned app-server
connection without starting a turn. While voice is active, the linked
coordinator receives the same event as realtime developer context. Agent-only
changes are discarded. Each voice start refreshes a compact semantic brief;
there is no second board snapshot or routing mechanism.

A browser reconnect may rehydrate state only while the same child, epoch, and
thread link remain alive. Child exit invalidates every ownership proof. A
replacement child may list and read prior-epoch threads for inspection, but it
never resumes, forks, queues, steers, or delivers input to one.

## Rejected alternatives

Sharing the Desktop or daemon process couples Archboard to undocumented launch
behavior, process-global state, and another client's capabilities. Sharing the
normal Codex home also permits accidental resume of persisted dynamic tools and
queued work. A private MCP adapter duplicates routing and approval state now
carried directly by generated dynamic-tool requests. Keeping ADR-0005's separate
control-socket injector would leave two app-server clients, two thread selectors,
and an ambient route that can disagree with the visible thread link.

## Consequences

ADR-0005's push intent survives, but its control-socket discovery,
`ARCHBOARD_INJECT*` configuration, explicit thread environment route, status and
test surface, and loud-injection experiment are removed when the workbench lands.
Until then, ADR-0005 describes the shipped implementation. Direct tests must
prove exact thread routing, self-injection refusal, same-child reconnect,
prior-epoch execution refusal, cold-queue non-dispatch, dedicated-home isolation,
transitive wait-cycle refusal, approval revalidation, callback ordering, and
every spoken-approval compare-and-swap race.
