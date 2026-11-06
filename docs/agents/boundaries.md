# Source layout and boundaries

Domain terms live in `CONTEXT.md`. This file defines where Archboard source lives, which
folder can import which, and who owns a test. Oxlint enforces it (`bun run lint`).
The decision is [ADR 0055](../adr/0055-packages-own-behavior-and-apps-compose-it.md).
[ADR 0075](../adr/0075-each-area-groups-code-by-behavior-first.md) groups the code of each area by behavior first.
[ADR 0058](../adr/0058-an-interface-is-the-few-operations-its-callers-need.md) decides how wide a package interface may be.
`tests/system/repository-policy/package-graph.test.ts` declares the package layers and refuses upward imports and cycles.

## Layout

Product source lives in workspaces. The root `package.json` lists `packages/*` and `apps/*` in
`workspaces`, and `bun install` links each one into `node_modules`.

```text
packages/<name>/   # a library that owns one behavior. See Packages.
apps/<name>/       # a process entry that nothing imports: cli, server, web, workbench-example. See Apps.
crates/<crate>/    # a Rust crate of the root Cargo workspace (ADR 0059)
crates/vendor/     # third-party crates the core builds in, no workspace members (crates/vendor/README.md)
tests/system/      # repository, process, browser and full-product tests across owners
scripts/, tools/   # repository scripts and the Oxlint plugin
vite.config.ts     # the build host of the browser app
```

There is no top-level `src/` or `frontend/`, and no `@/` alias. Lint refuses a source file in
either root and an import that starts with `@/`.
`tests/system/repository-policy/workspace-layout.test.ts` holds the end state.

The named areas below `src/` are `shared`, `runtime`, `server`, `ui`, and `cli` in the CLI app.
A package can also hold files and folders outside these areas, such as `src/types.ts` or `src/types/`.
The areas stay the first folder below `src/`, because they say where code runs. See [Area directions](#area-directions).
Inside an area, code is grouped by behavior first.

A **behavior folder** holds every file of one job in one area. A sub-job is a sub-folder.
Name it for the job. It is never a role name, an area name, a generic bucket name, or `legacy`.

A **role folder** is always the last folder of a path, and it holds files only. These are the roles:

```text
api clients components constants hooks lifecycle middleware operations processes
projections protocol routes rules schemas services sockets state store wiring workers
```

The path form is `src/<area>/<behavior>[/<behavior>…]/<role>/<file>`.

- `src/<area>/<role>/<file>` with no behavior folder is allowed, for code that belongs to the area as a whole.
  Examples are `timing`, `diagnostics`, `process` and `shared/rules/ids.ts`.
- `src/<area>/api/` stays directly under the area. It is the area's interface, and
  `package-api.test.ts` holds the `exports` to it.
- Tests mirror their source under `tests/<area>/…`. `tests/<area>/support/` stays.
- Generated and ignored trees keep their tool's shape, such as `shared/protocol/generated/**`.
- The `#*` aliases do not change. Every `package.json` maps `"#*": "./src/*"`.
- A module with parts binds its behavior folder (TASK-582).

`tests/system/repository-policy/workspace-layout.test.ts` holds the rule for every tracked TypeScript
file below an area: exactly one role folder, the last folder, and no folder named after an area.
Many trees still put the role first, and they move one commit at a time (TASK-582.03).
Its ratchet, `ROLE_FIRST_TREES`, lists the trees that still break the rule. The test skips them, and
it fails when a listed tree breaks it no more, so each move commit removes its trees from the list.
Until the last move, the lint rules accept both layouts. `scripts/move-source.ts` moves the files of a
reviewed manifest. It rewrites the imports and repository paths and rebinds the vault in the same run.
For frontend concern placement, naming, and React ownership, read [frontend.md](frontend.md).

The entries are `apps/cli/src/bin.ts`, `apps/server/src/server.ts`, `apps/web/src/main.tsx`,
and the server and browser entries of `apps/workbench-example`.
Do not add implementation to them.

## Import rules

- **Inside a package or an app, imports use `#`.** The `package.json` of each declares
  `"imports": { "#*": "./src/*", "#tests/*": "./tests/*" }`. Re-exports and dynamic and type
  imports follow the same rule. Spell out the file extension. Relative imports and JavaScript
  source are refused within these workspaces. Sibling imports in `scripts/` and `tools/` stay
  relative and state the exception on the line. Scripts, tools and root tests have no `#` imports.
- **Another package is reached only through its `exports`.** See [Packages](#packages).
- **Nothing imports an app.** See [Apps](#apps).
- **Production code never imports a `tests/` folder.** Cycles are errors.

CSS follows the same package and area boundaries.
`bunx vp run lint:css` reads authored stylesheets under `packages/` and `apps/`, including `assets/`.
It uses Lightning CSS to read imports and URLs, then applies the TypeScript import policy.
Tailwind `@reference`, `@plugin`, and `@config` file references follow that policy too.
Local stylesheet imports use `#`, and references to another package use its declared exports.
Asset URLs use declared package exports.
A `url(#mask)` reference addresses a fragment in the document.
Network and data URLs do not name workspace files.

Tailwind `@source` paths are filesystem scan inputs, not imports.
They remain relative to the stylesheet and select the files whose class names Tailwind reads.
The package graph includes CSS imports and asset URLs when it tests layers, cycles, and browser dependencies.

Tests use these owner layouts:

- `packages/<name>/tests/` owns the internal tests of one package. See [Packages](#packages).
- `apps/<name>/tests/` owns the internal tests of one app. See [Apps](#apps).
- `tests/system/` owns cross-package repository, process, browser, and full-product tests. It
  imports only the exports of a package.

Test-owned source imports support only from the same owner, and from the preload's real-time
declaration (`tests/system/repository-policy/support/test-wall-clock.ts`), which every owner can use.
A package or app test can import the implementation files of its own owner. Product source,
scripts, and tools never import test-owned source. Bun-discoverable tests outside these owners
are refused.

All JavaScript-like source inside any test owner is TypeScript. Test files stay at or below 500
physical lines outside the UI. TASK-150 applies the approved 600-physical-line limit to all
authored UI source, including tests, comments and blank lines. Put large test data in a named
non-TypeScript fixture instead.

Oxlint also rejects generic `core`, `utils`, `misc`, `migration`, `compatibility` and `lib`
folders. Name the role of the folder, or the behavior it owns.

## Packages

A package owns one behavior. It lives in `packages/<name>/` and is listed by the `workspaces` field
of the root `package.json`. `bun install` links it into `node_modules` as `@archboard/<name>`.

```text
packages/<name>/
  package.json      # name, private, and `exports`: the whole interface
  src/
    types.ts        # only for types that more than one area uses
    <area>/<behavior>/<role>/  # areas: shared, runtime, server, ui. Roles: constants, rules, store, ...
    <area>/<role>/  # code of the area as a whole
    <area>/api/     # the interface files of an area, in a package that adopts the role
  tests/            # internal tests, in folders that follow the areas
```

A package has no `lib/` folder and no `index.ts` barrel. Name a behavior folder for its job and
a role folder for its role, such as `constants`, `schemas`, `rules` or `operations`. A role folder
holds files only. When it grows past about 12 files, split its behavior into sub-behaviors.

- **`exports` is the interface.** Each value names a source file under `src/` or a public asset under `assets/`. Inside the
  repository there is no build step, no wildcard pattern and no condition object. The npm build of
  `codex-realtime-voice` is the one exception, and it leaves the workspace `exports` as they are. Import `@archboard/<name>`, or
  `@archboard/<name>/<subpath>` for a subpath that `exports` names. TypeScript, Bun and Vite resolve
  it through the workspace link, so no path alias exists for a package. A file that `exports` does
  not name is private.
- **An interface is the few operations its callers need** (ADR 0058). Design it from the jobs that
  callers do. Measure it by everything a caller must learn: names, types, invariants, ordering,
  error modes and configuration. A public name needs a caller outside the package, but a caller is
  not enough. When callers import pieces of a package and connect them, move that assembly into the
  package as one operation, change the callers to use it, and make the pieces private. Do not hide
  the same width in one large file or behind one object.
- **Interface width has a recorded ceiling.** `tests/system/repository-policy/interface-width.test.ts`
  counts the names that the code entries of each package's `exports` export. It fails when a package
  exceeds its ceiling in `interface-width-ceilings.json` beside the test, and when that file does
  not list exactly the packages that exist. When a package gets narrower, lower its ceiling. Never
  raise a ceiling: design a deeper operation instead.
- **An `api/` folder is the package's interface over private implementation.** A package that
  adopts it points the `exports` of an area only into that area's `api/`. An api file re-exports
  by name (`export { a } from "#shared/rules/x.ts"`, `export type { T } from ...`, never `export *`)
  from the private files that define the names, and it holds no second definition. A name that no
  code outside the package imports stays private, and so does a piece that callers only connect.
  Private production files never import an api file, because the api files sit above them. `model`,
  `codex-app-server`, `code-binding` and `code-intel` adopt it for `shared/` and `runtime/`, `workspace` also for
  `server/`, `renderer` for `shared/`, `runtime/` and `ui/`, `code-opener` for `shared/`, `server/` and `ui/`, `walkthrough` for `shared/` and `runtime/`, `process` and `skills` for `runtime/`, `server-lifecycle` for `shared/` and `runtime/`, `codex-realtime-voice` and `workbench` for `shared/`, `runtime/`, `server/` and `ui/`, and `ui-kit` and `server-requests` for `ui/`. An export that is a file to run, not a module to import,
  would be the one exception, and the test would have to name it. No package has one now.
  `tests/system/repository-policy/package-api.test.ts` holds the three rules.
- **Another package, an app, a script or a test imports only exported files.** Oxlint refuses a subpath that
  `exports` does not name. It also refuses a relative path that reaches a private file of another
  package.
- **Inside a package, imports use `#`.** Write `#shared/constants/timing.ts` for a file of `src/`
  and `#tests/support.ts` for a file of `tests/`. Spell the extension, because TypeScript does not
  add one to an `imports` target. A `#` specifier resolves from the nearest `package.json`, so it
  can never reach another package.
- **The area directions hold inside a package.** The folders under `src/` are areas, so `ui` never
  imports `runtime` or `server` of the same package. The direction is judged by the area folder of
  the imported file, so it also holds across packages. A test in `tests/<area>/` counts for that
  area.
- **A package test can import any file of its own package.** It imports only the exports of another
  package. It never imports the support of another test owner.
- **Production code never imports a `tests/` folder.** It never imports a `./testing` export of a
  package either. A `./testing` export holds a fixture that tests of two packages share. Its file
  lives in `src/`, and only a test can import it.

The first package is `timing` (`@archboard/timing`). Its one `.` export holds every product duration,
grouped by the subsystem that owns it. Each owner has one frozen group in a file of its own, such as
`MODEL_LOCK_MS`, `CODEX_PROCESS_MS`, `SERVER_LIFECYCLE_MS` or `PANE_MS`, and each key has what it
pulls against written beside it. A caller imports its owner's group and reads a key of it. A
computation that callers would repeat from a group is one function of the package, such as the
Codex restart backoff `codexRestartDelayMs`. A duration with one owner and no siblings stays one
named constant. The six flat names that only the renderer imports, such as
`SEMANTIC_RASTER_JOB_TIMEOUT_MS`, stay until its rewrite lands.

The second is `diagnostics` (`@archboard/diagnostics`). Its `./logger` export is the process logger
and is the only Node-bound file, in `runtime/`. The `./errno`, `./thrown-error` and
`./unknown-record` exports read a caught value without Node and are safe for the browser. The two
`errorMessage` functions differ on purpose: `./errno` says `unknown error` for a value that is no
Error or string, and `./thrown-error` stringifies it. `errnoCode` of `./errno` is the one reader of
the `code` a thrown value carries. The package imports no other package, so a package that runs
outside Archboard can carry it.

The third is `process` (`@archboard/process`). It owns a child process group and ends it. Its implementation
sits in `runtime/processes/`. It adopts the `api/` role for `runtime/` and exposes 4 subpaths,
where it exposed 6 files. It imports only `timing` and `diagnostics`, so a package that runs
outside Archboard can carry it. `./observation` reads the process table. `./git` runs one Git
command, `git`, as the leader of a detached group of its own, with bounded output, a timeout and
cancellation, and ends the group with a stop and then a kill. One small `/bin/sh` guard per parent
process (`git-guard.ts`) reads the groups in flight from a pipe. It kills them when the parent dies
and the pipe closes. An exited leader does not end ownership of its group: the kernel keeps a group's
number from new processes while the group has a member. Every failure is a `GitCommandError`
that names its kind, and a non-zero exit is the kind `exit`. The group operations it uses stay
private. `./codex-group` carries the Codex process-group operations and
their TERM-then-KILL escalation. The cleanup takes its error type from the caller, so the package
does not import `codex-app-server`.

The fourth is `workspace` (`@archboard/workspace`). It knows where a vault, a checkout and the state
directory are. It adopts the `api/` role for `shared/`, `runtime/` and `server/` and exposes 8
subpaths, where it exposed 10 files. `./repositories` and `./languages` are in `shared/api/` and safe
for the browser, with no Node import: the listing schemas of the navigator, and the languages that an
agent can configure a server for. The rest is Node-bound. `./checkouts` carries what is known of
checkouts: the Git lookups, the repository registry and the validation of a language server
command, which uses `node:path`, so the browser never imports it. Its `gitCheckoutOfVault` asks
Git synchronously for the checkout that holds a vault, its root and identity, for the vault check
that every open canvas reads and that cannot wait for the asynchronous lookups. The registry's
`repositoryOfVault` is exported as `registeredRepositoryOfVault`, because `./repository-listing`
defines a different `repositoryOfVault`, the one that the server projection answers with.
`./vault` finds a vault as ADR 0049 says. `findVault` only finds it, for a command that asks
where it is without registering anything. `findAndRegisterVault` is what a command does before it
starts: it finds the vault, registers the checkout or untracked vault that holds it when the registry
does not know it, and answers with the vault, what it registered, or why the registry could not be
written, which does not refuse the command. The CLI words its line on stderr from that answer.
`./source-checkout` finds the checkout whose source runs, and
`./atomic-write` and `./state-dir` write files durably and name the state directory: `writeFileAtomic`
with `exclusive: true` refuses a file that is there instead of replacing it.
`./repository-listing` is the answer of `GET /api/repositories`, in `server/api/`. `source-checkout`
finds the checkout by walking up to the nearest directory that is an archboard checkout, so the
depth of the file decides nothing, and `bin.ts` loads it lazily, so a command that hands itself to
another checkout loads nothing else first. `module-paths` is not here: it moved into `workbench`, which
derives the checkout root from `SOURCE_CHECKOUT`.

The fifth is `code-binding` (`@archboard/code-binding`). It knows what a node's code binding is and
where its path lives in a checkout. It adopts the `api/` role for `shared/` and `runtime/` and
exposes 2 subpaths with 18 names, where it exposed 9 files. Everything in `shared/api/` is safe for
the browser, with no Node import. `./bindings` holds the binding, anchor and document-reference
schemas and the files a binding names. `model` imports them and the resolver parses with
`CodeBindingSchema`, so they stay here. `./resolution` is Node-bound, in `runtime/api/`. It captures
the registered checkouts and the paths of some bindings once, then resolves a binding or a
repository against that snapshot alone. It also carries the result types and the resolution rules
that the snapshot feeds. It finds the checkout that holds a vault, and the checkouts in which a
reader of that vault resolves identities. The resolver names its own failure codes, and the open contract in
`code-opener` holds each of them. The wire contract of the open, the opener settings and the GitHub
link of a binding are not here: only the code opener reads them, so they live in `code-opener`.

The sixth is `codex-app-server` (`@archboard/codex-app-server`). It owns one private Codex app-server session over stdio.
It holds protocol contracts, the process owner, the stdio transport, and the session.
It imports the lower process, diagnostics, and timing packages.
It adopts the `api/` role for `shared/` and `runtime/` and exposes six subpaths.

The two shared entries are safe for the browser. The four runtime entries run only in Bun.
Archboard owns captured architecture context in `workbench` through its `./semantic-context` entry.

- `shared/api/`: `./contract` holds the authored wrapper over the generated protocol types: the
  request methods, the status types, the approval decisions and their schemas, and the connection
  capacity constants. The generated tree is ignored by git. It lives in
  `src/shared/protocol/generated`, and `scripts/generate-codex-app-server-contract.ts` writes it on
  `bun install` and creates its parent directories. The wrapper imports it with `#` and only as
  types, and no other file of the package or outside it does. The capacity test is opt-in
  (`bunx vp run test:opt-in:capacity`). `./identity` holds the identity brands, the authorities, the
  correlations and the ledger.
- `./protocol` is the pinned Codex version and the decode of a server notification. Outside tests
  build their notification fixtures with the decoder. The method lists, the request and response
  schemas and the thread, item and core schemas of `runtime/protocol/` and `runtime/schemas/` stay
  private.
- `./transport` is the stdio transport of `runtime/transport/clients/`: it creates the transport and carries
  the types of its requests, notifications and server requests and its error classes.
  `runtime/transport/operations/` settles a request and routes a reverse request, and
  `runtime/session/operations/` adopts the identities of a response. `runtime/protocol/wire.ts` decodes the JSON frames. The write-capacity test of the
  transport is opt-in too (`bunx vp run test:opt-in:capacity`).
- `./session` is the session of `runtime/session/services/`. It creates the session and carries its
  interface, its options, its errors and its control symbol. It also carries the decoded results of
  a session request, such as `SessionThread`, and the schemas where code outside the package
  validates: the reply to a server request, the supported login parameters and a queued
  submission. The session's storage proof is in `runtime/session/store/`.
- `./process` owns the `codex app-server` child of `runtime/processes/`: it creates the process and
  reports its lifecycle. It also carries the executable check, which finds the Codex executable of
  the checkout whose source runs, through `SOURCE_CHECKOUT` of `workspace`, and refuses a global one
  or one of another checkout. `runtime/store/` prepares and locks the private Codex home, and
  `runtime/services/` holds the child's environment and its diagnostics buffer.
- A test that needs the process owner's injected dependencies imports
  `runtime/processes/process.ts` from inside the package. No test outside the package does, so the
  package has no `./testing` export.

The seventh is `model` (`@archboard/model`).
It owns the canonical model contract and its coherent reader and durable writer.
`shared/` is safe for the browser and imports no Node module.
`runtime/` runs only in Bun.
Both areas expose named operations through `api/` files.
The package's `exports` declares the public subpaths.

The shared interface separates these responsibilities:

- `./contract` exposes canonical read, edit, claim, recovery, render, history, import, and initialization schemas.
  Derive local types from those schemas and operation results.
- `./migration` exposes original inventory and explicit mapping contracts.
  Legacy document schemas remain available for migration and exact retained originals.
  They provide no live writer.
- `./content` exposes semantic content and the shared `modelContent`, `projectModel`, and `projectFlow` projections.
  Browser and backend consumers use those same projections.
  A projection is derived renderer input and owns no authored architecture.
- `./pane-context` exposes exact canonical captures and `ArchitecturePaneReadingSchema`.
  The existing pane router carries complete readings through `pane_model`.
- Policy, flow, comparison, interface, reconciliation, and render-reply entries retain their shared semantic rules.
  `./ids` remains the only allocator of short IDs.
  Namespaces preserve imported identity provenance.

Private `shared/canonical-contracts/schemas/` owns the canonical model, flow and operation contracts.
Private `shared/schemas/` owns the other persisted shapes.
Private `shared/rules/` owns identity, scope, and projection.
Coherence, comparison, inspection, legacy inventory, and reconciliation each own `shared/<behavior>/rules/`.
Reuse those rules for materialized proposal content and retained readings.
Binding, anchor, and document-reference schemas remain in `code-binding`.

The runtime interface owns these operations:

- `./store-read` reads complete canonical models, checkpoints, claims, publication evidence, and legacy inventories.
  It watches coherent model changes and discovers canonically bound vaults.
  Legacy decoding serves explicit migration and retained originals only.
- `./store-write` owns initialization, subject claims and release, human take-back, edits, recovery, retention, publication, portable transfer, and migration.
  One edit can affect modules, outgoing relationships, independent flows, proposals, and walkthroughs.
  The caller submits one complete intent rather than assembling private transitions.
- `./vault-policy` reads configuration and semantic diagnostics.
  `./lock` exposes shared lease inspection and process-memory cleanup.
  Canonical claims belong to the model operations, not a live lock API of legacy boards.

Private `runtime/canonical/` owns coherent reads and complete durable operations.
Its behaviors are `read`, `edit`, `proposals`, `history`, `archive` (archive objects), and `installation` (installation journals and news).
Private `runtime/legacy-boards/` decodes and inventories legacy boards for explicit migration.
Private `runtime/lock/` owns short leases, and `runtime/check/` the model check.
Private `runtime/store/` owns current inputs, fingerprints, configuration, and legacy addresses.
Current files contain one model manifest, module definitions, flow collections, active compact proposals, and walkthrough instructions.
Completed states and exact originals remain in the existing independent Git archive.
No current file embeds a legacy board family or historical snapshot array.

All operations cross the existing recovery boundary.
The writer checks the complete expected revision and affected claim closure.
It prepares signed history before installing files through `@archboard/workspace/atomic-write`.
A pending journal blocks ordinary reads with `RECOVERY_REQUIRED`.
Durable completion precedes change notifications.
Recovery preserves foreign edits and checks the original checkout context.

The retired `./commands` and `./store-move` entries expose no alternate live path.
Unmigrated vaults return `LEGACY_AUTHORITY` and require explicit inventory, mapping, preview, and authorized migration.
[ADR 0068](../adr/0068-one-live-canonical-model-and-consumer-path.md) records this transition pending parent acceptance.
The configured Git signer remains authoritative for checkpoint and synchronization commits.
Archive synchronization preserves ancestry without merging current models or selecting current architecture.

The eighth is `ui-kit` (`@archboard/ui-kit`). It holds the presentation parts that more than one UI
module draws with, in the `ui` area. It adopts the `api/` role for `ui/` and exposes 4 subpaths
with 37 names (TASK-529.03; before, 10 subpaths with 85 names). Every export is safe for the
browser. `ui/components/shadcn/` holds the official shadcn Base UI files with their `README.md`,
private and kept at the registry's bytes. `ui/components/` holds the package's own components and
one composite per family, which puts the family's parts on its root, and `dialog-parts/` holds the
parts that every dialog surface shares. `ui/state/` holds the frame clock and the fullscreen
presentation; `ui/rules/` and `ui/hooks/` hold the small helpers. The aliases in `components.json`
name `packages/ui-kit/src/ui/components/shadcn`, so the shadcn CLI writes there. It resolves these
paths from the repository root with no TypeScript path alias. Generated imports still need the
package-local `#` rewrite, and a new part reaches callers through its family's composite.

- `./components` is every component, one composite per job. A caller imports the family and
  reaches its parts on it: `Dialog` with `Dialog.Content`, `Dialog.Header`, `Dialog.Title`,
  `Dialog.Description`, `Dialog.Footer`, `Dialog.Trigger` and the shared
  `Dialog.Busy` (progress text), `Dialog.Error` (the host's failure) and `Dialog.Cancel` (the
  footer's dismissing action); `Field` with its label, description, content, set, legend and
  `Field.Issues`; and likewise `Select`, `Tabs`, `RadioGroup`, `ToggleGroup`, `InputGroup`,
  `DropdownMenu`, `Tooltip` (with `Tooltip.Provider`), `Alert`, `Resizable` (the panel group,
  with `Resizable.Panel` and `Resizable.Handle`) and `RepositoryName` (with
  `RepositoryName.GitHubMark`). The single components are `Button`, `IconButton`, `Checkbox`,
  `Input`, `Badge`, `Separator`, `Skeleton` and `Technical`, a value in the mono face. Beside them
  are `cn`, the class merger every component draws with, `buttonVariants` for an element that is
  not a button, `usesCommandKey`, the platform's modifier for shortcuts, `shownRepository`, the
  words a repository's name shows, and the `DialogError` shape that `Dialog.Error` shows.
- `./time` is the ticking clock hook and the short age and clock text. `./frame-clock` is the clock
  that moves what a pane draws over time, and the stepped clock that a renderer moves, which the
  page that renders a recording frame by frame drives. `./fullscreen-presentation` owns presenting
  one pane fullscreen.
- The pane chrome, what the shell puts in a pane's header, belongs to `apps/web`, its one owner.
- Tailwind finds class names by scanning source files. `apps/web/src/ui/theme/app.css` turns the scan of
  Vite's root off (`source(none)`), names `apps/web/src` and names `packages/*/src/ui/**/*` with `@source`, so the
  `ui` area of every package is scanned (a bare `packages/*/src/ui` matches nothing). `tsconfig.frontend.json`
  includes `packages/*/src/ui`.
- A component used only inside the package stays private. Delete a component with no caller.

The ninth is `server-requests` (`@archboard/server-requests`). It is the browser's one way of speaking
JSON to the Archboard server, and the browser side of the rule that every call names its vault
(ADR 0049). It has one file, `ui/clients/server-requests.ts`, and its `.` export is the one api
file, `ui/api/server-requests.ts`, with 4 names. `requestJson(url, { method, payload, signal })`
is one JSON request that throws the server's own reason when it refuses: GET unless it names a
method, with a JSON body when it carries a payload. `strictReply` takes the same request and
parses the reply against a success and a failure schema (`ReplySchema`). `inVault` names the vault
on a URL. The request options, the reply guards `isRecord` and `trustReply` stay private.

The tenth is `code-intel` (`@archboard/code-intel`). It compares canonical architectural claims with source evidence.
It owns checkout code facts and the code inspection algorithms. It also holds the history lens
over Git and the language servers that resolve a name. It adopts the `api/` role for `shared/` and `runtime/` and exposes 5
subpaths with 16 names, where code outside imported 7 module paths. It imports `model`,
`code-binding`, `workspace`, `diagnostics` and `timing`. The 2 files of
`shared/api/` are safe for the browser, with no Node import: the canvas imports them. The 3 files of
`runtime/api/` are Node-bound and run only in Bun.

- `./code-check` is the answer of the code check and the answer of the route that remembers it:
  `CodeCheckAnswer` and `RememberedFindings`, with their schemas. The schema is in
  `shared/protocol/code-check.ts`. `./history` is the answers of the locality and footprint routes,
  the start of a period and `HistoryRefusalCode`, the codes a history reading refuses with, from
  `shared/protocol/`. It also gives the label of a commit's
  attribution, from `shared/schemas/`. A part of an answer, such as a finding, a skip, a timing or a commit, has no
  public name. A reader names it by its place in the answer, such as
  `CodeCheckAnswer["findings"][number]`.
- `./code-check-run` owns the complete pass through `createCodeCheck().run`.
  It reads canonical models and selected proposals through the public reader.
  The existing language, infrastructure, relationship, and interface algorithms remain the analysis owners.
  Findings name model, state, stable subject, authored file, and complete revision.
  `checkCandidateCode` and `suggestHistoricalCommits` supply historical correction evidence.
  `./history-lens` exposes `readArchitectureLocality` and `readArchitectureFootprint` through those same local Git algorithms.
  `./history` owns `ArchitectureHistoryRequestSchema` and `ArchitectureHistoryResultSchema`.
  The selected canonical state remains separate from the analyzed source refs.
  These operations neither fetch nor retain source-code history.
  `./code-facts` exposes `symbolLine` for the existing code opener.
- The steps of a pass, behind, the code facts reader and the language servers have no api file. The
  code check opens the language servers through its own session. The package's tests reach the
  steps and the readings through `tests/runtime/support/code-check/pass.ts` and
  `tests/runtime/support/history-lens/lens.ts`.
- `runtime/operations/` holds the reading and judging: `code-facts/` has the language-agnostic
  facts, `modules/` for what a module exposes, and one folder for each language or format
  (`typescript/`, `python/`, `c/`, `csharp/`, `objc/`, `swift/`, `rust/`, `nix/`, `kubernetes/`, `compose/`,
  `terraform/`); `code-check/` has the pass, `claims/`, `evidence/` and `interfaces/`;
  `history-lens/` and `language-servers/` hold the rest. `runtime/services/code-facts/` holds the
  reader that caches facts by content, the grammars and the tree-sitter query files. `runtime/clients/`
  runs Git for the lens and speaks JSON-RPC to a server. `runtime/processes/language-servers/` owns
  the server child.
- The query files (`*.scm`) stay beside `grammars.ts`, which reads them with
  `new URL(..., import.meta.url)`. The wasm of each grammar is found with `import.meta.resolve`,
  and the TypeScript package with `Bun.resolveSync`, both from the root `node_modules`, which Bun
  finds by walking up from the package.
- The fixture projects of the code facts tests are in `tests/runtime/support/code-facts/fixtures/`,
  with their dotfiles. A test finds them through `FIXTURES` of the `checkout.ts` beside them.

The eleventh is `renderer` (`@archboard/renderer`). It draws projected architecture as a picture. It adopts the `api/` role for
`shared/`, `runtime/` and `ui/`. It imports `model`, `timing` and `process`.
The files of `shared/api/` and `ui/api/` are safe for the browser, with no Node import.
The files of `runtime/api/` are Node-bound and run only in Bun.

- `shared/` holds the host code that the browser and Bun both run. It holds no rule of layout, painting or
  measurement: the renderer core in `crates/` draws every picture (ADR 0059). `render/rules/` is the pure code of the
  entry points (`legacy-board.ts` resolves a legacy board's variant, view and comparison into what a render asks, and
  `diagram.ts` hands that to the core with this host's durations and theme colours), the host contract, the words a
  pane's key says beside the kinds the core lists (`key-marks.ts`) and the marks a pane draws itself (`marks.ts`), and
  `engine/rules/` runs the layout's solves on a pool of workers. `constants/` holds `shell-geometry.ts`, and `protocol/`
  holds what a render asks and answers. `protocol/generated/core/` is the core's ignored build: its WebAssembly, its
  glue, and the TypeScript types of its contract, generated from its Rust types.
  The core takes the reading, the vault's policy and the render's choices in one call, `render`
  (`crates/archboard-render`), and answers the document, its atlas, each subject's appearance and the picture's key.
  It asks the host for two things through `RenderHost`: each solve of the layout, which `engine/rules/` runs side by side on
  as many workers as the place has and calls off when the core drops it, and the path data of the icons it draws. A
  worker (`engine/rules/layout-engine.ts`) instantiates the core its host's thread compiled and handed it, and runs one
  solve at a time with the core's `layOutPicture`, which lays out each graph it ranks with the core's own Graphviz
  (`crates/archboard-graphviz` over the vendored graphviz-pure, ADR 0060).
- `runtime/` holds the Bun host. `bun-renderer/` draws with it: `services/bun-host.ts` installs the core, the theme
  colors, the icon paths and the pool of layout workers, `services/core.ts` loads the core, `operations/render.ts` has
  the render entry points, and `processes/layout-worker.ts` is the worker thread, started with
  `new URL("../processes/layout-worker.ts", import.meta.url)`. `rasterizer/` is the rasterizer with its bounds, PNG and
  receipt, `recipe/` the render recipe in a file, `headless-chromium/` the private Chromium and its DevTools client, and
  `theme/` reads the theme stylesheet. `operations/icon-paths.ts` has the icon paths, and `store/` names where the assets
  are.
- `ui/` holds the browser host. `state/` keeps what the page loads once (the core, the icons, whether the renderer has
  started) and `workers/` holds the browser layout worker. `api/browser.ts` starts the renderer with
  `startBrowserRenderer()` and draws a legacy board with `drawLegacyBoardHere`. The worker is started inside the
  package with `new Worker(new URL("../workers/layout-worker.ts", import.meta.url), { type: "module" })`, which Vite
  bundles into its own chunk. So there is no `./worker` subpath: no code outside the package runs the worker. The
  page fetches and compiles the core's WebAssembly, served beside its glue, and hands each worker the compiled module.
- `./picture` is what a pane reads of a picture besides its pixels: the words of the key it lists, the inks and marks
  the canvas draws with, the code warnings, and what a render asks and answers. The kinds the key lists and each
  subject's appearance arrive with the picture (`@archboard/model/render-reply`). `./shell-geometry` is the shell's fixed geometry and the
  page shape that pictures are laid out for. `./browser` is the browser host. `./bun` draws with the Bun host:
  `renderLegacyBoard`, `renderArchitecture` and the diagram icon paths. `./rasterizer` is the bitmap of a
  picture and the receipt of the capture.
  `./recipe` reads, embeds, and replaces render recipes in SVG and PNG artifacts.
  Canonical recipes record the model, vault repository, reading selectors, exact fingerprint, and picture digest.
  Version 2 uses the existing recipe owner and preserves legacy recipes until explicit migration and re-export.
  `./headless-chromium` is the private Chromium that rasterization, recording, and README recipes share.
  `./theme` reads the colors of the shared stylesheet.
- The assets live in `assets/`, next to `src/`: `assets/fonts/` holds Onest, Maple Mono NL and Big Shoulders Display with their
  OFL texts and `README.md`, and `assets/theme.css` holds the colors of both themes. No package file reads a `src/`
  path. `./assets` exports `DIAGRAM_FONTS_DIRECTORY` and `THEME_STYLESHEET`, computed from the package's own place. The
  renderer core carries the four diagram faces in its build (ADR 0059). `readme:assets` and the theme parity test take
  the path from there.
  `./theme.css` and the four `./fonts/<filename>` exports expose the stylesheet and fonts that the web app consumes.
  `apps/web/src/ui/theme/app.css` uses these package names in `@import` and `url()` references, which Vite resolves. `vite.config.ts` hashes `packages/renderer/src/shared`, `packages/renderer/src/ui` and the Bun worker
  into the renderer build, so a picture kept by an older build is never shown.
- Tailwind scans the `ui` area of every package, and the renderer's `ui` area holds no class names. The glyph
  contract (`tests/system/browser/drawn-glyphs.test.ts`) holds the pictures of the page and of the Bun core to the
  glyph positions of the core in Chrome.
- The tests are in `tests/`. `shared/engine/` and `shared/render/` test the pure code. `runtime/<behavior>/operations/`
  holds the whole-picture suites, with their fixtures in `runtime/support/fixtures/`. `runtime/bun-renderer/`,
  `runtime/rasterizer/`, `runtime/headless-chromium/` and `runtime/theme/` test the rest. A few tests read fixtures from
  `docs/design/` and the vault of this repository, by a relative path from the test file.

The twelfth is `code-opener` (`@archboard/code-opener`). It opens the code a node binds in the person's editor. It
adopts the `api/` role for `shared/`, `server/` and `ui/` and exposes 5 subpaths with 13 names, where code outside
imported 5 module paths. It imports `model`, `code-binding`, `code-intel`, `workspace`, `server-requests` and `ui-kit`.
The file of `shared/api/` and the 2 files of `ui/api/` are safe for the browser, with no Node import. The 2 files of
`server/api/` are Node-bound and run only in Bun.

- `./opening` is the wire contract of the open, as a reader outside sees it. It holds the notice a person reads,
  `CodeTargetNotice`. An action of a notice is `CodeTargetNotice["actions"][number]`. It also holds the schema that
  the GitHub link of a notice must pass, and the reply schemas that the system tests parse. The whole
  contract is in `shared/schemas/`, and the rule for an opener executable is in `shared/rules/`.
- `./opener` is the server's side of the open: the router and the pre-guard of the open and settings routes, and
  `openInEditor`, which plans the command a selection makes for a target and launches it. `./browser-origin` is the guard that refuses a request from a page that is not
  Archboard's own and the CSRF check that a socket upgrade makes. The pre-guard puts the guard in front of every opener
  route, and the other routes of the server take the guard from the same file.
- `server/routes/` holds the router. `projections/` turns a selection and a bound path into the command to run and
  the target inside a vault. It also makes the GitHub link of a binding (`github-link.ts`). The line that defines a
  symbol comes from `code-intel/code-facts`. `lifecycle/`
  launches the editor. `store/` holds the opener settings, a file in the state directory that
  `@archboard/workspace/atomic-write` writes. It is in `store/` because lint refuses a `node:fs` import in a `state/`
  folder. `middleware/` holds the guard and the CSRF check.
- `./code-target` is `activateCodeTarget`. It asks the server to open the code a subject is bound to. It gives
  `onNotice` the one notice that the outcome deserves: each failure, and an open of a version that the binding does
  not name. A plain open gives no notice. `./opener-settings` is `OpenerSettings`, the dialog that sets which editor
  opens the code, open over the flow that it runs against. The flow reads, tests, saves and resets through
  `ui/clients/code-target-requests.ts`, which parses each reply strictly against the schemas of `shared/schemas/`.
- `ui/` keeps the dialogs in `components/`, the flow's `hooks/` and `state/`, the endpoints in `clients/` and the pure
  command rules in `rules/`. Tailwind finds the dialog's class names through the `@source` of every package's `ui`
  area.
- The tests are in `tests/`: `shared/schemas/` tests the contract, `server/middleware/`, `server/projections/` and
  `server/store/` test the server files, and `ui/rules/` and `ui/state/` the browser files. The end-to-end owners stay
  in `tests/system/code-targets` and `tests/system/browser/opener-settings.test.ts`.

The thirteenth is `walkthrough` (`@archboard/walkthrough`). It records an exact retained canonical walkthrough to a video
(ADR 0035, ADR 0041). It adopts the `api/` role for `shared/` and `runtime/` and exposes 4 subpaths with 21 names, one
operation or fact for each job a caller has. It imports `model`, `timing`, `workspace` and `renderer`. The 2 files of
`shared/api/` are safe for the browser, with no Node import: the recording page and the replay page import them. The 2
files of `runtime/api/` run only in Bun.

- `./recording` is the recording page's side of its contract: the address that opens the page as a recording
  (`recordingAskedOf`), `publishRecordingPage`, which puts the page's side on the page and hides the global it is
  published on, the language of a recording with its default, and the narration that the voice is told.
  `./talk` is the talk: its type, the clock its log is stamped on (`TALK_SAMPLE_RATE`, `SAMPLES_PER_FRAME`), the
  frames drawn from it, the address that opens the replay page and `publishReplayPage`, which reads what the command
  gives the page as a talk and its options before the page sees it and answers with the talk's frames. A caller derives
  the page, state, log and event types from these operations. They are `shared/protocol/recording-page.ts` and
  `shared/protocol/talk.ts`. The language schema is in `shared/schemas/`.
- `./recorder` is the command's side. `recordWalkthrough` records, `renderTalk` renders a kept talk again, and
  `readTalk` reads one, refusing what cannot be rendered with `TalkFileError`. `freshTalkPlace` chooses where a
  recording keeps its talk (the directory asked for, or a new one in the state directory, which keeps the newest ten)
  and proves it free before anything starts. `keepTalk` makes a talk of its parts and writes it into a named directory,
  so the talk's format and file names stay private. `recordingContainerOf` reads the container a file name asks for.
  `recordingPageUrl` is the address a recording opens, which the browser's contract test reads back. It is
  `runtime/recorder/operations/` (`record-walkthrough.ts`, `render-talk.ts`, the frame order and the error), the page
  client of `runtime/recorder/clients/`, the talk files and the silent WAV of `runtime/recorder/store/`, and the
  container, encoder and browser of `runtime/recorder/services/recording-tools.ts`. The browser is the private Chromium of `@archboard/renderer/headless-chromium`.
- `./ffmpeg` finds the ffmpeg that encodes a recording. The encoder is `runtime/video-encoding/processes/video-encoder.ts`,
  the ffmpeg child, and `runtime/video-encoding/services/ffmpeg.ts` finds and proves it: `ARCHBOARD_FFMPEG`, else `ffmpeg` on `PATH`, else
  `nixpkgs#ffmpeg-headless` through Nix. No file of the package reads an asset by a path, so nothing depends on where the
  package sits.
- The tests are in `tests/`: `shared/protocol/` holds the talk's contract, `runtime/recorder/store/` the talk on
  disk, `runtime/recorder/clients/` the page client, `runtime/recorder/operations/` the browser flags of the render and
  `runtime/video-encoding/` the encoder. The end-to-end owners stay in `tests/system/server-state/walkthrough-*.test.ts`.

The fourteenth is `skills` (`@archboard/skills`). It ships the archboard skill and evaluates it. It adopts the `api/`
role for `runtime/` and exposes 3 subpaths with 3 names. It imports `model`, `timing`, `renderer`, `process` and
`walkthrough`. Every file is Node-bound and runs only in Bun. The 3 files of `runtime/api/` are the
interface.

- `./distribution` is `prepareSkillArtifacts`. It prepares the copy of the skill that the checkout, the installer and
  `generate:skill-artifacts` ship: the JSON Schemas that Zod renders for canonical manifests, modules, flows, operations, and vault policy (`runtime/distribution/projections/schemas.ts`), and the installation-local manual
  (`runtime/distribution/operations/prepare.ts`). The CLI's `install-skill` keeps which skills it ships and how it
  links or copies them.
- `./evaluation` is `runEvaluationCommand`, the whole command line of `bun run eval:skill`
  (`runtime/evaluation/operations/command.ts`): `check`, `run`, `grade`, `pin` and `report`. `scripts/evaluate-skill.ts`
  passes it the arguments and the checkout. The evaluation is human-run and never part of the gate: real Codex authors
  on real Flask checkouts, one blinded grader and a comparison report.
- `./citations` is `anchorsOf`, the anchors of a markdown document. The grader's citations and
  `tests/system/repository-policy/skill-links.test.ts` read them. That test stays in the repository lane, whose cache
  follows every tracked file, so a changed skill always runs it.
- `runtime/evaluation/` holds the evaluation by behavior. `batch/` holds a batch and its inputs, `run-world/` one
  author run's world: its vault, its installed skill, the Archboard server and the Flask checkout. `run-checks/` holds
  the captures and the re-audit, `audit/` that classifies what an author ran and what it reached for, and
  `outcomes/` the deterministic checks. `grading/` holds the grading session, the blinding and the two grader
  programs, and `reporting/` the comparison and the records. Its own `processes/`, `protocol/`, `schemas/` and
  `store/` hold the child processes, what the event streams and answers say, the canonical inputs and the manifest
  of a run, and the layout a batch keeps on disk.
- `runtime/evaluation/run-checks/audit/rules/classify.ts` treats `packages/skills` as the harness's source, so an author that reads it has the
  exposure `harness-source`. It still counts the old module directory `skill-evaluation/`, for a batch recorded before
  the move. No file of the package finds a path from where it sits. A test finds the checkout with
  `@archboard/workspace/source-checkout`.
- The tests are in `tests/`, in the folder of the file they test. `runtime/support/` holds the fake `claude` and `codex`
  executables and the fixtures. Their end-to-end owner is `bun run eval:skill`, which a person runs.

The fifteenth is `server-lifecycle` (`@archboard/server-lifecycle`).
It starts, finds, restarts, and stops the Archboard server and owns the identity-gated CLI request.
Runtime operations keep their `runtime/api` entries and remain Node-bound.
The browser and server share socket message types through `./pane-messages` in `shared/api`.
Those types have one definition in `shared/protocol` and import no runtime code.
The runtime pane entry no longer exports these message types.
Moving the existing exports adds no public names or interface allowance.
Each lifecycle job remains one operation, so callers never assemble process readiness or shutdown steps.
CLI route clients remain in `apps/cli/src/cli/server-access/clients/`.

- `./server` is what a command does to the server of its checkout. `ensureServerRunning` reaches the server at the
  URL, or starts one when it may and waits for its readiness, and answers its URL, whether it started it and its pid
  file's pid. `stopServer` stops it without ever signalling a process that is not it, `restartServer` stops it,
  builds the frontend and starts it again, and `serverStatus` says what answers at the URL: nothing, a conflict
  (another service, an older build or another checkout's server), or the running server with its pid, browsers,
  source freshness and sync state. `connectedBrowsers` is the browser count a command that needs a pane checks.
  `./config` is the server URL that the CLI reads from the environment and the removed variables that it refuses.
  `bin.ts` imports `./config` alone and late, because loading it reads `.env`.
- `./server-client` is one CLI request to a running server (`requestJson`), behind the identity gate, carrying what
  the invocation states about itself on every request. `stateInvocation` states its vault, doing line, write
  session and expected version, and `statedInvocation` reads them back. `formatModelRefusal` and
  `MODEL_REFUSAL_CODES` are how a refused model request is shown, and `responseError` is the error the transport
  builds from a refused answer.
- `./server-host` is what the server process does for itself: whether it is the entry point, whether its source or
  frontend bundle is stale, its pid file (`recordServerPid` once it listens, which also sweeps the pid files of
  servers that are gone, and `removePidFile`), and its reports down the startup pipe to the launcher that spawned it
  (`reportStartupOwnership`, `reportStartupEnd`). `./panes` is how a pane is addressed (`resolvePane`), ordered and
  reported, and the messages that the server sends a pane over its socket.
- `runtime/operations/` holds the spawn, the stop, the restart, the status and the cleanup of a failed start.
  `runtime/clients/` holds the transport and the health reads. `runtime/protocol/` holds what is written down the
  startup pipe and what the server sends a pane. `runtime/rules/` holds the pane layout, `runtime/store/` the pid
  file, `runtime/state/` the invocation's statement and `runtime/services/` the configuration and the staleness
  check.
- The server entry is found with `SOURCE_CHECKOUT` of `workspace`, because the package sits at another depth than
  the module did: the spawn runs `apps/server/src/server.ts` of that checkout. The staleness check watches
  `packages/` and `apps/` of it. The startup preload
  of `tests/system/server-state/` mocks the cleanup timing of `runtime/operations/server-startup-cleanup.ts` by path,
  because the spawn imports that private file, and `package-api.test.ts` names it.
- The tests are in `tests/`: `runtime/store/` holds the pid file, `runtime/operations/` the cleanup of a failed start
  and `runtime/rules/` the pane addressing. The end-to-end owners stay in `tests/system/`.

The `codex-realtime-voice` package (`@archboard/codex-realtime-voice`) owns reusable Codex conversations and realtime voice.
It runs one private app-server process with separate coordinator and workhorse histories.
Each browser tab has one coordinator and one workhorse per admitted checkout.
The package sits at layer 6 and reads only its Codex, process, diagnostics, and timing foundations.
It imports no Archboard model, vault, walkthrough, pane, or server-lifecycle module.

The package and the four packages it reads are MIT-licensed, each with its own `LICENSE`. Every other package is BUSL-1.1.
`bun run pack:voice` (the `voice-package` Vite+ task, `scripts/pack-codex-realtime-voice.ts`) builds it for npm into ignored `dist/codex-realtime-voice/`.
It bundles the four MIT packages into ESM and bundled declarations for each public entry, and keeps zod, ws, React, Express and `@openai/codex` external.
`tsconfig.voice-package.json` names the sources the declarations come from.
The generated manifest declares zod and ws, `@openai/codex` at the pinned version as a peer, and React and Express as optional peers.
The owner publishes that directory with `npm publish`.
`resolveCodexExecutable` from `./server` finds the installed `@openai/codex` and proves its exact version. Archboard passes `installedIn: SOURCE_CHECKOUT` to refuse any other install.
`tests/system/process-contracts/voice-package.test.ts` installs the packed tarball into a project outside the repository.

Its public entries separate browser code from Bun code.
`./browser` holds `createVoiceClient`, the one client a host page uses, and its state and option types.
`./react` holds `VoiceClientProvider`, `useVoiceClient` and `useVoiceState` over that client, and no styled components.
`./controllers` serves a host that owns its sockets, as Archboard does for each pane.
It holds the transport and media owners, `createConversationControllers` for one chat, and the timeline projection.
`./contract` holds only the snapshot types a conversation UI renders.
`./schemas` holds the browser model's schemas and the dynamic approval wire rules, for a host server and its tests.
`./realtime` holds the realtime contract, transcript events, and state transitions.
`./runtime` and `./server` run only in Bun.
All four areas adopt the `api/` role.

The server entry is one factory, `createVoiceAgent` from `./server`.
The host supplies a storage directory, the Codex process inputs, the admitted checkouts, role instructions as text, an identity, and `onFatal`.
The agent's `start()`, its two socket adapters and `shutdown()` own process startup, generations, sessions, browser sockets, shown conversations, and shutdown.
`attach(server, { path, origin })` serves the browser sockets on one path of a `node:http` server, and `bunHandlers({ path, fetch, websocket })` returns the `fetch` and `websocket` of a `Bun.serve` server that serves them, so a host writes no upgrade handling.
Both apply the one admission in `server/agent/services/admission.ts`.
The identity sets the Codex service name and thread source, with the neutral default `codex-realtime-voice`.
A host with a domain passes `extensions` (`VoiceAgentExtensions`): context sources, a context codec, domain tools, extra role tools, a voice narrative, and its own browser routing.
A host that multiplexes its own socket uses `agent.browser` instead of either adapter.
That extension contract is one type, and a host derives the parts it names from it.
`./runtime` holds only what Archboard still needs from the core beyond that contract: the wait-graph and callback-engine factories, callback types, instruction byte checks, and the realtime adapter and thread-context delivery its tests build on.
The namespace of a dynamic approval on the browser wire is whatever the host names; Archboard sends `archboard_app`.
A consumer never assembles the internal factories.
Host context events carry generic fields (feed, sequence, freshness, identity, coalescing) and a payload that only the host's policy reads.

`runtime/` owns execution identity, immutable instruction profiles, thread links, approvals, queues, coordinators, workhorses, and realtime recovery.
Host context stays separate from execution identity.
Core comparisons retain exact child, epoch, thread, turn, coordinator, and voice-generation identity.
The approval broker owns settlement, including spoken approval.
An uncertain delivery remains `outcome_unknown` and permits no blind retry.
Voice stop and workhorse stop remain separate operations.

`server/` owns the browser gateway, command leases, generation replacement, session cleanup, and generic projections.
The browser changes the shown conversation through activation.
An agent tool cannot change it.
Context delivery retains ordering, freshness, authorship, and the distinction between quiet context and speech.
Application context and agent speech grant no user authority.

`ui/transport/clients/` owns one socket run, one lease, command targeting, and recovery after gaps in the event stream.
`ui/wire/clients/` parses messages with the shared model.
`ui/media/clients/` binds that transport to the WebRTC session and its audio elements.
`ui/realtime/clients/` owns microphone capture, negotiation, playback, and cleanup.
`ui/output-level/clients/` measures playback volume.
`ui/voice-client/clients/` opens the socket with the chat id and the tab session id from `sessionStorage`, attaches the transport and media owner, and publishes one frozen state.
An uncertain delivery stays in that state as a failure, and nothing retries it.
A host that owns its socket attaches the transport itself.
`ui/thread-link/`, `ui/composer/`, `ui/queue/`, `ui/approvals/` and `ui/timeline/` hold their controllers in `state/` and their rules in `rules/`.

Tests move with their behavior into `packages/codex-realtime-voice/tests/`.
They retain the matching `shared/`, `runtime/`, `server/`, and `ui/` owners.
Support files remain private to that test owner.
Cross-package tests import only public entries.

The `workbench` package (`@archboard/workbench`) owns the Archboard agent integration at layer 7.
It consumes `codex-realtime-voice` and retains canonical architecture context, vault admission, domain tools, narration, pane services, and the visual shell.
It adopts the `api/` role for `shared/`, `runtime/`, `server/`, and `ui/`.

`./browser-contract` holds Archboard conversation routes and presentation contracts.
Archboard validates its walkthrough and recording payload before narration starts.
`./semantic-context` publishes captured architecture context for coordinators and workhorses.
Its capture schemas, brief builder, and catalogue formatting stay in this integration.
`./runtime` exposes application behavior needed by outside callers.

`./server`, `./panes`, and `./host` expose Archboard server integration.
The production adapter calls `createVoiceAgent` like any host: Archboard's identity (`archboard`), its role instructions and app tools, admitted vault checkouts, and its extensions.
Its pane sockets reach the agent through the extension's own browser routing.
`src/runtime/voice/protocol/extension.ts` names the extension types Archboard implements, derived from `VoiceAgentExtensions`.
It supplies `ARCHBOARD_URL`, `ARCHBOARD_NO_AUTOSTART`, and its executable path prefix explicitly.
The Codex SDK supplies none of those application values by default.
Pane registration, captured model context, and narration remain integration concerns.
Canonical semantic projections come from `@archboard/model/content`.
`apps/server` owns HTTP routes, sockets, and application lifetime.

Canonical explanation actions use the existing `./server` operation and shared `./browser-contract` schemas.
`server/explanations/services/` owns temporary requests, exact retries, queue cancellation, and correlated text results.
The model runtime owns coherent capture through `readArchitectureModel` and its selected-reading argument.
Adapters never reconstruct architecture or comparison bases.
The existing coordinator, checkout workhorse, queues, and provider notifications own execution.
The existing pane report owns canonical reading intent and notifies the coordinator context source.
Shown-conversation request assembly stays inside the workbench's public `showConversation` operation.
Its pane and checkout lookup helpers remain private.

`./agent` and `./voice` expose the Archboard browser shell.
The dock, the conversation panel, approval cards, sign-in, voice controls, orb, and subtitles remain here.
The shell reads the conversation controllers, transport, and media owners from `codex-realtime-voice/controllers`.
`ui/workbench-client/surfaces/state/voice-parts.ts` derives the parts of those owners that the surfaces name.
The voice-session adapter adds Archboard presentation and narration to shared media state.

The UI uses the role folders in [frontend.md](frontend.md).
Assistant-ui imports stay in the `thread` and `assistant-runtime` behavior folders.
`@assistant-ui/react-markdown` stays in `thread`.
Subtitles use the frame clock from `ui-kit`, so recordings render them frame by frame.
Tailwind discovers package class names through the stylesheet's `@source` declarations.

Tests of retained integration behavior stay in `packages/workbench/tests/`.
Tests of the app's routes and startup stay in `apps/server/tests/`.
Full-product and browser workflows stay in `tests/system/`.

## Apps

An app is a layer-8 workspace in `apps/<name>/` that holds what the packages left (TASK-500.24).
It is private, has no `exports`, and `apps/*` is in the `workspaces` field. The lint plugin
holds an app to the rules of a package, with these differences:

- **Nothing imports an app.** Only the app's own source and tests reach its files. A package, another
  app, a script and a test of another owner are refused, and so is the `@archboard-app/<name>`
  workspace name, even from the app itself.
- **An app imports a package only through its `exports`.** Inside an app, imports use the `#`
  entries of its own `package.json`, as in a package. A `#` import that names no existing file is
  an error whoever owns the importing file.
- **An app has areas, behavior folders and role folders like a package.**
  `apps/web/src/ui/<behavior>/<role>/`, `apps/cli/src/{cli,runtime}/`, `apps/server/src/server/`. The thin entries are
  `apps/cli/src/bin.ts`, `apps/server/src/server.ts`, `apps/web/src/main.tsx`, and
  `apps/workbench-example/src/{server.ts,main.tsx}`. Both `main.tsx` entries count as browser code. Other files directly in `src/` and a folder beside `src/` and `tests/` that holds
  source are refused. An app also refuses a folder of `src/` that is no area.
- **A package or an app has no `lib/` folder.** Name the role of the folder.
- **Tests** follow `apps/<name>/tests/` like a package's. Its `ui/` folder is held to the UI lint
  policy.

`tests/system/repository-policy/app-boundaries.test.ts` holds these rules.

### `apps/cli`

`apps/cli` is the command line (TASK-500.24.02). `bin/archboard` stays a regular root file that
runs `apps/cli/src/bin.ts`. The checkout hand-off needs the launcher's real path to equal its root
path, so the launcher cannot be a symlink.

`bin.ts` first imports the checkout hand-off, then the bootstrap that extracts `--url`.
For commands other than help, it checks for retired environment variables before it imports the
command table. Help returns before prerequisite checks or command execution. The command table
still imports configuration and logging modules.

Never import the server there: the CLI reaches it by spawning `apps/server/src/server.ts`. Nothing imports the app.
The root `generate:cli-contract` script, the system tests and the skill evaluation spawn it by
path, and `archboard install-skill --print-source` is how a test learns which skills it ships.

- `src/cli/` owns command contracts, dispatch, discovery, server clients, and file receipts.
  `routing/` resolves the command table, the bootstrap, the session, and the explicit vault, and
  dispatches one command. `routing/rules/` holds dispatch, the registry and help.
  `contract/protocol/` declares invocation, answer, and refusal contracts.
  `contract/rules/` projects those contracts into Commander parsing and help.
  `contract/operations/` runs one contract and presents its result.
  `commands/<command>/` holds each command family: `model`, `vault`, `pane`, `repo`,
  `install-skill`, `server-control` and `contract-artifacts`.
  `commands/model/` owns model commands, including claims, edits, inspection, migration, history, and rendering.
  `commands/model/rules/` puts the shared interface derivations into the answers and words of `model inspect` and `model compare`.
  `commands/contract-artifacts/` generates the command proof from the shipped contracts.
  `server-access/clients/` calls the public canonical HTTP routes through the gated server client.
  No legacy board or top-level claim/release command remains live.
- `command-owner` paths in the command table and the `generatedFrom` field of the proof are
  repository paths of these files. Moving a command file means editing `run.ts`.
- The tests are in `tests/cli/`, in the folders of the code they cover. `support/` holds the public
  runner fixture and the stand-in vault.

### `apps/server`

`apps/server` is the HTTP and socket host (TASK-500.24.03). Its entry is `src/server.ts`, which starts
`startServer` when it is the process entry (`isMainModule`) and exports nothing. Nothing imports it: the
launcher of `server-lifecycle` spawns `join(SOURCE_CHECKOUT, "apps", "server", "src", "server.ts")`, and a
system test spawns the same path, with `bun --preload` where it has to replace a module before the server loads.
The host serves the browser build from `SOURCE_CHECKOUT/dist/frontend` (`store/frontend/`) and nothing else
of `dist/`.

- `src/server/` owns HTTP composition and process lifetime.
  `wiring/` mounts routes and shares their owners.
  `lifecycle/` owns startup, mutation admission, and resource shutdown.
  `routes/architecture/` adapts canonical reads, edits, claims, migration, history, publication, rendering, and explanations.
  These adapters call the public runtime rather than private storage transitions.
  `routes/panes/` owns reports, canonical navigation, and browser activation.
  Repository, code inspection, and service routes retain their existing owners.
  `sockets/panes/` accepts explicitly addressed pane sockets.
  `services/checkout-work/` owns machine-local source work and cancellation.
  The existing architecture change feed announces only coherent durable results.
  Retired legacy board routes perform no live reads or writes.
- The app reads the pane and tab services, request context and listener address through the exports of
  `packages/workbench`. It mounts that package's pane context and voice trace routes, and the router of
  `packages/code-opener`.
- The tests are in `tests/server/`, in the folders of the code they cover. `lifecycle/lifetime/` also holds the
  proof that a stop force-reaps a real process group. The system tests that start the whole server stay in
  `tests/system/`.

### `apps/web`

`apps/web` is the browser app (TASK-500.24.04 and TASK-500.24.05). It holds the whole browser UI, its
entry, the page and the stylesheet. Inside the app, imports name the defining file under `#ui/`. No
behavior has an index: a caller imports the file that defines a name.

- `src/main.tsx` is the browser entry. It starts the pictures drawn in the page and mounts the application or the
  renderer of a recorded talk. `index.html` and
  `favicon.svg` sit beside `src/`; Vite takes `apps/web` as its root and writes the bundle to the repository's
  `dist/frontend`, which `apps/server` serves. `index.html` links `/src/ui/theme/app.css`. That file is the only one in
  `src/ui/theme/`, because a stylesheet is no role; the plugin judges TypeScript only. Its `@source` paths are
  relative to it. `vite.config.ts` stays at the repository root and names the root, the output and the dev server's
  `fs.allow`, which lets the dev server serve `packages/` and `node_modules` outside the root.
- `src/ui/` is the `ui` area. Until its move (TASK-582.03.03), each behavior is a folder under each
  role it needs. The move puts each behavior first, with its role folders inside it.
  `application` owns the root, the pane records and lists, the agent surfaces and the workspace port.
  `shell` owns the frame, navigator and rows. `pane-session` owns one pane's socket, status, reading and registration.
  `reading-routing` owns the workspace address, and `model-catalog` discovers canonical repository models.
  Canonical model components own module navigation, reading controls, claims, and selected-state presentation.
  The existing canvas, walkthrough-recording, and walkthrough-replay owners retain local rendering and playback.
  `rules/` holds pure behavior, `state/` holds state that outlives a render, and `clients/` owns external effects.
  `components/` and `hooks/` hold React code. `clients/renderer-build/` holds the declaration of the
  `virtual:archboard-renderer` module that `vite.config.ts` serves, a `.d.ts` that sits in a role folder because the
  files directly in `src/` are for entries.
- The canvas has no index either. Its parts are in `rules/` (`camera/`, `walkthrough/`, `drilling/`, `reading/`,
  `picture/`), `state/`, and `clients/` (`reads/`, `picture/`, `subjects/`).
- The tests are in `tests/ui/<role>/<behavior>/`, in the folders of the code they cover. `tests/ui/support/<behavior>/`
  holds the harnesses and fixtures that tests share. `tests/contracts/` holds the one test that holds the recorder's page
  address to the address bar's reading of it: it imports a Bun-side package export, which no `ui` test may.

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

These directions keep transport and I/O details apart. They hold within and between packages and apps.
A test counts for the area of its folder (`tests/ui/` is `ui`).

- `shared` depends on no other area.
- `runtime` depends on `shared` and `server`. It never imports `cli` or `ui`.
- `server` depends on `shared` and `runtime`. It never imports `cli` or `ui`.
- `cli` depends on `shared` and `runtime`. It never imports `server` or `ui`.
- `ui` depends on `shared`. It never imports `cli`, `server` or `runtime`.

These are dependency permissions, not permission to deep-import. A cross-package import still goes
through an export.

## Validation

Run `bun run lint` for code and boundary lint. Run `bun run check` for lint,
formatting, type checking, and all four normal native test lanes. Explicit
`test:opt-in:*` package commands own capacity, test tooling, unsupported
topologies, and browser performance outside that normal gate. `bun run fix`
applies safe Oxlint fixes and formats the repository.

### `apps/workbench-example`

`apps/workbench-example` demonstrates the shared Codex workbench without an Archboard server, model, or vault.
The server admits one checkout and keeps private state in the supplied directory.
It reads only public SDK and codex-realtime-voice entries.
Its server calls `createVoiceAgent` and runs on `Bun.serve` with `agent.bunHandlers`, and keeps only its own HTTP routes.
Its browser uses `createVoiceClient` and the `./react` hooks, as an outside developer would.
The two stop controls keep voice and workhorse lifetimes separate.

`src/server.ts` and `src/main.tsx` are thin process and browser entries.
`src/shared/protocol/application.ts` owns the configuration response and socket path.
`src/server/` owns HTTP, socket registration, startup, and cleanup.
`src/ui/` owns the page and action presentation. It holds no client of its own.
`scripts/build-workbench-example.ts` generates the three browser assets under ignored `dist/workbench-example`.
The normal gate builds those assets before it runs product tests.

App-owned DOM tests cover controls and draft recovery.
The process owner in `tests/system/server-state/workbench-example.test.ts` starts the actual app with the controlled Codex executable.
It covers approval delivery, tab isolation, voice negotiation, workhorse completion, independent stops, and cleanup.
