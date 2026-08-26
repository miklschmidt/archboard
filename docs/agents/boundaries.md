# Agent module map

Domain terms live in `CONTEXT.md`. This file defines Archboard's target source layout, module
interfaces, and dependency directions. The current tree predates this map. Oxlint reports the old
locations as migration work rather than treating them as exceptions.

## Directory shape

Every implementation module lives one level below a named area:

```text
src/<area>/<module>/
  index.ts          # one public entrypoint
  client.ts         # another public entrypoint, when callers need it
  lib/              # private implementation
  tests/            # tests and their private fixtures
```

The allowed areas are `cli`, `domain`, `privileged`, `runtime`, `server`, `shared`,
`transformers`, and `ui`. Keep modules flat. A module cannot contain another module.

The files at a module root are its interface. A module may expose several small entrypoints. Do
not hide a large implementation behind one catch-all barrel. Files in any subfolder are private,
regardless of whether the folder is named `lib`, `tests`, or something else.

`src/runtime/board-inspection/diagnostics.ts` is a pure development entrypoint. It runs the same
inspection pipeline as `index.ts` and reports deterministic preprocessing work for performance
regressions. Its bucket counters count active-bucket iteration and exact-string index operations;
tests do not infer either from the public comparison count. Product callers and the `check` command
use `index.ts`; diagnostic counters never enter schema-v1 report bytes.

Root `src/` files are thin process entrypoints only. The existing entrypoints are `src/bin.ts`,
`src/server.ts`, and `src/dev-canvas.ts`. Do not add implementation to these files.

Browser code belongs under `src/ui/<module>`, not under a separate legacy frontend tree. Build host
files can stay outside `src/`, but UI implementation follows the same module rules as server code.

## Import rules

Code outside a module imports only files at that module's root. Files inside one module may import
their own private implementation freely. A module that depends on another module must cross one of
the dependency's root entrypoints.

Tests follow the same interface as production callers. A file under a module's `tests/` folder may
import that folder's fixtures, but it may not import its own module's implementation or another
module's implementation. Non-test code may not import any `tests/` folder. Cycles are errors.

Oxlint also rejects generic `core`, `utils`, `misc`, `migration`, and `compatibility` buckets. Name
the module for the behavior it owns.

## Area directions

These directions keep transport and I/O details out of domain modules:

- `shared` depends on no other Archboard area.
- `domain` depends on `shared` and other domain modules.
- `transformers` depends on `shared`, `domain`, and other transformer modules.
- `privileged` depends on `shared`, `domain`, `transformers`, and other privileged modules.
- `server` depends on `shared`, `domain`, `transformers`, `privileged`, `runtime`, and other server
  modules. It never imports CLI or UI code.
- `runtime` depends on server, privileged, domain, transformer, shared, and other runtime modules.
  It never imports CLI or UI code.
- `cli` depends on runtime, domain, transformers, shared, and other CLI modules. It never imports
  server implementation, privileged adapters, or UI code.
- `ui` depends on shared, domain, transformers, and other UI modules. It never imports CLI, server,
  runtime, or privileged code.

These are dependency permissions, not permission to deep-import. Every allowed cross-module import
still goes through a root entrypoint.

## Validation

Run `bun run lint` to validate distributable skill frontmatter and Markdown tables before the code
lint. Run `bun run check` for lint, formatting, type checking, and the existing test suite. `bun run
fix` applies safe oxlint fixes, formats the repository, then validates the distributable skills.
