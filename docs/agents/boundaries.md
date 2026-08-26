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
regressions. The interface counts profile snapshot entries and trie steps; exact-index updates,
tree-query steps, excluded-partition probes, identity-intersection comparisons, summary merges,
bucket tests, and every remaining hierarchy membership
predicate; bucket lookups, updates, and deletions; hierarchy path, subtree, summary, and index steps;
eligible visits; and peak retained buckets, profiles, exclusions, exact-index nodes and summaries,
query references, selected hierarchy parents, and total sweep-owned state. The total is sampled
during a query and again after insertion, so it never combines references from different lifetimes.
Cross-set peaks total both live indexes. `diagnoseSweepCompatibility` exercises the production
enumerator with exact semantic inputs, while `diagnoseMutableProfileSnapshots` proves that a runtime-mutable `ReadonlySet`
is read by exact current content rather than object identity. Tests do not infer this work from the
public comparison count. Product callers and the `check` command use `index.ts`; diagnostic
counters never enter schema-v1 report bytes.

The diagnostics root also exposes the production stable-order and obstacle-identity encoders for
exact storage and UTF-16 accounting checks. A stopped collision pass retains its completed work and
findings in the same accumulator that a normal return uses. Diagnostics therefore report partial
events and visits instead of resetting them when preprocessing reaches the ceiling.

The production inspector owns one 25,000,000-unit preprocessing budget across
model and pair sweeps. Its semantic input size is `I + E + H`: interval count,
total exact-exclusion entries across profiles, and total ancestor-target
entries. Retained sweep memory is `O(I + E + H)` references plus emitted
findings. Arbitrary identity UTF-16 code units count as logical work when read,
emitted during canonical encoding, compared, copied, or merged. Diagnostics expose the detailed mechanics and retained-state
peaks; product reports expose only the fixed limit and a closed limit finding
when the next logical unit is refused.

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
