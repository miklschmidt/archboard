# Source layout and boundaries

Domain terms live in `CONTEXT.md`. This file defines where Archboard source lives, which
folder can import which, and who owns a test. Oxlint enforces it (`bun run lint`).
The decision is [ADR 0055](../adr/0055-packages-own-behavior-and-apps-compose-it.md).
[ADR 0057](../adr/0057-an-interface-is-the-few-operations-its-callers-need.md) decides how wide a package interface may be.
The app migration history is in `docs/design/apps-migration.md`.
`tests/system/repository-policy/package-graph.test.ts` declares the package layers and refuses upward imports and cycles.

## Layout

Product source lives in workspaces. The root `package.json` lists `packages/*` and `apps/*` in
`workspaces`, and `bun install` links each one into `node_modules`.

```text
packages/<name>/   # a library that owns one behavior. See Packages.
apps/<name>/       # a process entry that nothing imports: cli, server, web, workbench-example. See Apps.
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
- **An interface is the few operations its callers need** (ADR 0057). Design it from the jobs that
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
  Private production files never import an api file, because the api files sit above them. `board`,
  `codex-app-server`, `code-binding` and `code-intel` adopt it for `shared/` and `runtime/`, `workspace` also for
  `server/`, `renderer` for `shared/`, `runtime/` and `ui/`, `code-opener` for `shared/`, `server/` and `ui/`, `walkthrough` for `shared/` and `runtime/`, `process`, `skills` and `server-lifecycle` for `runtime/`, `codex-realtime-voice` and `workbench` for `shared/`, `runtime/`, `server/` and `ui/`, and `ui-kit` and `server-requests` for `ui/`. An export that is a file to run, not a module to import,
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

The first package is `timing` (`@archboard/timing`). Its one `.` export holds every product duration,
grouped by the subsystem that owns it. Each owner has one frozen group in a file of its own, such as
`BOARD_LOCK_MS`, `CODEX_PROCESS_MS`, `SERVER_LIFECYCLE_MS` or `PANE_MS`, and each key has what it
pulls against written beside it. A caller imports its owner's group and reads a key of it. A
computation that callers would repeat from a group is one function of the package, such as the
Codex restart backoff `codexRestartDelayMs`. A duration with one owner and no siblings stays one
named constant. The six flat names that only the renderer imports, such as
`SEMANTIC_RASTER_JOB_TIMEOUT_MS`, stay until its rewrite lands.

The second is `diagnostics` (`@archboard/diagnostics`). Its `./logger` export is the process logger
and is the only Node-bound file, in `runtime/`. The `./errno`, `./thrown-error` and
`./unknown-record` exports read a caught value without Node and are safe for the browser. The two
`errorMessage` functions differ on purpose: `./errno` says `unknown error` for a value that is no
Error or string, and `./thrown-error` stringifies it. The package imports no other package, so a
package that runs outside Archboard can carry it.

The third is `process` (`@archboard/process`). It owns a child process group and ends it. Its implementation
sits in `runtime/processes/`. It adopts the `api/` role for `runtime/` and exposes 4 subpaths,
where it exposed 6 files. It imports only `timing` and `diagnostics`, so a package that runs
outside Archboard can carry it. `./observation` reads the process table. `./git-group` carries the
operations on the group of a Git command, for the Git client of `workspace`: capturing it, asking
whether it or another member exists, and the TERM-then-KILL end of it. `./codex-group` carries the Codex process-group operations and
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
command, which uses `node:path`, so the browser never imports it. Its `gitCheckoutOfVault` asks
Git synchronously for the checkout that holds a vault, its root and identity, for the vault check
that every open canvas polls and that cannot wait for the asynchronous lookups. The registry's
`repositoryOfVault` is exported as `registeredRepositoryOfVault`, because `./repository-listing`
defines a different `repositoryOfVault`, the one that the server projection answers with.
`./vault` finds a vault as ADR 0049 says. `findVault` only finds it, for a command that asks
where it is without registering anything. `findAndRegisterVault` is what a command does before it
starts: it finds the vault, registers the checkout or untracked vault that holds it when the registry
does not know it, and answers with the vault, what it registered, or why the registry could not be
written, which does not refuse the command. The CLI words its line on stderr from that answer.
`./source-checkout` finds the checkout whose source runs, and
`./atomic-write` and `./state-dir` write files durably and name the state directory.
`./repository-listing` is the answer of `GET /api/repositories`, in `server/api/`. `source-checkout`
finds the checkout by walking up to the nearest directory that is an archboard checkout, so the
depth of the file decides nothing, and `bin.ts` loads it lazily, so a command that hands itself to
another checkout loads nothing else first. `module-paths` is not here: it moved into `workbench`, which
derives the checkout root from `SOURCE_CHECKOUT`.

The fifth is `code-binding` (`@archboard/code-binding`). It knows what a node's code binding is and
where its path lives in a checkout. It adopts the `api/` role for `shared/` and `runtime/` and
exposes 2 subpaths with 18 names, where it exposed 9 files. Everything in `shared/api/` is safe for
the browser, with no Node import. `./bindings` holds the binding, anchor and document-reference
schemas and the files a binding names. `board` imports them and the resolver parses with
`CodeBindingSchema`, so they stay here. `./resolution` is Node-bound, in `runtime/api/`. It captures
the registered checkouts and the paths of some bindings once, then resolves a binding or a
repository against that snapshot alone. It also carries the result types and the resolution rules
that the snapshot feeds. It finds the checkout that holds a vault, and the checkouts in which a
reader of that vault resolves identities. The resolver names its own failure codes, and the open contract in
`code-opener` holds each of them. The wire contract of the open, the opener settings and the GitHub
link of a binding are not here: only the code opener reads them, so they live in `code-opener`.

The sixth is `codex-app-server` (`@archboard/codex-app-server`). It owns one private Codex app-server session over stdio.
It holds protocol contracts, the process owner, the stdio transport, and the session.
It imports the lower process, workspace, diagnostics, and timing packages.
It adopts the `api/` role for `shared/` and `runtime/` and exposes six subpaths.

The two shared entries are safe for the browser. The four runtime entries run only in Bun.
Archboard owns board context in `workbench` through its `./semantic-context` entry.

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
  about its write, `format/` (the decode and the schema migrations), `lock/` (the one-writer
  lease, its claims and its announcements) and `memory.ts` (the one forget of everything the
  process remembers about boards). `former-names.ts` is private.
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
- `./lock` is the one-writer lease: an agent's claim and its release, the take-back
  (`takeBackBoard` revokes a claim and gives the lease straight back), the claim this server lost
  with the reason it is told once, the lock state, what announces a change of it, and
  `forgetBoardMemory`, which a stopping server calls once. `holdBoard` and `releaseHold` stay public
  only for the process fixture that holds a lease in a child process.
- `./store-move` moves a board to another repository's vault and previews that move.
- `./store-write` is the write boundary, the transitions it applies, the discard and acceptance of
  a board, and the outcome of a propagation to drill-downs. `renameSemanticBoard` is the rename as
  one operation: it writes the new name and carries this server's claim and the doing lines to it,
  so a caller only points its panes.

The package has no barrel. In the old `index.ts`, the names of the document, the input, the render
reply, the reconciliation and the comparison came from one import. An importer now names the api
file that carries each name. `semantic-board-store/index.ts` and `engine/board.ts` forwarded names, and both are gone. `./integrity`, `./positions`, `./primitives`,
`./reconcile-candidate` and `./reconcile` were exported only because the store imported them. The
store is inside the package now, so these five are private, and no file outside the package
imported one. `board` imports only `timing`, `diagnostics`, `process`, `workspace` and
`code-binding`. `server-lifecycle` imports `board`, and `board`
imports nothing back, so the old import cycle between them is gone.

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
  `Dialog.Description`, `Dialog.Footer`, `Dialog.Trigger`, `Dialog.Close` and the shared
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
file, `ui/api/server-requests.ts`, with 10 names, where the module was imported through one path.
It carries the request helpers (`json`, `post`, `mutation`, `strictReply`, `cancellable`), the
vault and board query builders (`inVault`, `boardQuery`) and the vault a page opens in
(`learnServedVault`, `servedVault`). The reply guards `isRecord` and `trustReply` stay private. It
holds the one module-level value, the served vault, which the page learns once before it draws.

The tenth is `code-intel` (`@archboard/code-intel`). It is what the code says about a board. It holds
the code facts of a checkout and the code check of a board's claims. It also holds the history lens
over Git and the language servers that resolve a name. It adopts the `api/` role for `shared/` and `runtime/` and exposes 5
subpaths with 16 names, where code outside imported 7 module paths. It imports `board`,
`code-binding`, `workspace`, `diagnostics` and `timing`. The 2 files of
`shared/api/` are safe for the browser, with no Node import: the canvas imports them. The 3 files of
`runtime/api/` are Node-bound and run only in Bun.

- `./code-check` is the answer of the code check and the answer of the route that remembers it:
  `CodeCheckAnswer` and `RememberedFindings`, with their schemas. The schema is in
  `shared/protocol/code-check.ts`. `./history` is the answers of the locality and footprint routes
  and the start of a period, from `shared/protocol/`. It also gives the label of a commit's
  attribution, from `shared/schemas/`. A part of an answer, such as a finding, a skip, a timing or a commit, has no
  public name. A reader names it by its place in the answer, such as
  `CodeCheckAnswer["findings"][number]`.
- `./code-check-run` gives one operation for each job. `createCodeCheck()` makes the code check,
  and its `run` does the whole pass: it reads the boards to check and the plans an agent names,
  reads the claims and behind side by side, and gives the answer. A draft that no board has, or a
  plan the check does not read, gives a refusal (`NO_SUCH_DRAFT`, `PLAN_REFUSED`) with its words.
  The code check keeps what behind read, so a server makes one. `checkCandidateCode` and
  `suggestHistoricalCommits` check the candidate of a correction. `./history-lens` makes the
  locality reading and reads a footprint. `./code-facts` is `symbolLine`: the line that defines a
  binding's symbol in the one file the binding names. The code opener opens the file at that line.
- The steps of a pass, behind, the code facts reader and the language servers have no api file. The
  code check opens the language servers through its own session. The package's tests reach the
  steps and the readings through `tests/runtime/support/code-check/pass.ts` and
  `tests/runtime/support/history-lens/lens.ts`.
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
  tells the worker where the routing engine's WebAssembly is, because `apps/web/src/main.tsx` finds it in the root
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
adopts the `api/` role for `shared/`, `server/` and `ui/` and exposes 5 subpaths with 13 names, where code outside
imported 5 module paths. It imports `board`, `code-binding`, `code-intel`, `workspace`, `server-requests` and `ui-kit`.
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

The `codex-realtime-voice` package (`@archboard/codex-realtime-voice`) owns reusable Codex conversations and realtime voice.
It runs one private app-server process with separate coordinator and workhorse histories.
Each browser tab has one coordinator and one workhorse per admitted checkout.
The package sits at layer 6 and reads only its Codex, process, workspace, diagnostics, and timing foundations.
It imports no Archboard board, vault, walkthrough, pane, or server-lifecycle module.

Its public entries separate browser code from Bun code.
`./contract` holds shared snapshots, gateway messages, commands, and their identity-bound schemas.
`./realtime` holds the realtime server contract, transcript events, state transitions, and delivery outcomes.
`./browser` holds the browser transport, media owner, WebRTC session, and output meter.
`./runtime` and `./server` run only in Bun.
All four areas adopt the `api/` role.

The primary server entry is `createCodexWorkbench` from `./server`.
The caller supplies private storage, the Codex process configuration, instructions, application context, and checkout admission.
The factory owns process startup, generations, sessions, browser connections, shown conversations, and shutdown.
Optional domain extensions install application tools and context sources into that same graph.
A consumer never assembles the internal factories.

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

`ui/clients/transport/` owns one socket run, one lease, command targeting, and recovery after gaps in the event stream.
`ui/clients/wire/` parses messages with the shared model.
`ui/clients/media/` binds that transport to the WebRTC session and its audio elements.
`ui/clients/realtime/` owns microphone capture, negotiation, playback, and cleanup.
`ui/clients/output-level/` measures playback volume.
The application owns opening and closing its socket.

Tests move with their behavior into `packages/codex-realtime-voice/tests/`.
They retain the matching `shared/`, `runtime/`, `server/`, and `ui/` owners.
Support files remain private to that test owner.
Cross-package tests import only public entries.

The `workbench` package (`@archboard/workbench`) owns the Archboard agent integration at layer 7.
It consumes `codex-realtime-voice` and retains board context, vault admission, domain tools, narration, pane services, and the visual shell.
It adopts the `api/` role for `shared/`, `runtime/`, `server/`, and `ui/`.

`./browser-contract` holds Archboard conversation routes and presentation contracts.
Archboard validates its walkthrough and recording payload before narration starts.
`./semantic-context` publishes board context for coordinators and workhorses.
Its board schemas, brief builder, and catalogue formatting stay in this integration.
`./runtime` exposes application behavior needed by outside callers.

`./server`, `./panes`, and `./host` expose Archboard server integration.
The production adapter supplies the shared factory with domain instructions, context, admitted vault checkouts, and tool handlers.
It supplies `ARCHBOARD_URL`, `ARCHBOARD_NO_AUTOSTART`, and its executable path prefix explicitly.
The Codex SDK supplies none of those application values by default.
Pane registration, board request context, semantic projections, and narration remain integration concerns.
`apps/server` owns HTTP routes, sockets, and application lifetime.

`./controllers`, `./agent`, and `./voice` expose the Archboard browser shell.
Conversation, composer, approval cards, sign-in, queue, voice controls, orb, and subtitles remain here.
The shell imports shared transport and media factories directly from `codex-realtime-voice`.
The voice-session adapter adds Archboard presentation and narration to shared media state.

The UI uses the role folders in [frontend.md](frontend.md).
Assistant-ui imports stay in the `thread/` and `runtime/` concerns.
`@assistant-ui/react-markdown` stays in `thread/`.
Subtitles use the frame clock from `ui-kit`, so recordings render them frame by frame.
Tailwind discovers package class names through the stylesheet's `@source` declarations.

Tests of retained integration behavior stay in `packages/workbench/tests/`.
Tests of the app's routes and startup stay in `apps/server/tests/`.
Full-product and browser workflows stay in `tests/system/`.

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

- `src/main.tsx` is the browser entry. It starts the pictures drawn in the page, mounts the application or the
  renderer of a recorded talk, and finds the routing engine's WebAssembly with a file URL
  (`../../../node_modules/libavoid-js/dist/libavoid.wasm`), since the package exports only its entry. `index.html` and
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

### `apps/workbench-example`

`apps/workbench-example` demonstrates the shared Codex workbench without an Archboard server, board, or vault.
The server admits one checkout and keeps private state in the supplied directory.
It reads only public SDK and codex-realtime-voice entries.
Its server forwards exact socket identities through the shared factory browser ingress.
Its browser uses the shared transport and media owner.
The two stop controls keep voice and workhorse lifetimes separate.

`src/server.ts` and `src/main.tsx` are thin process and browser entries.
`src/shared/protocol/application.ts` owns the configuration response and socket path.
`src/server/` owns HTTP, socket registration, startup, and cleanup.
`src/ui/` owns the page, action presentation, and its connection client.
`scripts/build-workbench-example.ts` generates the three browser assets under ignored `dist/workbench-example`.
The normal gate builds those assets before it runs product tests.

App-owned DOM tests cover controls and draft recovery.
The process owner in `tests/system/server-state/workbench-example.test.ts` starts the actual app with the controlled Codex executable.
It covers approval delivery, tab isolation, voice negotiation, workhorse completion, independent stops, and cleanup.
