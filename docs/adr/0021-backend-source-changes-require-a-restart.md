---
status: accepted
---

# Backend source changes require a server restart

Archboard used Bun hot reload to replace backend modules while keeping sockets,
panes, and process state alive. That required a global `kept()` registry,
reload tokens and canaries, and a whole-project module-scope analyzer. The
analyzer exhausted host memory during TASK-143.08.01, and a type-aware lint
replacement recreated the same failure class. The machinery also made backend
lifecycle state depend on which version of a module held a reference.

## Decision

Backend source changes take effect only after an explicit server restart.
Archboard does not run its server with `bun --hot`, `--watch`, or an automatic
restart-on-save process. It has no backend reload command, endpoint, token,
canary, global `kept()` registry, or source policy that parses a TypeScript
project to make module replacement safe.

Runtime state has ordinary process lifetime. The Canvas application owns every
resource that needs ordered construction or teardown. That includes the HTTP
and WebSocket servers, the Codex child, browser sockets and pane leases,
pending operations, lock and claim timers, note watches, and change-feed
settlement. It installs signal ownership before any fallible child startup,
starts each owner once, and tears them down in reverse order. A timed owner has
its own grace and force action; after forcing, the lifetime still waits for the
original stop operation to settle. It never reports an abandoned cleanup as a
completed shutdown. Harmless caches may stay module-local when they own no
timer, handle, listener, child, or process-only user work.

A restart disconnects live browser sessions and clears process-only state.
Persisted boards remain in their notes under ADR 0015. A held board is the
exception because its refused edits exist only in the running process. The
ordinary stop and restart path checks for holds before it sends a signal. It
refuses while any hold exists and names the boards and available recovery
actions. After a signal, the application stops admitting HTTP writes, drains
both admitted request bodies and the explicit asynchronous mutation work they
entered, and checks holds again before it closes a browser or server. A client
disconnect cancels a board-lock wait before it can resume into a write. The
drain is bounded: work that does not settle refuses the stop, names what is
still active, restores write admission, and leaves every resource intact for a
later retry. Listen failures unwind the owners already entered, and a runtime
HTTP server error enters this same guarded stop instead of running a separate
exit path. Source-freshness guidance uses that same guarded restart path.

Frontend Vite HMR may remain. It belongs to the browser bundle process and does
not replace modules inside the Archboard server. Backend and frontend
development commands must keep that distinction visible.

Generated Codex contracts are unrelated to source scanning. Ordinary product
type-checking imports the exact generated types through their module root and
reports incompatible assumptions through TypeScript. Fingerprints, mirror
detectors, alias corpora, Babel parsing, custom TypeScript AST walking, and
type-aware lint policies are not substitutes for that dependency. Repository
validation does not invoke Oxlint with `--type-aware` or run `tsgolint`, and
Archboard has no direct `oxlint-tsgolint` dependency. Boundary behavior remains
covered by ordinary TypeScript compilation and bounded type-unaware tests.

## Rejected alternatives

**Replace the analyzer.** A Babel parser, another TypeScript walker, or a
type-aware linter preserves the cost and maintenance burden of proving that
arbitrary module replacement is safe. One attempted replacement drove
`tsgolint` to roughly 32 GiB of anonymous RSS before the kernel killed it.

**Restart the backend whenever a file is saved.** A save is not an operator
decision. An automatic restart can disconnect the wall and can destroy a held
board's only copy without giving the operator a chance to resolve it.

## Consequences

This ADR supersedes only the hot-reload portion of ADR 0014. The canvas and CLI
still run TypeScript source directly with Bun, the browser bundle still has a
build step, and type-checking remains an explicit required gate.

Backend development has one lifecycle: start, run, stop. Source-freshness
diagnostics tell the operator to use the guarded restart path. Tests exercise
startup failure, held-board refusal, recovery, shutdown with and without
connected browsers, pending-operation settlement, child and timer cleanup,
signals, timeouts, and a second fresh application start. The repository no
longer needs hot-reload fixtures or a special global lifetime model.
