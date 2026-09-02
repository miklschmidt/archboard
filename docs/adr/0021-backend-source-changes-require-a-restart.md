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

Runtime state has ordinary process lifetime. Modules may own state directly,
or the canvas application may own it when construction and teardown need an
explicit boundary. A restart disconnects live browser sessions and clears
process-only state. Persisted boards remain in their notes under ADR 0015. A
held board is the exception because its refused edits exist only in the
running process, so the operator must resolve every hold before restarting.

Frontend Vite HMR may remain. It belongs to the browser bundle process and does
not replace modules inside the Archboard server. Backend and frontend
development commands must keep that distinction visible.

Generated Codex contracts are unrelated to source scanning. Ordinary product
type-checking imports the exact generated types through their module root and
reports incompatible assumptions through TypeScript. Fingerprints, mirror
detectors, alias corpora, Babel parsing, custom TypeScript AST walking, and
type-aware lint policies are not substitutes for that dependency.

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
diagnostics tell the operator to restart. Tests exercise startup, shutdown,
state construction, and cleanup instead of module replacement. The repository
no longer needs hot-reload fixtures or a special global lifetime model.
