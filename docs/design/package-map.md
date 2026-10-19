# Package map: from 110 modules to workspace packages

Status: proposal, revised after a second opinion. No file moved yet. It is the input for the
decision to replace `src/<area>/<module>` and its `index.ts` barrels with workspace packages that
declare their interface in `package.json` `exports`.

## Why

A scan of `src` found 110 modules. 72 have one file at the root, 97 of the 99 `index.ts` files only
re-export, and 24 modules have at most one importing module. The name prefixes show the real
modules: 32 start with `codex`, nine with `workbench`, nine with `semantic`, seven with `code`,
four with `walkthrough` and four with `voice`. The area folders (`shared`, `runtime`, `server`,
`ui`) cut each of these in pieces. A caller must learn many small interfaces to use one behavior.

## Target shape

A package owns one behavior. The area folders move inside the package, and the area rules still
hold there: the `ui` folder of a package never imports its `runtime` or `server` folder. Each
package names its public files in `exports`, and a file that is not named is private. There is no
`index.ts` barrel. A package that serves both the browser and the server exposes one subpath for
each side, for example `@archboard/workbench/ui` and `@archboard/workbench/runtime`. Lint refuses
the server-side subpaths from browser code and replaces the `archboard/import-boundaries` rule for
the module root. The lint resolver must learn package specifiers first, because it ignores them
today (`tools/oxlint-plugin-archboard/source-layout.ts:116`).

Inside a package, every area has role folders. There is no catch-all `lib/` folder. Today
`server/archboard/lib` holds 109 files, `runtime/semantic-board-store/lib` holds 44, and
`shared/semantic-board/lib` holds 29. The role names below come from the file names in those
folders. A type that more than one area uses lives at the package root, next to the area folders.
A package with few such types has one `types.ts`. A package with several kinds has a `types/`
folder with one file for each kind. A type derived from a schema stays beside its schema
(`shared/semantic-board/lib/content.ts:173`). A private type stays beside its implementation.

```text
packages/<name>/
  package.json        # exports: the interface. imports: #* for src/, #tests/* for tests/
  tests/              # internal tests, can import private files
  src/
    types.ts          # or types/, only for types that several areas use
    shared/           # code that browser and server both run, with no I/O
      schemas/        # data shapes, validation, branded ids
      constants/      # fixed values, such as every duration
      rules/          # pure functions: compare, reconcile, policy
      protocol/       # wire contracts between browser, server and Codex
      api/            # the interface files of this area, for a package that adopts the role
    runtime/          # code that runs in Bun
      store/          # files, locks, registries, the atomic write, file formats
      operations/     # one write or read a caller asks for: edit, move, rename, settle
      processes/      # spawn, process groups, git, shutdown
      clients/        # talk to another process or server
      services/       # one folder for each long-lived behavior: session, queue, coordinator
    server/           # HTTP and socket code
      routes/         # one file for each route group
      sockets/        # socket connections
      watchers/       # watch the disk and report changes
      state/          # in-memory registries and owner transitions
      lifecycle/      # startup, readiness, shutdown
      projections/    # turn state into what a pane or the timeline shows
      middleware/     # admission, request board and vault, work tracking
      wiring/         # where parts are built and joined
    ui/
      components/
      hooks/
      state/
apps/{cli,server,web} # process entrypoints and glue, imported by nothing
  tests/              # internal tests of the app, can import its private files
tests/                # root suite: integration, system and browser tests
```

A package keeps only the areas and folders that it needs. A folder that grows past about 12 files
splits by behavior, not by a longer file prefix. For example, `runtime/operations/` can hold
`edit/` and `move/`. Lint applies the area rules to the folders of each package, in place of the
module root. It can also refuse a folder name that is not in the list above, so `lib/` does not
return. A type that two areas share goes in `types`, so no area imports another area only to reach
a type.

An `api/` folder holds the public interface of an area over its private role folders. Each file is
a curated list of named re-exports (`export { a } from "#shared/rules/x.ts"`, never `export *`),
and carries only the names that code outside the package imports. `exports` points only into
`api/` for a package that adopts it, and a private file never imports an api file. The `exports`
then name a few interfaces of the package, not one subpath for each file that something imports.
`board` adopts it for `shared/` with thirteen api files and for `runtime/` with seven.
`codex-app-server`, `workspace`, `code-binding`, `process`, `ui-kit`, `server-requests`, `code-intel`, `renderer`,
`code-opener`, `walkthrough`, `skills`, `server-lifecycle` and `workbench` adopt it too, with 7, 8, 3, 3, 10, 1, 5, 8, 4, 4, 4, 9 and 21 api files. `process` also exports `./git-owner`, the script that a Git command runs, as the file itself.

The role lists are guidance, not a closed list, until every existing file has a home that
describes it. A first pass found that `websocket-connection.ts` and `semantic-disk-watch.ts` fit
none of the first names, so `sockets/` and `watchers/` exist. A role folder groups a behavior. It
does not sort each helper by type. For example, `runtime/store/format/` holds `decode.ts` and the
migrations, `runtime/operations/settle/` holds the ordering logic, and `runtime/services/queue/`
holds the queue with its validation and reconciliation. Only some Codex files are long-lived
objects, so `services/` holds those and no more. The theme loader reads files, so it moves to
`runtime`, and the CSS stays an asset (`runtime/store/theme/source.ts`).

## Tests

Each package has a `tests/` folder at its root, next to `src/`. Each app has one too. It holds the
tests of the behavior inside that package or app. Its subfolders follow the area folders, for
example `tests/runtime/store/`. An internal test can import any private file of its own package.
This reverses today's rule, which bars a test from importing its own implementation
(`docs/agents/boundaries.md:59`). Today a public `testing.ts` exists only to expose one internal
parser (`src/shared/process-observation/testing.ts:1`). Direct tests of such behavior are cheaper.
Persistence guarantees still get tests through the public exports
(`src/runtime/semantic-board-store/tests/one-write.test.ts:19`).

The speed gain is a hypothesis. Measure it on one package first. The check is the run time of the
tests that move, before and after, and the setup lines that disappear.

The root `tests/` folder holds the integration tests. A test there covers behavior that crosses
packages, such as a CLI call against a running server or a browser workflow. It imports only the
public `exports` of a package, as an outside caller does. The root configuration declares this
suite as a Vitest project, because Vitest does not treat the root configuration as a project by
itself. It keeps the process and browser serialization of `docs/agents/test-suite.md:9`.

Lint enforces these rules. The plugin needs three changes together. It must recognize the new
package directories as owners (`tools/oxlint-plugin-archboard/source-layout.ts:259`). It must let
a test import private files of its own package (`module-rules.ts:92`). It must apply the area
rules inside one package, which it skips today (`module-rules.ts:38`).

- An internal test imports private files of its own package and only public `exports` of another.
- A file imports its own package with `#` specifiers, such as `#shared/constants/timing.ts`, never with a relative path.
  The `imports` field resolves from the nearest `package.json`, so a `#` specifier cannot reach another package.
- A root test imports only public `exports`.
- Production code never imports a `tests/` folder.
- Production code never imports `./testing`, even when the file lives outside `tests/`.
- A fixture that two packages need goes in a public `./testing` export of the package that owns it.

## Map

The assignment is by file, not only by module, because `runtime/engine` and `server/archboard`
hold several behaviors each. A script read every production import under `src` (type, value and
dynamic) and checked the assignment below. It finds no package cycle and no package that imports
an app, once the cut listed in the next section is made. The layer is the longest dependency chain
below the package. Packages in one layer do not depend on each other.

| Layer | Package            | Takes in                                                                                                                                                                                                                                                                                   | About                                                                        |
| ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 0     | `timing`           | shared/timing                                                                                                                                                                                                                                                                              | Every duration, with what it pulls against.                                  |
| 0     | `diagnostics`      | shared/thrown-error, engine/logger, engine/lib/thrown-error, engine/lib/unknown-record                                                                                                                                                                                                     | Log a line and show a thrown value as text.                                  |
| 0     | `ui-kit`           | ui/components, dialog-parts, frame-clock, fullscreen-presentation, repository-name                                                                                                                                                                                                         | Shared presentation parts.                                                   |
| 0     | `server-requests`  | ui/server-requests                                                                                                                                                                                                                                                                         | Every browser call to the server names its vault here.                       |
| 1     | `process`          | shared/process-observation, engine/process-group, git-process-owner, codex-process/process-group and the group cleanup files                                                                                                                                                               | Own a child process group and end it.                                        |
| 2     | `workspace`        | shared/repositories, shared/language-servers, engine/vault-finder, repo-registry, git and its lib files, state-dir, source-checkout, atomic-write, server/archboard/lib/repositories                                                                                                       | Where a vault, a checkout and the state directory are, and the atomic write. |
| 3     | `code-binding`     | shared/code-target, runtime/code-target                                                                                                                                                                                                                                                    | A node's code binding and where a path lives in a checkout.                  |
| 4     | `board`            | shared/semantic-board, semantic-policy, ids, semantic-pane-context, runtime/semantic-board-store, engine/board-lock, board, board-doing, board-catalogue, board-target                                                                                                                     | The board document and its one reader and writer.                            |
| 5     | `renderer`         | transformers/semantic-renderer, runtime/semantic-renderer, semantic-rasterizer, headless-chromium, ui/browser-renderer, shared/shell-geometry, theme                                                                                                                                       | Draw a board as a picture.                                                   |
| 5     | `code-intel`       | runtime/code-facts, code-check, history-lens, language-servers, shared/code-check, history-attribution, footprint, locality                                                                                                                                                                | What the code says about a board.                                            |
| 5     | `codex-app-server` | shared/codex-app-server-contract (generated), capacity, codex-workbench-identity, runtime/codex-protocol, codex-process (rest), codex-transport, codex-session, codex-semantic-context                                                                                                     | One private app-server session over stdio.                                   |
| 6     | `server-lifecycle` | rest of runtime/engine, runtime/semantic-board-client, shared/server-startup-terminal                                                                                                                                                                                                      | Start, find, restart and stop the server.                                    |
| 6     | `code-opener`      | server/code-opener, browser-origin, ui/code-target, opener-settings, opener-settings-flow                                                                                                                                                                                                  | Open the code that a node binds.                                             |
| 6     | `walkthrough`      | shared/walkthrough-recording, runtime/walkthrough-recorder, video-encoder                                                                                                                                                                                                                  | Record a narrated walkthrough.                                               |
| 7     | `workbench`        | the other runtime/codex-\* modules, server/codex-workbench, shared/codex-browser-model, codex-browser-gateway, codex-realtime-contract, shown-conversation, ui/workbench and workbench-\*, agent-setup, codex-realtime, codex-workbench-media, voice-\*, and the server files listed below | The coordinator, the workhorses, the conversation and the voice.             |
| 7     | `skills`           | runtime/skill-distribution, skill-evaluation                                                                                                                                                                                                                                               | Ship the skills and evaluate them (human-run).                               |
| 8     | `apps/web`         | the remaining ui modules, including the board canvas, shell, catalog, pane session and walkthrough replay                                                                                                                                                                                  | The browser shell.                                                           |
| 8     | `apps/cli`         | cli/\*, runtime/image-clipboard                                                                                                                                                                                                                                                            | The command line.                                                            |
| 8     | `apps/server`      | the rest of server/archboard                                                                                                                                                                                                                                                               | The HTTP and socket host.                                                    |

That is 16 packages and 3 apps in place of 110 modules. The five smallest packages (`diagnostics`,
`server-requests`, `code-binding`, `process`, `timing`) hold 5,500 lines together. They exist
because the code above them needs them below it. If no second caller appears, merge `diagnostics` into `process` or `timing` later.

## What the checks found

- The board canvas is not a package. Only `apps/web` imports it, so it stays web-private. `ui-kit`
  stays a package because `workbench` and `code-opener` also draw with it.
- `voice` is not a package. The voice UI reaches into the workbench transport, and the spoken
  approval code reaches back into the realtime code, so the two form one behavior. The coordinator
  already owns voice (see the Codex entry in `CLAUDE.md`).
- `runtime/engine` held four behaviors. Process groups go to `process`. Vault and git lookup and the
  atomic write go to `workspace`. The board lock and board files go to `board`. The server start,
  restart and client files stay in `server-lifecycle`. `board` and `server-lifecycle` import each
  other today. That cycle ends with this split.
- `shared/code-target` is part of the board model, and `runtime/code-target` reads the checkout, so
  both sit below `board`. The opener (server routes and settings UI) sits above `code-intel`.
- `server/archboard` is 27,700 lines and imports 28 Codex modules. The session ownership
  (`lib/codex-workbench-sessions.ts:105`), ordered teardown
  (`lib/codex-workbench-generation-lifecycle.ts:217`) and cancellation
  (`lib/codex-workbench-operation-lifecycle.ts:334`) belong to `workbench`. So do 15 files of pane
  and tab plumbing that the workbench needs. They are listed here.
  - `pane-registry`, `tab-sessions`, `tab-canvas`, `pane-presentation` and `pane-board-key`.
  - `semantic-change-feed`, `semantic-board-context`, `semantic-board-description` and
    `semantic-pane-context`.
  - `request-board`, `request-vault`, `listener-address`, `transcript-changes`,
    `voice-start-trace` and `walkthrough-narration`.

  A `panes` package can come out of them later. The route files for code check, footprint and
  locality stay in `apps/server`.

## Changes the move needs

- Cut one edge: `codex-process/lib/process-group-cleanup.ts` imports `CodexProcessError` from
  `process-contract`. Make the cleanup take a generic error type, or `process` depends on
  `codex-app-server`.
- Browser safety. The canvas imports `shared/code-check`, which imports `shared/language-servers`,
  which imports `node:path` (`ui/semantic-board-canvas/api/semantic-boards.ts:17`,
  `shared/code-check/index.ts:52`, `shared/language-servers/index.ts:8`). `code-intel` needs a
  browser subpath that holds no Node import. `shared/language-servers` now sits in `workspace`,
  which makes the same split necessary there.
- Keep the binding, anchor and document-reference schemas in `code-binding`. `board` imports them
  (`shared/semantic-board/lib/content.ts:65`, `lib/aggregate.ts:31`), and the resolver in
  `code-binding` parses with `CodeBindingSchema` (`runtime/code-target/lib/resolver-core.ts:330`).
  If the schemas moved into `board`, the two packages would depend on each other.
- Do not write one `exports` entry for each file. Put the interface in a few files per package. For
  example, `board` exposes `./document`, `./policy` and `./store`, and `board-lock` stays private to
  it. `atomic-write` stays in `workspace` with a public export, because the repository registry and
  the code opener use it too (`runtime/engine/lib/registry-file.ts:12`,
  `packages/code-opener/src/server/store/configuration.ts`). `workbench` exposes `./browser-contract`, `./runtime` and `./ui`.
  `renderer` exposes `./browser`, `./bun` and six more. The browser file starts its own layout worker, so no `./worker` export exists.
- Keep these working. Update both TypeScript configurations too.
  - The generated contract path and its ignored output
    (`scripts/generate-codex-app-server-contract.ts:23`, `.gitignore:32`).
  - Codex executable resolution (`runtime/codex-process/lib/executable.ts:143`).
  - The `@napi-rs/canvas` and font assets (`runtime/services/bun-host.ts`).
  - The browser measurement contract (`tests/system/browser/measured-text.test.ts:19`).
  - The worker and WASM URLs (`frontend/main.tsx:26`).
  - The digest and stylesheet paths in `vite.config.ts` (lines 16 and 86).

## Order

1. Teach the lint resolver and both `tsconfig` files about workspace `exports`. Keep the old rules
   running beside them until the last package moves.
2. Pilot `timing`, which has no dependency.
3. Extract `diagnostics`, `process`, `workspace` and `code-binding`, and split `runtime/engine`.
4. Move `codex-app-server`, then `workbench`.
5. Move `board`, `code-intel` and `code-opener`.
6. Move `renderer`, `walkthrough` and `skills`, then leave the rest in the three apps.

The Vite+ conversion, and the move of the tests from `bun test` to `vp test`, are separate tasks
that follow the first two steps. The test move is also the place to delete tests that do not check
product behavior.

## Risk: the runtime

The Vite+ test guide says that Vitest requires Node (`^22.18.0 || ^24.11.0 || >=26.0.0`), and the
guide does not mention Bun. The Bun 1.4 release notes say that Vitest runs under Bun, with the
`threads` and `forks` pools and with `--coverage` (https://bun.com/blog/bun-v1.4#vitest). The
installed Bun is 1.4.3. The product runs on Bun. Production code calls `Bun.YAML`
(`runtime/semantic-board-store/lib/configuration.ts:142`), and 27 production files use other Bun
APIs. The test harness starts servers with `process.execPath`
(`tests/system/support/owned-server.ts:240`), which names the wrong executable if Vitest runs in
Node.

Run a short trial before the test move. Start Vitest under Bun, with a few board-write and
server-cleanup tests. Make sure that the Bun APIs, `process.execPath` and process cleanup behave as
they do under `bun test`. Also make sure that `vp test` starts under Bun and not under Node. If a
group of tests cannot run under Bun, it stays in a separate project. Package moves do not depend on
this trial.
