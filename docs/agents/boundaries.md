# Agent module map

Domain terms live in `CONTEXT.md`. This file defines Archboard's target source layout, module
interfaces, and dependency directions. The current tree predates this map. Oxlint reports the old
locations as migration work rather than treating them as exceptions.

Source is moving from modules under `src/<area>/<module>` to workspace packages under
`packages/<name>` (TASK-500, `docs/design/package-map.md`). A module that has not moved keeps the
module rules. A package follows [Packages](#packages). The two sets of rules run side by side until
the last module has moved.

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
and the `check` command use `index.ts`; diagnostic counters never enter schema-v3 report bytes.

`lib/input-snapshot.ts` is the only boundary that accepts `readonly unknown[]`. It copies the fixed
inspection vocabulary into inert closed records without invoking caller-owned JavaScript. Decode,
model, and detector code accept only those snapshot records. The snapshot owner enforces the
1,000,000-unit input limit before semantic analysis. Eligible broad-phase pair delivery has a
separate 2,000,000-comparison limit; a stopped pair pass retains completed findings and comparisons.
The two limits are capacity safeguards, not a general runtime or asymptotic guarantee.

`src/shared/finding-raster/index.ts` owns the pure fixed mapping from a schema-v3 finding focus box
to PNG scale and dimensions. Both the browser exporter and manifest validator use it. The CLI-side
`src/cli/finding-rendering/index.ts` owns the sole manifest schema, finding digest and file naming,
PNG validation, and ordered file-set assembly. Browser messaging and vault reads remain adapters;
neither module owns a second geometry or bounds calculation.

Root `src/` files are thin process entrypoints only. The existing entrypoints are `src/bin.ts`,
and `src/server.ts`. Do not add implementation to these files.

Browser code belongs under `src/ui/<module>`, not under a separate legacy frontend tree. Build host
files can stay outside `src/`, but UI implementation follows the same module rules as server code.
For frontend concern placement, naming, and React ownership, read [frontend.md](frontend.md).

## Import rules

Code outside a module imports only files at that module's root. Files inside one module may import
their own private implementation freely. A module that depends on another module must cross one of
the dependency's root entrypoints.

Tests follow the same interface as production callers. A file under a module's `tests/` folder may
import that folder's fixtures, but it may not import its own module's implementation or another
module's implementation. Non-test code may not import any `tests/` folder. Cycles are errors.

There are exactly three test owners:

- `src/<area>/<module>/tests/` owns contract tests and private test support for one module.
- `packages/<name>/tests/` owns the internal tests of one package. See [Packages](#packages).
- `tests/system/` owns cross-module repository, package, process, browser, and full-product tests.

Test-owned source may import support only from the same owner, and the preload's
real-time declaration (`tests/system/repository-policy/support/test-wall-clock.ts`),
which every owner may use. It imports product behavior through
module-root entrypoint files, never an implementation subfolder. A package's own tests are the
exception. Product source, scripts, and tools
never import test-owned source. Bun-discoverable tests outside the three owners are refused.

All JavaScript-like source inside any test owner is TypeScript. The pre-task
500-physical-line test limit remains outside the UI. TASK-150 applies the approved
600-physical-line limit to all authored UI source, including tests, comments and
blank lines. Put large test data in a named non-TypeScript fixture instead.

Local imports use `@/` aliases, including same-module imports, re-exports and
dynamic/type imports. The private-module and area rules still apply, and
JavaScript source is rejected. This holds for every authored source file
(TASK-151), not only `src/ui`. The alias resolves into `src/` alone, so the few
sibling imports in `scripts/` and `tools/` stay relative and say so on the line. A file in a
package imports its own package relatively, as [Packages](#packages) says.

Oxlint also rejects generic `core`, `utils`, `misc`, `migration`, and `compatibility` buckets. Name
the module for the behavior it owns.

## Packages

A package owns one behavior. It lives in `packages/<name>/` and is listed by the `workspaces` field
of the root `package.json`. `bun install` links it into `node_modules` as `@archboard/<name>`.

```text
packages/<name>/
  package.json      # name, private, and `exports`: the whole interface
  src/
    types.ts        # only for types that more than one area uses
    <area>/<role>/  # areas: shared, runtime, server, ui. Roles: constants, rules, store, ...
  tests/            # internal tests, in folders that follow the areas
```

A package has no `lib/` folder and no `index.ts` barrel. Name the role of a folder, such as
`constants`, `schemas`, `rules` or `operations`, and let a folder that grows past about 12 files
split by behavior.

- **`exports` is the interface.** Each value is a path to a source file. There is no build step, no
  wildcard pattern and no condition object. Import `@archboard/<name>`, or
  `@archboard/<name>/<subpath>` for a subpath that `exports` names. TypeScript, Bun and Vite resolve
  it through the workspace link, so no path alias exists for a package. A file that `exports` does
  not name is private.
- **Another package, module or script imports only exported files.** Oxlint refuses a subpath that
  `exports` does not name. It also refuses a relative path that reaches a private file of another
  package.
- **Inside a package, imports use `#`.** The `package.json` of each package declares
  `"imports": { "#*": "./src/*", "#tests/*": "./tests/*" }`. Write `#shared/constants/timing.ts`
  for a file of `src/` and `#tests/support.ts` for a file of `tests/`. Spell the extension, because
  TypeScript does not add one to an `imports` target. A `#` specifier resolves from the nearest
  `package.json`, so it can never reach another package. The `@/` alias points into `src/`, which is
  outside every package. A relative import is refused everywhere.
- **The area directions hold inside a package.** The folders under `src/` are areas, so `ui` never
  imports `runtime` or `server` of the same package. The direction is judged by the area folder of
  the imported file, so it also holds across packages and between a package and a module. A test
  in `tests/<area>/` counts for that area.
- **A package test may import any file of its own package.** It imports only the exports of another
  package. It never imports the support of another test owner.
- **Production code never imports a `tests/` folder.** It never imports a `./testing` export of a
  package either. A `./testing` export holds a fixture that tests of two packages share. Its file
  lives in `src/`, and only a test may import it.

The first package is `timing` (`@archboard/timing`). Its `.` export holds every product duration.
Its `./voice` export holds the voice motion durations.

The second is `diagnostics` (`@archboard/diagnostics`). Its `./logger` export is the process logger
and is the only Node-bound file, in `runtime/`. The `./errno`, `./thrown-error` and
`./unknown-record` exports read a caught value without Node and are safe for the browser. The two
`errorMessage` functions differ on purpose: `./errno` says `unknown error` for a value that is no
Error or string, and `./thrown-error` stringifies it.

The third is `process` (`@archboard/process`). It owns a child process group and ends it, and every
file sits in `runtime/processes/`. `./observation` reads the process table. `./group` and
`./git-group-termination` signal a group and end the group of a Git command. `./git-owner` is the
script that a Git command runs under, and callers find it with `import.meta.resolve`.
`./codex-group` holds the Codex process-group operations, and `./group-cleanup` is their
TERM-then-KILL escalation. The cleanup takes its error type from the caller, so the package does
not import `codex-app-server`.

The fourth is `workspace` (`@archboard/workspace`). It knows where a vault, a checkout and the state
directory are. `./repositories` and `./configurable-languages` are in `shared/schemas/` and safe for
the browser, with no Node import. The rest is Node-bound. `./language-servers` holds the validation
of a server command, which uses `node:path`, so the browser never imports it. `./repo-registry`,
`./atomic-write` and `./state-dir` read and write the registry and the state directory.
`./git`, `./vault-finder` and `./source-checkout` find a repository, a vault and the checkout whose
source runs. `./repository-listing` is the answer of `GET /api/repositories`. `source-checkout`
finds the checkout by walking up to the nearest directory that is an archboard checkout, so the
depth of the file decides nothing. `module-paths` is not here: the server derives its `src/` from
its own depth.

The fifth is `code-binding` (`@archboard/code-binding`). It knows what a node's code binding is and
where its path lives in a checkout. Everything in `shared/` is safe for the browser, with no Node
import. `./code-binding` holds the binding, anchor and document-reference schemas. `board` will
import them and the resolver parses with `CodeBindingSchema`, so they stay here. `./code-target-open`
is the wire contract of the open route and `./opener-settings` the contract of the opener settings.
`./binding-files` and `./opener-executable` are pure rules. The rest is Node-bound, in `runtime/`.
`./checkout-snapshot` captures the registered checkouts and the paths of some bindings once, then
resolves a binding or a repository against that snapshot alone. `./binding-resolver` holds the
result types and the resolution rules that the snapshot feeds. `./vault-checkout` finds the
checkout that holds a vault and the checkouts a reader of that vault resolves identities in.
`./code-target-link` chooses the URL a card opens.

The sixth is `codex-app-server` (`@archboard/codex-app-server`). It is one private Codex app-server
session over stdio. It holds the shared files, the wire protocol, the process owner, the stdio
transport and the session. `codex-semantic-context` joins it later, with the board package. Every
export in `shared/` is safe for the browser, with no Node import. The exports in `runtime/` are
runtime-only by policy: the browser imports none of them, though a file such as `./session-contract`
holds only Zod schemas.

- `shared/`: `./app-server-contract` is the authored wrapper over the generated protocol types. The
  generated tree is ignored by git. It lives in `src/shared/protocol/generated`, and
  `scripts/generate-codex-app-server-contract.ts` writes it on `bun install` and creates its parent
  directories. The wrapper imports it with `#` and only as types, and no other file of the package or
  outside it does. `./app-server-capacity` holds the connection capacity constants, and its test is
  opt-in (`bun run test:opt-in:capacity`). `./workbench-identity` holds the identity brands, the
  correlations and the ledger.
- `runtime/protocol/` and `runtime/schemas/` are the Zod schemas and decoders of the wire.
  `./protocol-decoder` decodes each message and `./protocol-version` pins the Codex version. Outside
  tests build their notification fixtures with the decoder. The method lists, the request and
  response schemas and the thread, item and core schemas are private. The package exported sixteen
  subpaths before the transport and session moved in, and nine of them are private files now.
  `./session-contract` is where code outside the package validates: the reply to a server request,
  the supported login parameters, the queue parameters and a queued submission. It also names
  `SessionUserInput`, the type of a user input that Codex reports. `./session-responses` holds the decoded
  results of a session request, such as `SessionThread`.
- `runtime/clients/` is the stdio transport. `./transport` creates it, `./transport-types` holds the
  types of its requests, notifications and server requests, and `./transport-errors` holds its error
  classes. `runtime/operations/` settles a request, routes a reverse request and adopts the identities
  of a response. `runtime/protocol/wire.ts` decodes the JSON frames.
- `runtime/services/` holds the session. `./session` creates it and `./session-api` holds its
  interface, its options, its errors and its control symbol. The session's storage proof is in
  `runtime/store/`. The transport's write-capacity test is opt-in too
  (`bun run test:opt-in:capacity`).
- `runtime/processes/` owns the `codex app-server` child. `./process` creates it and reports its
  lifecycle. `runtime/store/` prepares and locks the private Codex home. `runtime/services/`
  also holds the child's environment, its diagnostics buffer and the executable check.
  `./executable` finds the Codex executable of the checkout whose source runs, through
  `SOURCE_CHECKOUT` of `workspace`, and refuses a global one or one of another checkout.
- A test that needs the process owner's injected dependencies imports
  `runtime/processes/process.ts` from inside the package. No test outside the package does, so the
  package has no `./testing` export.

The seventh is `board` (`@archboard/board`). It is the board document and its policy. This first
half holds the code that the browser and the server both run, so every file is in `shared/` and
imports no Node module. The runtime half, the store and the lock, follows in the next task and
will bring the package its own `runtime/` area. The `shared/` folder follows the role names:

- `schemas/` are the data shapes. `./document` is the board aggregate and the variant address
  functions, and `./content` is what one variant holds: nodes, relationships and drill-downs.
  `./views`, `./walkthrough`, `./vocabulary` and `./primitives` are the parts it is built from.
  `./reconciliation` is the standing of a variant against its predecessor, `./draft-ref` reads the
  code a draft is read against and `./policy` is the semantic policy and the vault check. The
  binding, anchor and document-reference schemas are not here. They stay in `code-binding`.
- `protocol/` are the wire contracts. `./board-input` is what an agent may say, `./render-reply`
  what a render answers, `./board-listing` the answer of the listing route, `./board-move` the move
  to another vault, `./resolution-input` the choice of a side and `./pane-context` what a pane
  reports about its reading.
- `rules/` are pure functions. `rules/ids.ts` is the one place that mints an id, and `./ids` is its
  export. `rules/coherence/` holds the checks a shape cannot state, and `./parse-board` reads an
  untrusted value as a board. `rules/compare/` compares two variants, their interfaces and the
  drawing of a proposal against current. `rules/reconcile/` brings a proposal forward when its
  predecessor moves. `rules/inspect/` reads one container or one group off a variant. `./scope`,
  `./flow-steps` and `./positions` stand beside them.

The package has no barrel. In the old `index.ts`, the names of the document, the input, the render
reply, the reconciliation and the comparison came from one import. An importer now names the file
that defines each name. `./integrity`, `./positions`, `./primitives` and `./reconcile-candidate`
are exported only because the store, which has not moved yet, imports them. They become private
when the store joins the package.

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

Run `bun run lint` for code and boundary lint. Run `bun run check` for lint,
formatting, type checking, and all four normal native test lanes. Explicit
`test:opt-in:*` package commands own capacity, test tooling, unsupported
topologies, and browser performance outside that normal gate. `bun run fix`
applies safe Oxlint fixes and formats the repository.
