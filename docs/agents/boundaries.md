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
inspection pipeline as `index.ts` and reports coarse semantic work for performance regressions:
input units, broad-phase events, eligible visits, expiry, bucket scans, exact-query and
hierarchy-node visits, path checks, and active bucket/profile/index peaks. The counters are
informative development evidence, not a promise about JavaScript engine primitives. Product callers
and the `check` command use `index.ts`; diagnostic counters never enter schema-v2 report bytes.

`lib/input-snapshot.ts` is the only boundary that accepts `readonly unknown[]`. It copies the fixed
inspection vocabulary into inert closed records without invoking caller-owned JavaScript. Decode,
model, and detector code accept only those snapshot records. The snapshot owner enforces the
1,000,000-unit input limit before semantic analysis. Eligible broad-phase pair delivery has a
separate 2,000,000-comparison limit; a stopped pair pass retains completed findings and comparisons.
The two limits are capacity safeguards, not a general runtime or asymptotic guarantee.

`src/shared/finding-raster/index.ts` owns the pure fixed mapping from a schema-v2 finding focus box
to PNG scale and dimensions. Both the browser exporter and manifest validator use it. The CLI-side
`src/cli/finding-rendering/index.ts` owns the sole manifest schema, finding digest and file naming,
PNG validation, and ordered file-set assembly. Browser messaging and vault reads remain adapters;
neither module owns a second geometry or bounds calculation.

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

There are exactly two test owners:

- `src/<area>/<module>/tests/` owns contract tests and private test support for one module.
- `tests/system/` owns cross-module repository, package, process, browser, and full-product tests.

Test-owned source may import support only from the same owner. It imports product behavior through
module-root entrypoint files, never an implementation subfolder. Product source, scripts, and tools
never import test-owned source. Bun-discoverable tests outside the two owners are refused.

All JavaScript-like source inside either test owner is TypeScript. Oxlint limits every authored
TypeScript source file in both owners to 500 physical lines. Put large test data in a named
non-TypeScript fixture instead of bypassing the limit.

Oxlint also rejects generic `core`, `utils`, `misc`, `migration`, and `compatibility` buckets. Name
the module for the behavior it owns.

## Vendor-owned data

When a dependency owns a data structure and publishes its TypeScript type, that exported type is
authoritative. Derive every local view of the structure from the vendor type with type aliases and
operations such as `Extract`, `Pick`, `Omit`, `Partial`, and intersections. Do not redeclare the
vendor's fields in a local interface, transport type, or lookalike base type. Copying a vendor type
does not insulate Archboard from dependency changes. It prevents the compiler from naming the code
that an upgrade made incompatible.

Local additions stay visibly local. Attach Archboard metadata by intersecting it with the derived
vendor type rather than copying the vendor fields into a larger interface. If an input spelling or
internal model genuinely differs from the vendor structure, give it its own domain name and convert
it through one adapter at a named seam. The different model must not masquerade as the vendor type
or flow past that adapter without conversion.

Prefer a vendor's runtime schema when it publishes one. When it publishes only TypeScript types, a
handwritten runtime parser is allowed where untrusted data enters, but its accepted and produced
values must have a compile-time conformance check against the vendor type. Infer local TypeScript
types from local runtime schemas instead of maintaining a second handwritten type beside them.

If a dependency publishes no usable type, keep one local definition at one module interface. Record
why the vendor cannot be the source, pin the external version or format it describes, and enforce
the contract with the narrowest stable runtime or fixture test available. Recheck that exception on
every dependency upgrade. Convenience, shorter imports, and avoiding upgrade errors are not valid
exceptions.

Enforce this rule with type checks, lint, or a repository-policy test whenever the relationship is
machine-observable. An upgrade should fail at type-check time at each incompatible assumption.
TASK-134 tracks the existing handwritten Excalidraw element types; they are migration debt, not a
precedent or waiver.

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

Run `bun run lint` for code and boundary lint. Run `bun run check` for lint, formatting, type
checking, and all four native test lanes. `bun run fix` applies safe Oxlint fixes, formats the
repository, then validates the distributable skills.
