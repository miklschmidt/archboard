# Source layout and boundaries

Domain terms live in `CONTEXT.md`. This file defines where Archboard source lives, which
folder can import which, and who owns a test. Oxlint enforces it (`bun run lint`).
The decision is [ADR 0055](../adr/0055-packages-own-behavior-and-apps-compose-it.md).
The app migration history is in `docs/design/apps-migration.md`.
`tests/system/repository-policy/package-graph.test.ts` declares the package layers and refuses upward imports and cycles.

## Layout

Product source lives in workspaces. The root `package.json` lists `packages/*` and `apps/*` in
`workspaces`, and `bun install` links each one into `node_modules`.

```text
packages/<name>/   # a library that owns one behavior. See Packages.
apps/<name>/       # a process entry that nothing imports: cli, server, web. See Apps.
crates/<crate>/    # a Rust crate of the root Cargo workspace (ADR 0057)
tests/system/      # repository, process, browser and full-product tests across owners
scripts/, tools/   # repository scripts and the Oxlint plugin
vite.config.ts     # the build host of the browser app
```

There is no top-level `src/` or `frontend/`, and no `@/` alias. Lint refuses a source file in
either root and an import that starts with `@/`.
`tests/system/repository-policy/workspace-layout.test.ts` holds the end state.

The named areas below `src/` are `shared`, `runtime`, `server`, `ui`, and `cli` in the CLI app.
A package can also hold files and folders outside these areas, such as `src/types.ts` or `src/types/`.
Each area has role folders, and a role folder has one folder for each behavior. See [Area directions](#area-directions). For frontend concern placement, naming, and
React ownership, read [frontend.md](frontend.md).

The entries are `apps/cli/src/bin.ts`, `apps/server/src/server.ts` and `apps/web/src/main.tsx`.
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
    <area>/<role>/  # areas: shared, runtime, server, ui. Roles: constants, rules, store, ...
    <area>/api/     # the interface files of an area, in a package that adopts the role
  tests/            # internal tests, in folders that follow the areas
```

A package has no `lib/` folder and no `index.ts` barrel. Name the role of a folder, such as
`constants`, `schemas`, `rules` or `operations`, and let a folder that grows past about 12 files
split by behavior.

- **`exports` is the interface.** Each value names a source file under `src/` or a public asset under `assets/`. There is no build step, no
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
  `server/`, `renderer` for `shared/`, `runtime/` and `ui/`, `code-opener` for `server/` and `ui/`, `walkthrough` for `shared/` and `runtime/`, `process`, `skills` and `server-lifecycle` for `runtime/`, `workbench` for `shared/`, `runtime/`, `server/` and `ui/`, and `ui-kit` and `server-requests` for `ui/`. An export that is a file to run, not a module to import,
  is the one exception: `process` exports `./git-owner` as the script itself, and the test names it.
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

The first package is `timing` (`@archboard/timing`). Its `.` export holds every product duration.
Its `./voice` export holds the voice motion durations.

The second is `diagnostics` (`@archboard/diagnostics`). Its `./logger` export is the process logger
and is the only Node-bound file, in `runtime/`. The `./errno`, `./thrown-error` and
`./unknown-record` exports read a caught value without Node and are safe for the browser. The two
`errorMessage` functions differ on purpose: `./errno` says `unknown error` for a value that is no
Error or string, and `./thrown-error` stringifies it.

The third is `process` (`@archboard/process`). It owns a child process group and ends it. Its implementation
sits in `runtime/processes/`. It adopts the `api/` role for `runtime/` and exposes 4 subpaths,
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
another checkout loads nothing else first. `module-paths` is not here: it moved into `workbench`, which
derives the checkout root from `SOURCE_CHECKOUT`.

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
(layer 4) and the lower packages. It adopts the `api/` role for `shared/`
and `runtime/` and exposes 7 subpaths, where it exposed 17 files. The 2 files of `shared/api/` are
safe for the browser, with no Node import. The 5 files of `runtime/api/` are runtime-only by policy:
the browser imports none of them, though `./session` carries some Zod schemas.

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
- `./transport` is the stdio transport of `runtime/clients/`: it creates the transport and carries
  the types of its requests, notifications and server requests and its error classes.
  `runtime/operations/` settles a request, routes a reverse request and adopts the identities of a
  response. `runtime/protocol/wire.ts` decodes the JSON frames. The write-capacity test of the
  transport is opt-in too (`bunx vp run test:opt-in:capacity`).
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
`code-binding`. `server-lifecycle` imports `board`, and `board`
imports nothing back, so the old import cycle between them is gone.

The eighth is `ui-kit` (`@archboard/ui-kit`). It holds the presentation parts that more than one UI
module draws with, in the `ui` area. It adopts the `api/` role for
`ui/` and exposes 10 subpaths, where code outside imported 29 paths. Every export is safe for the browser.
`ui/components/` holds the shadcn Base UI components with their `README.md` and the dialog parts in
`dialog-parts/`; `ui/state/` holds the frame clock and the fullscreen presentation; `ui/rules/`,
`ui/hooks/` and `ui/constants/` hold the small helpers. The `components` aliases in
`components.json` name `ui/components/` as `packages/ui-kit/src/ui/components`. The shadcn CLI
resolves these paths from the repository root with no TypeScript path alias. Generated imports
still need the package-local `#` rewrite.

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
- Tailwind finds class names by scanning source files. `apps/web/src/ui/theme/app.css` turns the scan of
  Vite's root off (`source(none)`), names `apps/web/src` and names `packages/*/src/ui/**/*` with `@source`, so the
  `ui` area of every package is scanned (a bare `packages/*/src/ui` matches nothing). `tsconfig.frontend.json`
  includes `packages/*/src/ui`.
- A component used only inside the package stays private. Delete a component with no caller.

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
`code-binding`, `workspace`, `diagnostics` and `timing`. The 2 files of
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
two asset paths. It imports `board`, `timing` and `process`. The 2 files of `shared/api/` and the
1 file of `ui/api/` are safe for the browser, with no Node import. The 5 files of `runtime/api/` are Node-bound and run
only in Bun.

- `shared/` holds the picture code that the browser and Bun both run. `rules/` is the pure code: `render/` has the entry
  points, the host contract, the hand-off of a drawing to the renderer core (`paint.ts`) and the marks a pane draws
  itself (`marks.ts`), `text/` the measurement and the fonts, `engine/` the layout engine and its worker pool,
  `layout/`, `track/` and `blocks/` the three ways to lay a board out, and `flowchart/`. These folders split by
  behavior (`blocks/tree/`, `track/routes/`), not by a longer file prefix. The renderer core in `crates/` paints
  every picture (ADR 0057). `constants/` holds the spacing, the typography and `shell-geometry.ts`, and `protocol/`
  holds what a render asks and answers. `protocol/generated/core/` is the core's ignored build: its WebAssembly, its
  glue, and the TypeScript types of its contract, generated from its Rust types.
- `runtime/` holds the Bun host. `services/bun-host.ts` installs the `@napi-rs/canvas` canvas, the diagram fonts, the
  theme colors and the pool of layout workers. `processes/layout-worker.ts` is the worker thread, started with
  `new URL("../processes/layout-worker.ts", import.meta.url)`. `operations/` has the render and measure entry points, the
  icon paths and the bounds, PNG and receipt of the rasterizer. `services/rasterizer/` is the rasterizer,
  `processes/headless-chromium/` and `clients/headless-chromium/` are the private Chromium and its DevTools client, and
  `store/` reads the theme stylesheet and names where the assets are.
- `ui/` holds the browser host. `state/` keeps what the page loads once (the faces, the icons, whether the renderer has
  started) and `workers/` holds the browser layout worker. `api/browser.ts` starts the renderer with
  `startBrowserRenderer()` and draws a board with `drawBoardHere`. The worker is started inside the
  package with `new Worker(new URL("../workers/layout-worker.ts", import.meta.url), { type: "module" })`, which Vite
  bundles into its own chunk. So there is no `./worker` subpath: no code outside the package runs the worker. The
  worker loads the renderer core, whose glue fetches the core's WebAssembly beside it, and then Graphviz.
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
  `./theme.css` and the four `./fonts/<filename>` exports expose the stylesheet and fonts that the web app consumes.
  `apps/web/src/ui/theme/app.css` uses these package names in `@import` and `url()` references, which Vite resolves. `vite.config.ts` hashes `packages/renderer/src/shared`, `packages/renderer/src/ui` and the Bun worker
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
5 module paths. It imports `board`, `code-binding`, `code-intel`, `workspace` and `server-requests`. The 2 files of `ui/api/` are safe for the browser, with no Node import. The 2 files of
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
where code outside imported 4 module paths. It imports `board`, `timing`, `workspace` and `renderer`. The 2 files of `shared/api/` are safe for the browser, with no Node import: the recording page and the replay
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

The fourteenth is `skills` (`@archboard/skills`). It ships the archboard skill and evaluates it. It adopts the `api/`
role for `runtime/` and exposes 4 subpaths with 16 names, where code outside imported 2 module paths. It imports
`board`, `timing`, `renderer`, `process` and `walkthrough`. Every file is Node-bound and runs
only in Bun. The 4 files of `runtime/api/` are the interface.

- `./distribution` prepares the copy of the skill that the checkout, the installer and `generate:skill-artifacts`
  ship: the JSON Schemas that Zod renders for the board document, the vault configuration and the two authoring payloads
  (`runtime/projections/schemas.ts`), and the installation-local manual (`runtime/operations/distribution/prepare.ts`).
- `./evaluation-run`, `./grading` and `./citations` are what `bun run eval:skill` calls. The evaluation is human-run and
  never part of the gate: real Codex authors on real Flask checkouts, one blinded grader and a comparison report.
  `./evaluation-run` loads the canonical inputs of `evals/`, pins the tool versions and runs a batch. `./grading` grades a
  batch and writes the report. `./citations` reads the anchors of a document.
- `runtime/operations/runs/` holds an author run and a batch, `operations/grading/` the grading session and the blinding.
  `rules/audit/` classifies what an author ran and what it reached for, `rules/outcomes/` holds the deterministic
  checks and `rules/reports/` the comparison. `processes/` holds the child processes, the Archboard server and the Flask
  checkout of a run, `clients/` the two grader programs, `protocol/` what their event streams and answers say,
  `schemas/` the canonical inputs and the manifest of a run, and `store/` what a batch keeps on disk.
- `rules/audit/classify.ts` treats `packages/skills` as the harness's source, so an author that reads it has the
  exposure `harness-source`. It still counts the old module directory `skill-evaluation/`, for a batch recorded before
  the move. No file of the package finds a path from where it sits. A test finds the checkout with
  `@archboard/workspace/source-checkout`.
- The tests are in `tests/`, in the folder of the file they test. `runtime/support/` holds the fake `claude` and `codex`
  executables and the fixtures. Their end-to-end owner is `bun run eval:skill`, which a person runs.

The fifteenth is `server-lifecycle` (`@archboard/server-lifecycle`). It starts, finds, restarts and stops the
Archboard server, and holds the CLI's client of that server. It adopts the `api/` role for `runtime/` and exposes 9
subpaths with 71 names, where code outside imported 12 module paths. It imports `board`, `codex-app-server`,
`workspace`, `process`, `timing` and `diagnostics`. Every file is Node-bound and runs only in
Bun, and nothing in it is safe for the browser. It replaces `runtime/engine`, `runtime/semantic-board-client` and
`shared/server-startup-terminal`, which used the `shared/` name for a file that writes to a file descriptor.

- `./server` is what a command does to the server: find it, start it (`ensureServerRunning`), stop it, restart it and
  read its health, sync status and pid file. `./config` is the server URL that the CLI reads from the environment, the
  removed variable that it refuses, and the version of the install. `bin.ts` imports `./config` alone and late, because
  loading it reads `.env`.
- `./server-client` is the typed request to a running server: JSON requests, claims on a board, the panes on screen
  and how a refused board request is shown. `./request-context` is what one CLI invocation says about itself on
  every request: its board, vault, doing line, write session and expected version.
  `./semantic-board-client` reads and writes a board through the server, never through the vault.
- `./server-host` is what the server process does for itself: whether it is the entry point, its pid file, and
  whether its source or frontend bundle is stale. `./startup-terminal` is the records that a starting server writes
  down the startup pipe, for the launcher to clean up after it. `./pane-messages` is the messages that the server
  sends a pane over its socket. `./panes` is how a pane is addressed, ordered and reported.
- `runtime/operations/` holds the spawn, the restart and the cleanup of a failed start. `runtime/clients/` holds
  the two clients. `runtime/protocol/` holds what is written down the startup pipe and what the server sends a pane.
  `runtime/rules/` holds the pane layout, `runtime/store/` the pid file, `runtime/state/` the invocation's context
  and `runtime/services/` the configuration and the staleness check.
- The server entry and the version file are found with `SOURCE_CHECKOUT` of `workspace`, because the package sits
  at another depth than the module did: the spawn runs `apps/server/src/server.ts` and the version is read from the root
  `package.json` of that checkout. The staleness check watches `packages/` and `apps/` of it. The startup preload
  of `tests/system/server-state/` mocks the cleanup timing of `runtime/operations/server-startup-cleanup.ts` by path,
  because the spawn imports that private file, and `package-api.test.ts` names it.
- The tests are in `tests/`: `runtime/store/` holds the pid file, `runtime/operations/` the cleanup of a failed start
  and `runtime/rules/` the pane addressing. The end-to-end owners stay in `tests/system/`.

The sixteenth is `workbench` (`@archboard/workbench`). It is the Codex workbench: the coordinator, the workhorses, the
conversation and the voice (layer 7, the last). It came over in TASK-500.23.01 to .07, one move for each step up its
import graph, and it is complete. It holds the browser-safe contracts that the
browser and the server exchange, the Codex runtime under them (the foundation, and over it the coordinator and the
workhorses), the server side (the gateway over the runtime, and the sessions, generations and pane plumbing that wire
it into the Archboard server) and the browser UI (the transport, the conversation and the composer, then the dock, the
panes, the approvals, the queue, the agent setup and the voice). It adopts the `api/` role for
`shared/`, `runtime/`, `server/` and `ui/` and exposes 8 subpaths, each an api file that carries only the names that code
outside the package imports (TASK-500.23.08). It imports `board`, `codex-app-server`,
`diagnostics`, `process`, `server-lifecycle`, `timing`, `ui-kit`, `walkthrough` and `workspace`.
The file of `shared/api/` (`./browser-contract`) holds 12 names and is safe for the browser, with no Node import and no
path into a runtime or server area: the pane session imports it as well as the server. The 3 files of `ui/api/`
(`./controllers`, `./agent` and `./voice`) hold 58 names and are safe for the browser too. The file of `runtime/api/`
(`./runtime`) holds 8 names and the 3 of `server/api/` (`./server`, `./panes` and `./host`) hold 82, and they run only
in Bun. The browser imports none of them, and a trace from `apps/web/src` reaches no file of `runtime/` or
`server/`. `ui/` never imports the `runtime/` or `server/` of the package, and the shared files it reads are the
private ones, not the api files. An api file lists a name only when code outside the package imports it, and a test
outside the package counts as that code. The approvals, the gateway envelope and the realtime commands of the shared
contracts have no such importer, so they are private.

**Shared.**

- `./browser-contract` is what the browser and the server exchange: `BrowserSnapshot` and `BrowserTimeline`, the snapshot
  that a pane renders, and `createCodexBrowserModel`, which binds every schema to one identity authority, so nothing the
  browser exchanges can name a child, an epoch or an identity that the session did not issue. It also holds the route
  that tells the server which checkout's conversation the dock shows, and what it answers
  (`shared/protocol/shown-conversation.ts`), and the three parsers and the event type of the realtime ids (a session, an
  item and a correlation) that the process-contract tests read from the wire (`shared/protocol/realtime-contract.ts`).
  The model, the scalars and the families of the snapshot are `shared/schemas/browser/`, and the ordinary, dynamic and
  spoken approvals in it are `shared/schemas/dynamic-approval/`, with the canonical hash and the lifecycle check in
  `shared/rules/`. The gateway envelope and the realtime commands stay private.
- The dynamic approval keeps its expiry in `@archboard/timing`, so the api file does not re-export it. A caller imports
  `CODEX_APPROVAL_EXPIRY_MS` from there.
- The tests are in `tests/`: `shared/protocol/` holds the identity types of the realtime contract, `shared/rules/` the
  canonical hash and `shared/schemas/` the browser states and the dynamic approval. `shared/support/` holds the fixture
  model they share.

**Runtime.** `runtime/` keeps its code in role folders, each with one folder for each behavior. A role folder that
grew past about 12 files splits by behavior (`dynamic-tools/` has `dispatch/`, `mutation/` and `projection/` below
`operations/`). A module that is not in `runtime/api/` is private, and no private file imports an api file.

- `rules/` holds the pure decisions: `instructions/` (the two authored developer instructions, their reviewed digests and
  the context a turn carries), `thread-link/` (the classification of a target thread, the pane's binding by
  compare-and-swap and its durable evidence), `realtime/` (the presentation mode, the voice prompt and the start policy)
  `dynamic-tools/` (the authority a call runs under, the effects it may have and the validation of a call),
  `coordinator-callbacks/` (the encoding and the normalizing of a callback, and the news it carries), `coordinator-tools/`
  (the validation, the identity and the response of a coordinator tool call), `spoken-approval/` (the classifier and the
  validation of a spoken answer), `coordinator/` (the review hashes and the start profile of the coordinator),
  `workhorse-operations/` (the errors and the link provenance of an operation) and `workhorse-start/` (the model, the
  validation and the immutability of a start).
- `protocol/` holds the contracts that a tool call or a manifest states: `thread-tools/` (the `archboard_app` manifest
  and the parse of a call response), `coordinator-tool-contract/` (the reviewed voice and workhorse manifests, the
  tool inputs and results) and `dynamic-tools/` (the ports and the lifecycle events of an operation). `coordinator/`,
  `coordinator-callbacks/`, `coordinator-tools/`, `spoken-approval/`, `workhorse-operations/` and `workhorse-start/` each
  hold the `contract.ts` of that module: its options, ports and snapshots.
- `services/` holds the long-lived behaviors: `approvals/` (the broker), `workhorse-queue/`, `thread-context/` (the
  delivery of context into a thread), `realtime/` (the voice adapter) and `dynamic-tools/` (the quarantine of an
  uncertain mutation and the wait for a thread), `coordinator/` (the coordinator, its start and its reuse of an epoch),
  `coordinator-callbacks/` (the callbacks that tell the coordinator what happened, their delivery and the
  `tell_coordinator` tool), `coordinator-tools/` (the dispatcher that answers the coordinator's tool calls and its replay
  ledger), `spoken-approval/` (the gate that settles a spoken approval), `workhorse-operations/` (the port that the
  coordinator uses on a workhorse: its events, notifications and validation) and `workhorse-start/` (the start and the
  cleanup of one workhorse thread).
- `operations/` holds one act a caller asks for: `dynamic-tools/` (the dispatch of a call, its mutations and the pages
  it answers with), `thread-unload/` and `workhorse-operations/` (inspect, delegate, steer and manage the queue).
  `store/epoch/` is the durable epoch manifest. `state/` holds `wait-graph/` (the in-memory graph of waiting threads) and
  the snapshots of `coordinator/`, `spoken-approval/` and `workhorse-start/`.
- The two instruction documents and the four manifests (the voice and the workhorse manifests of the
  coordinator, and the `archboard_app` and `archboard_coordinator` namespaces) are data files that sit beside the code
  that reads them, found with `import.meta.resolve` of a `#` path, so no file depends on its own depth. Their digests are pinned in the code, and a changed byte is a review.
- `./runtime` holds the 8 names that the system tests outside the package build the gateway and the projection from, and no app imports it: the approval broker (`createCodexApprovalBroker`), the realtime voice adapter
  (`createCodexRealtimeAdapter` with its binding), the parse of a tool-call response (`parseDynamicToolCallResponse`) and
  the empty spoken approval snapshot. The coordinator, the workhorses, the epoch store, the thread link, the
  instructions, the dynamic tools, the queue and the tool manifests are private: the server area reads them through
  their defining files, and a test of one of them lives in the package.
- The tests are in `tests/runtime/`, in the folders of the code they cover. `support/dynamic-tools/` holds the fakes and
  fixtures that the dynamic-tools tests share. The capacity test of the dynamic tools is opt-in
  (`bunx vp run test:opt-in:capacity`).

**Server.** `server/` is the workbench on the Archboard server. It reads the runtime and the shared contracts through
their private files, and no private file imports an api file. The host in `apps/server/` keeps the routes and
the application. It imports only `server/api/`, and only what a route or the application itself calls: the pane
registry, the tab sessions, the request context, the wiring and the listener. Everything else (the generations, the
owners and the actions that carry out a pane's command) is private, and its tests are in the package.

- `protocol/` holds `gateway/contract.ts` (the options, the owners' ports, the connection and the gateway that the host
  wires, with the error a command is refused with), `projection/projection-contract.ts` (what the host hands the
  projection to read) and `generation/` (the components, sessions and tab sessions of a generation of the workbench in
  `contract.ts`, `session-contract.ts` and `generation-contract.ts`, and `host.ts`, what a generation needs of the
  server around it).
- `rules/` holds `tab-session/` (the tab session id and the key that links one to the workhorse of a checkout),
  `snapshot/` (the byte budget of a snapshot and a delta, the fit and the diff that keep them inside it, and the
  redaction of secret keys), `timeline/` (bounding the text and evidence of a timeline item), `pane/` (what a pane's
  board key names, and the pane that work nobody's command started presents through), `semantic-context/` (the sentence
  that describes a variant, and the subjects a narrated step highlights) and `generation/` (the readiness a pane is shown
  and the failures a generation reports).
- `projections/` turns the owners' state into what a pane or the voice reads. `browser-state/` is the snapshot a pane
  renders: the timeline, the thread link, the ordinary, dynamic and spoken approvals, the workhorse list and the voice
  context, and the whole of it in `projection.ts`. `timeline/` reads a thread into the timeline within its budget.
  `semantic-context/` is the board as an agent is told it (`board-context.ts`, `semantic-input.ts`), the walkthrough step
  the voice explains, and the canvas of a tab.
- `services/gateway/` is the gateway: `gateway.ts` takes a connection, and its connections, execution (the command
  surface and the cache a retry is answered from) and leases files hold what one connection and one command need.
  `services/lease/` is the ledger and the manager of the browser command leases. `operations/command/` admits a browser
  command (the readiness, the thread link and the lease it needs) and dispatches it to the one action that carries it
  out, so a command with no action is not one this gateway serves.
- `services/generation/` composes one generation of the workbench over a Codex child (`workbench.ts`, `compose.ts`,
  `factories.ts`, `hooks.ts`, the bindings and the owners record) and tears it down in order (`lifecycle.ts`,
  `shutdown-steps.ts`, `operation-lifecycle.ts`). `services/owner/` is the owner that lives for one server application
  and replaces generations (`lifecycle.ts`, `owner-state.ts`, `owner-transitions.ts`), the application stage and the
  production installation, and the wiring that panes reach the workbench through (`wiring.ts`, with its state in
  `wiring-hooks.ts` so that the pane context can publish without importing it back). `services/sessions/` holds the tab
  sessions of a generation, how one ends, its workhorses, what each owner is bound to, the panes it is read through,
  the delegations and the checkouts. `services/actions/` is what a pane's command does: the account, the dynamic and
  ordinary approvals, the queue, the text and the thread link. `services/voice/` is one tab's voice session, the
  outcome the coordinator is told, the start trace and the transcript. `services/dynamic-tools/` is the authority,
  routing and wait of a dynamic tool call. `services/browser-socket/` publishes to the sockets of a browser.
  `services/panes/` is the pane registry, the pane presentation, the tab sessions, the context each pane last
  reported and the settled change feed. `services/request/` reads the board and the vault a call names, and
  `services/host/` holds where the server listens and which checkout it runs (`module-paths.ts` takes it from
  `SOURCE_CHECKOUT`, so no depth decides). The frontend directory is the host app's: `apps/server` serves
  `SOURCE_CHECKOUT/dist/frontend`.
- The 3 api files group what a caller does. `./server` is the workbench on the server (24 names): the wiring through
  which panes and routes reach it (its hooks, its preparation and stop, the browser socket owner); the gateway and the
  projection of the browser state, which the system tests compose with the runtime pieces; the actions of a tab's voice
  session and the route of the voice start trace; and the tab sessions, that is, which tab a pane belongs to, the
  conversation a tab shows and the tab session id. `./panes` is the open panes, their sockets and the broadcast every
  write announces through, with the settled change feed, the context the panes report and the steps they present (38
  names). `./host` is the vault and the body a call names and where the server listens (20 names).
- The tests are in `tests/server/`, in the folders of the code they cover. `support/generation/` holds the fake
  owners, fixtures and harness that the generation, owner, session, action and timeline tests share, and
  `support/gateway/` those of the gateway and the projection tests. Only the tests of the host's own routes, lifetime
  and startup stay in `apps/server/tests/`.

**Ui.** `ui/` is the browser side of the workbench: the transport, the conversation and the composer (TASK-500.23.06),
and over them the dock, the panes, the approvals, the queue, the agent setup and the voice (TASK-500.23.07). The
web app (`apps/web/src/ui`: the application, the shell, the pane session, the walkthrough replay and the rest) imports the
api files. A private file reads the shared contracts through their defining files (`#shared/...`), never through an
api file. `ui/` keeps its code in the role folders that `code-opener` uses, with one folder for each behavior.

- `components/` holds the React components: `thread/` (the conversation as a person reads it, with the files placed
  from the assistant-ui registry and the README that records them), `runtime/` (the provider of the assistant-ui
  runtime), `dock/` (the agent dock and its plan, details and pending work, with the README of the agent surfaces),
  `panel/` (the conversation panel, its composer, approval cards and sign-in), `voice/` (the voice box, the voice
  control and the key of a presentation), `orb/` (the voice orb and its stage) and `subtitles/` (the words of the
  voice and their toggle). `hooks/` holds `runtime/` (the hook that reads the conversation), `thread/` (the copy hook
  of the registry), `dock/` (the dock's motion and circle), `voice/`, `orb/` and `subtitles/`.
- `state/` holds the contracts and the controllers that own state without React: `transport/` (the transport's typed
  surface and its error), `timeline/`, `thread-link/` (the contracts, the port a transport satisfies and the
  controller), `composer/` (the contract and the controller the assistant-ui composer submits through), `realtime/`
  (the neutral realtime contract, the ports of the media session and its contract), `surfaces/` (what the agent
  surfaces read and act through, and the composer's draft store), `agent-setup/` (the setup that a message or a press
  of Talk carries itself through), `approvals/` and `queue/` (the contracts, the transport port and the controller of
  each), `voice-session/` (the contract, the session and the level channel), `orb/` (the stage that flies the orb) and
  `subtitles/` (the person's wish to have them).
- `clients/` holds what talks to the server or the browser platform: `transport/` (the socket reducer, its session,
  lease, command and prepared-action owners), `wire/` (the parsers of what the socket carries), `realtime/` (the
  WebRTC media session and its start sequence), `media/` (the owner of the microphone, the mute and the audio
  elements over one transport), `output-level/` (the measured level of the model's voice) and `orb/` (the canvas
  painter and the runner that draws the orb every frame).
- `rules/` holds the pure decisions: `transport/` (which commands the state answers and what a command is bound to),
  `timeline/` (the projection of the server's timelines into turns), `thread-link/` (how a link command settles),
  `runtime/` (turns into assistant-ui messages), `thread/` (the words of an activity run) and `composer/` (intent,
  draft policy, keys and the link a composer reads), `dock/` (the agent's one-line status, the plan steps, the circle's
  state and the projection of approvals into cards), `agent-setup/` (the phase), `approvals/` and `approval-forms/`
  (the families, choices, disclosure and status of an approval; its fields, form, validation and reviewed answer),
  `queue/` (order, projection, correlation and narratives), `voice-session/` (binding, failure, narration and the
  projection of the session into a view), `orb/` (colors, dynamics and flight) and `subtitles/` (cues, measured lines
  and recency).
- assistant-ui is imported only in the `thread/` and `runtime/` folders of these role folders, and
  `@assistant-ui/react-markdown` only in `thread/` (the lint rule `archboard/assistant-ui-imports`). The `subtitles/`
  folders of `components/`, `hooks/`, `rules/` and `state/` read no browser clock: they ask the frame clock of
  `ui-kit`, so a recording renders them frame by frame (the override in `.oxlintrc.jsonc`). Tailwind finds the class
  names through the `@source` of every package's `ui` area.
- The 3 api files group what the web app imports. `./controllers` is the transport and the controllers over it (12 names):
  the transport with its state, and the controllers of the thread link and sign-in, the approvals, the queue and the
  composer. `./agent` is the agent as the application shows it (18 names): the setup that a message or a press of Talk
  carries itself through, the dock and the panel with the view and actions they take and the draft store, the hook that
  reads the conversation, and the projection of the server's timelines into turns. `./voice` is the voice (28 names): the
  voice session, the media owner with its audio elements and the snapshot of the realtime session, the measured output
  level, the orb's stage, the subtitles with the person's wish to have them, and the voice box with the key of a
  presentation. The rendered conversation and the words of its activity (`Conversation`, `activityLabel`, `runSummary`)
  are private: the panel in the package renders them.
- The tests are in `tests/ui/`, in the folders of the code they cover. `support/` holds the fake socket and fixtures
  of the transport, the harness of the prepared commands, the fakes of the media session and the media owner, the
  fixtures of the thread link, the composer, the approvals, the queue, the agent setup and the voice session, and the
  identities and voice fixtures of the dock.

## Apps

An app is a layer-8 workspace in `apps/<name>/` that holds what the packages left (TASK-500.24,
`docs/design/apps-migration.md`). It is private, has no `exports`, and `apps/*` is in the
`workspaces` field. The lint plugin holds an app to the rules of a package, with these differences:

- **Nothing imports an app.** Only the app's own source and tests reach its files. A package, another
  app, a script and a test of another owner are refused, and so is the `@archboard-app/<name>`
  workspace name, even from the app itself.
- **An app imports a package only through its `exports`.** Inside an app, imports use the `#`
  entries of its own `package.json`, as in a package. A `#` import that names no existing file is
  an error whoever owns the importing file.
- **An app has areas and role folders like a package.** `apps/web/src/ui/<role>/<behavior>/`,
  `apps/cli/src/{cli,runtime}/`, `apps/server/src/server/`. The thin entries are
  `apps/cli/src/bin.ts`, `apps/server/src/server.ts` and `apps/web/src/main.tsx`; the last counts as
  browser code. Other files directly in `src/` and a folder beside `src/` and `tests/` that holds
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

- `src/cli/` is the `cli` area. `protocol/` holds the command contract (`contract/`: the
  `defineCommand` shape, the answer schemas, the refusal and shared-option tables) and the shape of
  a command-table entry (`routing/`). `rules/` holds the pure parts: the Commander projection and
  argv parser, the introspection that feeds the generated proof, the registry, dispatch, global
  flags and help, the staged tokens, and for the `semantic` commands the answers they build
  (`semantic/compare`, `semantic/inspect`, `semantic/draw`). `clients/server/` makes sure the server
  a command needs is running. `store/artifacts/` writes a command's file artifacts. `operations/`
  holds the commands themselves, one folder per command family (`claim`, `pane`, `repo`, `server`
  with `status`, `vault`, `install-skill`, and `semantic/{board,input,inspect,compare,history,draw}`)
  and the machinery that runs one invocation: `invocation/` (the one command table in `run.ts`, the
  session and the vault an invocation addresses), `execution/` (running and presenting one
  contract), `bootstrap/` and `contract-artifacts/` (the generator behind
  `bun run generate:cli-contract`).
- `src/runtime/` is the `runtime` area, for the native clipboard: `clients/clipboard/` copies one
  image through a detached owner process that `copy-image.ts` forks by file URL, and
  `protocol/clipboard/` is the message pair between them.
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

- `src/server/` is the `server` area. `wiring/` joins the parts: `application/` mounts every middleware and
  route in the order Express runs them, `http/` holds the one Express app and the factory seam of its HTTP
  listener, and `owners/` holds the owners that the lifetime and the routes share. `lifecycle/` holds the
  lifetime of the server's resources and the admission of mutation work (`lifetime/`), the start of the process
  with its signals and phase (`startup/`) and the resources it closes (`resources/`). `routes/` holds one
  folder for each route group: `semantic-boards/` (edit, discard, move, rename and the claim), `panes/`,
  `repositories/`, `code-check/`, `footprint/`, `locality/` and `service/` (the page, health and the
  served vault). `middleware/mutation-work/` runs a request's work under its lease. `sockets/panes/` accepts the
  pane sockets, `watchers/semantic-boards/` watches the board files on disk, `state/` holds the pane vaults, the
  agent activity and the memory of code findings, `projections/board-announcements/` turns a lock or a doing line
  into what a pane hears, `services/checkout-work/` owns the machine-local checkout work, `rules/footprint/`
  picks the variants a footprint reads and `protocol/semantic-write/` is what a write request must prove.
- The app reads the pane and tab services, request context and listener address through the exports of
  `packages/workbench`. It mounts that package's pane context and voice trace routes, and the router of
  `packages/code-opener`.
- The tests are in `tests/server/`, in the folders of the code they cover. `lifecycle/lifetime/` also holds the
  proof that a stop force-reaps a real process group. The system tests that start the whole server stay in
  `tests/system/`.

### `apps/web`

`apps/web` is the browser app (TASK-500.24.04 and TASK-500.24.05). It holds the whole browser UI, its
entry, the page and the stylesheet. Inside the app a file is `#ui/components/semantic-board-canvas/LevelMark.tsx`. No
behavior has an index: a caller imports the file that defines a name.

- `src/main.tsx` is the browser entry. It starts the pictures drawn in the page and mounts the application or the
  renderer of a recorded talk. `index.html` and
  `favicon.svg` sit beside `src/`; Vite takes `apps/web` as its root and writes the bundle to the repository's
  `dist/frontend`, which `apps/server` serves. `index.html` links `/src/ui/theme/app.css`. That file is the only one in
  `src/ui/theme/`, because a stylesheet is no role; the plugin judges TypeScript only. Its `@source` paths are
  relative to it. `vite.config.ts` stays at the repository root and names the root, the output and the dev server's
  `fs.allow`, which lets the dev server serve `packages/` and `node_modules` outside the root.
- `src/ui/` is the `ui` area. Each behavior is a folder under each role it needs.
  `application` owns the root, the pane records and lists, the agent surfaces and the workspace port.
  `shell` owns the frame, navigator and rows. `pane-session` owns one pane's socket, status, reading and registration.
  `board-routing` owns the address bar as the workspace. `board-catalog` owns the listing of boards and its cache.
  `board-move`, `vault-diagnostics`, `walkthrough-recording` and `walkthrough-replay` complete the shell behaviors. The canvas is the `semantic-board-canvas`
  behavior, the name that the frame-clock override of `.oxlintrc.jsonc` matches, and the variant lifecycle is
  `variant-lifecycle`. `rules/` holds the pure parts, `state/` what outlives a render (stores, the pane core, the
  recorder), `clients/` what touches the outside (the server calls, sockets, storage, audio, the page's own
  document), `components/` and `hooks/` the React code. `clients/renderer-build/` holds the declaration of the
  `virtual:archboard-renderer` module that `vite.config.ts` serves, a `.d.ts` that sits in a role folder because the
  files directly in `src/` are for entries.
- The canvas has no index either. Its parts are in `rules/` (`camera/`, `walkthrough/`, `drilling/`, `board/`,
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
