---
status: accepted
---

# Backend source changes require a server restart

Amended by [ADR
0049](0049-one-server-serves-every-vault-and-every-call-names-its-vault.md)
(2026-10-14). Inside an archboard checkout, `archboard` runs that checkout's
source. A linked worktree of archboard runs its own server on a port derived
from its path, so a restart there never stops the server on port 3000.
Everything else stands.

Archboard used Bun hot reload to replace backend modules while keeping sockets,
panes, and process state alive. That required a global `kept()` registry, reload
tokens and canaries, and a whole-project module-scope analyzer. The analyzer
exhausted host memory during TASK-143.08.01, and a type-aware lint replacement
recreated the same failure class. The machinery also made backend lifecycle
state depend on which version of a module held a reference.

## Decision

Backend source changes take effect only after an explicit server restart.
Archboard does not run its server with `bun --hot`, `--watch`, or an automatic
restart-on-save process. It has no backend reload command, endpoint, token,
canary, global `kept()` registry, or source policy that parses a TypeScript
project to make module replacement safe.

Runtime state has ordinary process lifetime. The Canvas application owns every
resource that needs ordered construction or teardown:

- The HTTP and WebSocket servers
- The Codex child
- Browser sockets and pane leases
- Pending operations
- Lock and claim timers
- Note watches
- Change-feed settlement

The application installs signal ownership before any fallible child startup. It
starts each owner once and tears the owners down in reverse order. A timed owner
has its own grace and force action. After forcing, the lifetime still waits for
the original stop operation to settle. The application never reports an
abandoned cleanup as a completed shutdown. A cache that owns no timer, handle,
listener, child, or process-only user work is harmless and can stay
module-local.

A restart disconnects live browser sessions and clears process-only state.
Persisted boards remain in their notes under ADR 0015. A held board is the
exception because its refused edits exist only in the running process. The
ordinary stop and restart path looks for holds before it sends a signal. It
refuses while any hold exists and names the boards and available recovery
actions.

After a signal, the application stops admitting HTTP writes. It drains both
admitted request bodies and the explicit asynchronous mutation work they
entered. Before it closes a browser or server, it looks for holds again. A
client disconnect cancels a board-lock wait before it can resume into a write.
The drain is bounded. Work that does not settle refuses the stop, names what is
still active, restores write admission, and leaves every resource intact for a
later retry.

Listen failures unwind the owners already entered. A runtime HTTP server error
enters this same guarded stop. It does not run a separate exit path. The HTTP
listener receives the startup abort signal directly. Teardown waits until a
pending listen closes or fails before it reports a terminal stop.
Source-freshness guidance uses that same guarded restart path.

Frontend Vite HMR can remain. It belongs to the browser bundle process and does
not replace modules inside the Archboard server. Backend and frontend
development commands must keep that distinction visible.

Generated Codex contracts are unrelated to source scanning. Ordinary product
type-checking imports the exact generated types through their module root. It
reports incompatible assumptions through TypeScript. Fingerprints, mirror
detectors, alias corpora, Babel parsing, custom TypeScript AST walking, and
type-aware lint policies are not substitutes for that dependency. Repository
validation does not invoke Oxlint with `--type-aware` or run `tsgolint`.
Archboard has no direct `oxlint-tsgolint` dependency. Ordinary TypeScript
compilation and bounded type-unaware tests still cover boundary behavior.

## Rejected alternatives

Replacing the analyzer was rejected. A Babel parser, another TypeScript walker,
or a type-aware linter keeps the cost and maintenance burden of proving that
arbitrary module replacement is safe. One attempted replacement drove `tsgolint`
to roughly 32 GiB of anonymous RSS before the kernel killed it.

Restarting the backend whenever a file is saved was rejected. A save is not an
operator decision. An automatic restart can disconnect the wall. It can also
destroy a held board's only copy without giving the operator a chance to resolve
it.

## Consequences

This ADR supersedes only the hot-reload portion of ADR 0014. The canvas and CLI
still run TypeScript source directly with Bun. The browser bundle still has a
build step. Type-checking remains an explicit required gate.

Backend development has one lifecycle: start, run, stop. Source-freshness
diagnostics tell the operator to use the guarded restart path. The repository no
longer needs hot-reload fixtures or a special global lifetime model. Tests
exercise:

- Startup failure
- Held-board refusal
- Recovery
- Shutdown with and without connected browsers
- Pending-operation settlement
- Child and timer cleanup
- Signals
- Timeouts
- A second fresh application start
