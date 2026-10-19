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
    <area>/api/     # the interface files of an area, in a package that adopts the role
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
- **An `api/` folder is the package's interface over private implementation.** A package that
  adopts it points the `exports` of an area only into that area's `api/`. An api file re-exports
  by name (`export { a } from "#shared/rules/x.ts"`, `export type { T } from ...`, never `export *`)
  from the private files that define the names, and it holds no second definition. A public name
  needs a concrete caller outside the package, so a name nobody outside imports stays private.
  Private production files never import an api file, because the api files sit above them. `board`,
  `codex-app-server`, `code-binding` and `code-intel` adopt it for `shared/` and `runtime/`, `workspace` also for
  `server/`, `renderer` for `shared/`, `runtime/` and `ui/`, `code-opener` for `server/` and `ui/`, `walkthrough` for `shared/` and `runtime/`, `process` for `runtime/`, and `ui-kit` and `server-requests` for `ui/`. An export that is a file to run, not a module to import,
  is the one exception: `process` exports `./git-owner` as the script itself, and the test names it.
  `tests/system/repository-policy/package-api.test.ts` holds the three rules.
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
file sits in `runtime/processes/`. It adopts the `api/` role for `runtime/` and exposes 4 subpaths,
where it exposed 6 files. `./observation` reads the process table. `./git-group` carries the
operations on the group of a Git command: capturing it, asking whether it or another member exists,
and the TERM-then-KILL end of it. `./codex-group` carries the Codex process-group operations and
their TERM-then-KILL escalation. The cleanup takes its error type from the caller, so the package
does not import `codex-app-server`. `./git-owner` is the one export that is not an api file: it is
the script that a Git command runs under, and callers find it with `import.meta.resolve` and spawn
it, so it keeps pointing at its file, and `package-api.test.ts` names it as an executable.

The fourth is `workspace` (`@archboard/workspace`). It knows where a vault, a checkout and the state
directory are. It adopts the `api/` role for `shared/`, `runtime/` and `server/` and exposes 8
subpaths, where it exposed 10 files. `./repositories` and `./languages` are in `shared/api/` and safe
for the browser, with no Node import: the listing schemas of the navigator, and the languages that an
agent can configure a server for. The rest is Node-bound. `./checkouts` carries what is known of
checkouts: the Git lookups, the repository registry and the validation of a language server
command, which uses `node:path`, so the browser never imports it. The registry's
`repositoryOfVault` is exported as `registeredRepositoryOfVault`, because `./repository-listing`
defines a different `repositoryOfVault`, the one that the server projection answers with.
`./vault` finds a vault, `./source-checkout` finds the checkout whose source runs, and
`./atomic-write` and `./state-dir` write files durably and name the state directory.
`./repository-listing` is the answer of `GET /api/repositories`, in `server/api/`. `source-checkout`
finds the checkout by walking up to the nearest directory that is an archboard checkout, so the
depth of the file decides nothing, and `bin.ts` loads it lazily, so a command that hands itself to
another checkout loads nothing else first. `module-paths` is not here: the server derives its
`src/` from its own depth.

The fifth is `code-binding` (`@archboard/code-binding`). It knows what a node's code binding is and
where its path lives in a checkout. It adopts the `api/` role for `shared/` and `runtime/` and
exposes 3 subpaths, where it exposed 9 files. Everything in `shared/api/` is safe for the browser,
with no Node import. `./bindings` holds the binding, anchor and document-reference schemas and the
files a binding names. `board` imports them and the resolver parses with `CodeBindingSchema`, so
they stay here. `./opening` holds the wire contract of the open route, the contract of the opener
settings and the pure rules for an opener executable. `./resolution` is Node-bound, in
`runtime/api/`. It captures the registered checkouts and the paths of some bindings once, then
resolves a binding or a repository against that snapshot alone. It also carries the result types
and the resolution rules that the snapshot feeds, the checkout that holds a vault with the
checkouts a reader of that vault resolves identities in, and the GitHub URL that a card opens when
the code is not local.

The sixth is `codex-app-server` (`@archboard/codex-app-server`). It is one private Codex app-server
session over stdio. The package is complete. It holds the shared files, the wire protocol, the
process owner, the stdio transport, the session and the semantic context. It imports `board`
(layer 4) and the lower packages, and nothing from `src/`. It adopts the `api/` role for `shared/`
and `runtime/` and exposes 7 subpaths, where it exposed 17 files. The 2 files of `shared/api/` are
safe for the browser, with no Node import. The 5 files of `runtime/api/` are runtime-only by policy:
the browser imports none of them, though `./session` carries some Zod schemas.

- `shared/api/`: `./contract` holds the authored wrapper over the generated protocol types: the
  request methods, the status types, the approval decisions and their schemas, and the connection
  capacity constants. The generated tree is ignored by git. It lives in
  `src/shared/protocol/generated`, and `scripts/generate-codex-app-server-contract.ts` writes it on
  `bun install` and creates its parent directories. The wrapper imports it with `#` and only as
  types, and no other file of the package or outside it does. The capacity test is opt-in
  (`bun run test:opt-in:capacity`). `./identity` holds the identity brands, the authorities, the
  correlations and the ledger.
- `./protocol` is the pinned Codex version and the decode of a server notification. Outside tests
  build their notification fixtures with the decoder. The method lists, the request and response
  schemas and the thread, item and core schemas of `runtime/protocol/` and `runtime/schemas/` stay
  private.
- `./transport` is the stdio transport of `runtime/clients/`: it creates the transport and carries
  the types of its requests, notifications and server requests and its error classes.
  `runtime/operations/` settles a request, routes a reverse request and adopts the identities of a
  response. `runtime/protocol/wire.ts` decodes the JSON frames. The write-capacity test of the
  transport is opt-in too (`bun run test:opt-in:capacity`).
- `./session` is the session of `runtime/services/`. It creates the session and carries its
  interface, its options, its errors and its control symbol. It also carries the decoded results of
  a session request, such as `SessionThread`, and the schemas where code outside the package
  validates: the reply to a server request, the supported login parameters, the queue parameters
  and a queued submission. The session's storage proof is in `runtime/store/`.
- `./process` owns the `codex app-server` child of `runtime/processes/`: it creates the process and
  reports its lifecycle. It also carries the executable check, which finds the Codex executable of
  the checkout whose source runs, through `SOURCE_CHECKOUT` of `workspace`, and refuses a global one
  or one of another checkout. `runtime/store/` prepares and locks the private Codex home, and
  `runtime/services/` holds the child's environment and its diagnostics buffer.
- `./semantic-context` turns a user's gestures and the settled changes of a board into the briefs
  and events that the coordinator and the workhorse read. It creates the publisher and carries its
  input, brief, event and publisher types and the byte and entry limits. The input normalizers, the
  brief builder, the fitter and the bounded-text and listener-diagnostic helpers are private. The
  barrel `codex-semantic-context/index.ts` is gone: a name is imported from the api file that
  carries it. The package reads board schemas by value from `@archboard/board` (`./views`,
  `./document`, `./reconciliation`, `./pane-context`) to normalize the architecture a pane reports.
- A test that needs the process owner's injected dependencies imports
  `runtime/processes/process.ts` from inside the package. No test outside the package does, so the
  package has no `./testing` export.

The seventh is `board` (`@archboard/board`). It is the board document, its policy and its one
reader and writer. The package is complete. It has two areas. `shared/` holds the code that the
browser and the server both run, and imports no Node module. `runtime/` holds the store and runs
only in Bun. Browser code imports only `shared/` exports. The `shared/` folder keeps its code in
private role folders and exposes it through `shared/api/`. `runtime/` exposes itself through
`runtime/api/`. Both use the `api/` role, and `board` has 20 api subpaths in total. The role
folders of `shared/` are:

- `schemas/` are the data shapes: the board aggregate, what one variant holds, the views, the
  walkthrough, the vocabulary, the semantic policy, the standing of a variant against its
  predecessor and the draft references. `primitives` is private. The binding, anchor and
  document-reference schemas are not here. They stay in `code-binding`.
- `protocol/` are the wire contracts: what an agent may say, what a render answers, the answer of
  the listing route, the move to another vault, the choice of a side and what a pane reports about
  its reading.
- `rules/` are pure functions. `rules/ids.ts` is the one place that mints an id. `rules/coherence/`
  holds the checks a shape cannot state and the one parse of an untrusted value as a board.
  `rules/compare/` compares two variants, their interfaces and the drawing of a proposal against
  current. `rules/reconcile/` brings a proposal forward when its predecessor moves.
  `rules/inspect/` reads one container or one group off a variant. `scope.ts` and `flow-steps.ts`
  stand beside them.

The thirteen files of `shared/api/` are the whole browser-safe interface. Each carries only the
names that code outside the package imports. A name sits in the file of its meaning, not of the
private file that defines it:

- `./document` is the board aggregate, the variant address and lifecycle, how a variant is found,
  the draft references and `parseSemanticBoard`.
- `./content` is what one variant holds (nodes, relationships, drill-downs), the walkthrough, edge
  emphasis and the reading of groups.
- `./flow` is the flow step shapes, the message kind and the reading of a flow's steps.
- `./views` is a view, the scope of a view and the diagram grammar.
- `./policy` is the semantic policy, its evidence and palette, and the vault check with the
  diagnostic helpers that read it.
- `./comparison` compares two variants and draws the proposal against current.
- `./container-interface` reads and compares what a container exposes to its callers.
- `./commands` is what an agent may say: create, edit, branch, adopt, rename, shelve and move.
- `./render-reply` is what a render answers and the theme it draws with.
- `./pane-context` is what a pane reports about its reading, and its route.
- `./board-listing` is the answer of the listing route.
- `./reconciliation` is the issue shapes of a reconciliation. They stay independent of the
  reconciliation algorithm, which is private.
- `./ids` is the id mint.

The `runtime/` folder is the one place a board file is read or written (CLAUDE.md, "The file is the
board"). Every write goes through `@archboard/workspace/atomic-write` and is committed before it is
answered. The lock is deny by default. The folder keeps its code in two private role folders and
exposes it through seven files of `runtime/api/`. Each carries only the names that code outside the
package imports:

- `store/` holds files, locks, registries and file formats: the board's identity and key, where a
  note lives, the vault's configuration, the vaults bound to a repository, the line an agent said
  about its write, `format/` (the decode and the schema migrations) and `lock/` (the one-writer
  lease, its claims and its announcements). `former-names.ts` is private.
- `operations/` is one write or one read that a caller asks for: `write/` (the write boundary and
  the pure transitions it applies), `read/`, `check/`, `edit/` (one batch of stated changes into
  content), `move/`, `rename/`, `settle/` and `variant/` (adopt, shelve, restore, inheritance and
  propagation).

The seven files of `runtime/api/` are:

- `./address` is where a board lives: its identity, its key and the variant a key states, and the
  path of its note in a vault.
- `./store-read` reads boards from a vault: one board, the listing and the catalogue of them, the
  vaults that hold boards of one repository, and the decode of a board file.
- `./vault-policy` is the vault's configuration, the vault check against its policy and the
  subject a diagnostic names.
- `./doing` is the line an agent said about its write.
- `./lock` is the one-writer lease: claims, holds, the lock state and what announces a change of
  it.
- `./store-move` moves a board to another repository's vault and previews that move.
- `./store-write` is the write boundary, the transitions it applies, the discard and acceptance of
  a board, the rename and the outcome of a propagation to drill-downs.

The package has no barrel. In the old `index.ts`, the names of the document, the input, the render
reply, the reconciliation and the comparison came from one import. An importer now names the api
file that carries each name. `semantic-board-store/index.ts` and `engine/board.ts` forwarded names, and both are gone. `./integrity`, `./positions`, `./primitives`,
`./reconcile-candidate` and `./reconcile` were exported only because the store imported them. The
store is inside the package now, so these five are private, and no file outside the package
imported one. `board` imports only `timing`, `diagnostics`, `process`, `workspace` and
`code-binding`, and nothing from `src/`. The rest of `runtime/engine` imports `board`, and `board`
imports nothing back, so the old import cycle between them is gone.

The eighth is `ui-kit` (`@archboard/ui-kit`). It holds the presentation parts that more than one UI
module draws with, in the `ui` area, and imports nothing from `src/`. It adopts the `api/` role for
`ui/` and exposes 10 subpaths, where code outside imported 29 paths. Every export is safe for the browser.
`ui/components/` holds the shadcn Base UI components with their `README.md` and the dialog parts in
`dialog-parts/`; `ui/state/` holds the frame clock and the fullscreen presentation; `ui/rules/`,
`ui/hooks/` and `ui/constants/` hold the small helpers. The `components` aliases in
`components.json` name `ui/components/` as `@/../packages/ui-kit/src/ui/components`, which the
shadcn CLI resolves through the `@/*` mapping. Generated imports still need the `#` rewrite.

- `./controls` is what a person acts on: buttons, inputs, selects, tabs, toggles and form fields,
  and `usesCommandKey`, the platform's modifier for shortcuts.
- `./overlays` is the dialog, the dropdown menu and the tooltip. `./display` is the alert, the
  badge, the separator, the skeleton, the pane chrome and the resizable panels. `./class-names` is
  `cn`, the class merger that every component draws with.
- `./dialog-parts` is the failure alert, progress text, technical values, the field messages and
  the cancel button class that every dialog surface shares.
- `./time` is the ticking clock hook and the short age and clock text. `./frame-clock` is the clock
  that moves what a pane draws over time. `./stepped-clock` is the clock that a renderer steps,
  which the page that renders a recording frame by frame drives. `./fullscreen-presentation` owns
  presenting one pane fullscreen. `./repository-name` is a repository's name as the chrome shows it.
- Tailwind finds class names by scanning source files. `src/ui/theme/app.css` names
  `packages/*/src/ui/**/*` with `@source`, so the `ui` area of every package is scanned (a bare
  `packages/*/src/ui` matches nothing). `tsconfig.frontend.json` includes `packages/*/src/ui`.
- A component that no code outside the package imports, such as `Combobox` and `AlertDialog`, has
  no api name and stays private.

The ninth is `server-requests` (`@archboard/server-requests`). It is the browser's one way of speaking
JSON to the Archboard server, and the browser side of the rule that every call names its vault
(ADR 0049). It has one file, `ui/clients/server-requests.ts`, and its `.` export is the one api
file, `ui/api/server-requests.ts`, with 10 names, where the module was imported through one path.
It carries the request helpers (`json`, `post`, `mutation`, `strictReply`, `cancellable`), the
vault and board query builders (`inVault`, `boardQuery`) and the vault a page opens in
(`learnServedVault`, `servedVault`). The reply guards `isRecord` and `trustReply` stay private. It
holds the one module-level value, the served vault, which the page learns once before it draws.

The tenth is `code-intel` (`@archboard/code-intel`). It is what the code says about a board: the code
facts of a checkout, the code check of a board's claims, the history lens over Git and the language
servers that resolve a name. It adopts the `api/` role for `shared/` and `runtime/` and exposes 5
subpaths with 36 names, where code outside imported 7 module paths. It imports `board`,
`code-binding`, `workspace`, `diagnostics` and `timing`, and nothing from `src/`. The 2 files of
`shared/api/` are safe for the browser, with no Node import: the canvas imports them. The 3 files of
`runtime/api/` are Node-bound and run only in Bun.

- `./code-check` is the answer of the code check and of the route that remembers it: the findings,
  their evidence, what the check skipped, how far a board is behind its code and the timings. The
  schema is in `shared/protocol/code-check.ts`. `./history` is the answers of the locality and
  footprint routes and the label of a commit's attribution, from `shared/protocol/` and
  `shared/schemas/`.
- `./code-check-run` reads the boards to check, runs the pass and reads the plans an agent names.
  `./history-lens` creates the behind and locality readings and reads a footprint. `./code-facts`
  creates the code facts and finds a symbol, which the code opener uses to place a line.
- The language servers have no api file, because no code outside the package imports them. The code
  check opens them through its own session. A name needs a caller outside the package before it
  becomes public.
- `runtime/operations/` holds the reading and judging: `code-facts/` has the language-agnostic
  facts, `modules/` for what a module exposes, and one folder for each language or format
  (`typescript/`, `python/`, `c/`, `csharp/`, `objc/`, `swift/`, `nix/`, `kubernetes/`, `compose/`,
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

The eleventh is `renderer` (`@archboard/renderer`). It draws a board as a picture. It adopts the `api/` role for
`shared/`, `runtime/` and `ui/` and exposes 8 subpaths with 61 names, where code outside imported 10 module paths and
two asset paths. It imports `board`, `timing` and `process`, and nothing from `src/`. The 2 files of `shared/api/` and the
1 file of `ui/api/` are safe for the browser, with no Node import. The 5 files of `runtime/api/` are Node-bound and run
only in Bun.

- `shared/` holds the picture code that the browser and Bun both run. `rules/` is the pure code: `render/` has the entry
  points and the host contract, `text/` the measurement and the fonts, `engine/` the layout engine and its worker pool,
  `layout/`, `track/` and `blocks/` the three ways to lay a board out, `flowchart/`, and `svg/` the painters. These
  four folders split by behavior (`blocks/tree/`, `track/routes/`, `svg/parts/`), not by a longer file prefix.
  `constants/` holds the spacing, the typography and `shell-geometry.ts`, and `protocol/` holds what a render asks and
  answers.
- `runtime/` holds the Bun host. `services/bun-host.ts` installs the `@napi-rs/canvas` canvas, the diagram fonts, the
  theme colors and the pool of layout workers. `processes/layout-worker.ts` is the worker thread, started with
  `new URL("../processes/layout-worker.ts", import.meta.url)`. `operations/` has the render and measure entry points, the
  icon paths and the bounds, PNG and receipt of the rasterizer. `services/rasterizer/` is the rasterizer,
  `processes/headless-chromium/` and `clients/headless-chromium/` are the private Chromium and its DevTools client, and
  `store/` reads the theme stylesheet and names where the assets are.
- `ui/` holds the browser host. `state/` keeps what the page loads once (the faces, the icons, whether the renderer has
  started) and `workers/` holds the browser layout worker. `api/browser.ts` starts the renderer with
  `startBrowserRenderer({ avoidWasmUrl })` and draws a board with `drawBoardHere`. The worker is started inside the
  package with `new Worker(new URL("../workers/layout-worker.ts", import.meta.url), { type: "module" })`, which Vite
  bundles into its own chunk. So there is no `./worker` subpath: no code outside the package runs the worker. The page
  tells the worker where the routing engine's WebAssembly is, because `frontend/main.tsx` finds it in the root
  `node_modules`, where `libavoid-js` does not export it.
- `./picture` is what a pane reads of a picture besides its pixels: the key it lists, the inks and marks the canvas draws
  with, the code warnings, and what a render asks and answers. `./shell-geometry` is the shell's fixed geometry and the
  page shape that boards are laid out for. `./browser` is the browser host. `./bun` draws with the Bun host:
  `renderBoard`, `renderArchitecture`, the diagram icon paths and the text width. `./rasterizer` is the bitmap of a
  picture and the receipt of the capture. `./headless-chromium` is the private Chromium, which the walkthrough recorder
  and the README scripts also start. `./theme` reads the colors of the shared stylesheet.
- The assets live in `assets/`, next to `src/`: `assets/fonts/` holds Onest, DM Mono and Big Shoulders Display with their
  OFL texts and `README.md`, and `assets/theme.css` holds the colors of both themes. No package file reads a `src/`
  path. `./assets` exports `DIAGRAM_FONTS_DIRECTORY` and `THEME_STYLESHEET`, computed from the package's own place. The
  server's `/assets/diagram-fonts` route, `readme:assets` and the theme parity test take the path from there.
  `src/ui/theme/app.css` is not a package file, so it names `packages/renderer/assets/` with relative `@import` and
  `url()` paths, which Vite resolves. `vite.config.ts` hashes `packages/renderer/src/shared`, `src/ui` and the Bun worker
  into the renderer build, so a picture kept by an older build is never shown.
- Tailwind scans the `ui` area of every package, and the renderer's `ui` area holds no class names. The browser
  measurement contract (`tests/system/browser/measured-text.test.ts`) holds the Bun canvas, which loads from the root
  `node_modules`, to what Chrome draws.
- The tests are in `tests/`. `shared/rules/` tests the pure code. `runtime/operations/<behavior>/` holds the
  whole-picture suites, with their fixtures in `runtime/support/fixtures/`. `runtime/services/rasterizer/`,
  `runtime/processes/headless-chromium/` and `runtime/store/theme/` test the rest. A few tests read board fixtures from
  `docs/design/` and the vault of this repository, by a relative path from the test file.

The twelfth is `code-opener` (`@archboard/code-opener`). It opens the code a node binds in the person's editor. It
adopts the `api/` role for `server/` and `ui/` and exposes 4 subpaths with 13 names, where code outside imported
5 module paths. It imports `board`, `code-binding`, `code-intel`, `workspace` and `server-requests`, and
nothing from `src/`. The 2 files of `ui/api/` are safe for the browser, with no Node import. The 2 files of
`server/api/` are Node-bound and run only in Bun.

- `./opener` is the server's side of the open: the router and the pre-guard of the open and settings routes, the
  plan of an opener command and its launch. `./browser-origin` is the guard that refuses a request from a page that is not
  Archboard's own and the CSRF check that a socket upgrade makes. The pre-guard puts the guard in front of every opener
  route, and the other routes of the server take the guard from the same file.
- `server/routes/` holds the router. `projections/` turns a selection and a bound path into the command to run, the
  target inside a vault and the line that defines a symbol, which asks `code-intel` for the code facts. `lifecycle/`
  launches the editor. `store/` holds the opener configuration, a file in the state directory that
  `@archboard/workspace/atomic-write` writes. It is in `store/` because lint refuses a `node:fs` import in a `state/`
  folder. `middleware/` holds the guard and the CSRF check.
- `./code-target` asks the server to open the code a subject is bound to and gives the notice that the outcome
  deserves. `./opener-settings` is the dialog that sets which editor opens the code, and the flow it runs against. The
  flow reads, tests, saves and resets through `ui/clients/code-target-requests.ts`, which parses each reply strictly
  against the schemas of `code-binding/opening`.
- `ui/` keeps the dialog's `components/`, the flow's `hooks/` and `state/`, the endpoints in `clients/` and the pure
  command rules in `rules/`. Tailwind finds the dialog's class names through the `@source` of every package's `ui`
  area.
- The tests are in `tests/`: `server/middleware/`, `server/projections/` and `server/store/` test the server files,
  `ui/rules/` and `ui/state/` the browser files. The end-to-end owners stay in `tests/system/code-targets` and
  `tests/system/browser/opener-settings.test.ts`.

The thirteenth is `walkthrough` (`@archboard/walkthrough`). It records a narrated walkthrough of a board to a video
(ADR 0035, ADR 0041). It adopts the `api/` role for `shared/` and `runtime/` and exposes 4 subpaths with 38 names,
where code outside imported 4 module paths. It imports `board`, `timing`, `workspace` and `renderer`, and nothing from
`src/`. The 2 files of `shared/api/` are safe for the browser, with no Node import: the recording page and the replay
page import them. The 2 files of `runtime/api/` run only in Bun.

- `./recording` is the contract that the recording page and the command that drives it agree on: the address that opens
  the page as a recording, the global it publishes its state on, the container and the language of a recording, and the
  narration that the voice is told. `./talk` is the talk that the page keeps (the voice and a log stamped on its
  samples), the frames drawn from it, the schema of a talk on disk and the address that opens the replay page. They are
  `shared/protocol/recording-page.ts` and `shared/protocol/talk.ts`. The language schema is in `shared/schemas/`.
- `./recorder` records a walkthrough, renders a kept talk again and reads and writes a talk in the state directory. It
  is `runtime/operations/` (`record-walkthrough.ts`, `render-talk.ts`, the frame order and the error), the page client of
  `runtime/clients/`, the talk files and the silent WAV of `runtime/store/`, and the choice of an encoder and a browser
  in `runtime/services/recording-tools.ts`. The browser is the private Chromium of `@archboard/renderer/headless-chromium`.
- `./ffmpeg` finds the ffmpeg that encodes a recording. The encoder is `runtime/processes/video-encoder.ts`, the ffmpeg
  child, and `runtime/services/ffmpeg.ts` finds and proves it: `ARCHBOARD_FFMPEG`, else `ffmpeg` on `PATH`, else
  `nixpkgs#ffmpeg-headless` through Nix. No file of the package reads an asset by a path, so nothing depends on where the
  package sits.
- The tests are in `tests/`: `shared/protocol/` holds the talk's contract, `runtime/store/` the talk on disk,
  `runtime/clients/` the page client, `runtime/operations/` the browser flags of the render and `runtime/services/` and
  `runtime/processes/` the encoder. The end-to-end owners stay in `tests/system/server-state/walkthrough-*.test.ts`.

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
