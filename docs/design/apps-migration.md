# Moving the rest of `src/` into `apps/`

TASK-500.24 puts what the packages left behind into three layer-8 apps. It then removes `src/`,
`frontend/` and the `@/` alias. An advisor review (Codex GPT-6-Astra) of the repository on
2026-10-19 produced the decisions and the risk list below. Each subtask reads this file.

## Decisions

- **Layout.** An app uses the area and role folders of a package (`docs/design/package-map.md`).
  - `apps/web/src/ui/{components,hooks,state,rules,clients,...}/<behavior>/`
  - `apps/cli/src/cli/...`, and `apps/cli/src/runtime/...` for the clipboard
  - `apps/server/src/server/...`
- There is no `lib/` folder and no barrel. An app has `tests/` beside `src/` and a private
  `package.json` with no `exports`. Nothing imports an app. An app imports a package only through its
  `exports`. The board canvas stays private to `apps/web`.
- **Imports.** Each app has `"imports": {"#*": "./src/*", "#tests/*": "./tests/*"}` and spells the
  extension. Relative imports stay refused. `@/` goes away with its last caller. Bun, `tsc` and Vite
  all honor the manifest `imports` field.
- **Entries.** `bin/archboard` stays a regular root file and runs `apps/cli/src/bin.ts`. A symlink
  breaks the hand-off test, which needs the real path of the launcher to equal its root path.
  The server entry becomes `apps/server/src/server.ts`. `packages/server-lifecycle` finds it with
  `join(SOURCE_CHECKOUT, "apps", "server", "src", "server.ts")`. That is a process-launch contract
  and no import. The browser output stays at the repository root `dist/frontend`. Vite takes
  `apps/web` as its root and an explicit output path.
- **Transitional state.** The web app moves in two steps. In between, the root `src/` modules reach
  the moved ones through a temporary `"#web/*": "./apps/web/src/*"` entry in the root `package.json`.
  The lint rule that refuses imports of an app allows exactly this and nothing else. TASK-500.24.06
  removes it.

## Order

1. Tooling learns apps: workspaces, one owner parser for packages and apps, lint scopes, the graph
   and api tests, and tsconfig coverage. Fixtures prove the rules before any file moves.
2. `apps/cli`.
3. `apps/server`.
4. `apps/web` canvas.
5. `apps/web` rest, entry and Vite.
6. Remove `src/`, `frontend/`, the alias and the old module rules. Then update the docs.

## Lint plugin lines to change

The lines below are in `tools/oxlint-plugin-archboard/` at review time.

- `source-layout.ts`
  - Line 9 names the thin entries.
  - Lines 132-136 map `@/` into `src`.
  - Line 277 looks up manifests under `packages` only.
  - Line 320 allows `#` imports for `packageAt` only.
  - Line 411 knows `packages/<name>/{src,tests}` only.
  - Line 424 excludes app source from the product-source rules.
  - Lines 433-438 exclude apps from area ownership.
  - Lines 447 and 456 encode the old module layout.
  - Line 509 excludes app test owners.
  - Line 119 (`state-files-pure`) matches files directly under `state/` only. Role folders such as
    `state/canvas/scene.ts` escape it. Cover descendants.
- `module-rules.ts`
  - Line 39 exempts imports inside one module.
  - Line 53 skips unknown owners without a message.
  - Lines 141-142 compare package names. Compare owner roots.
  - Lines 158-170 need a case for app targets. Only the owning app imports app source.
  - Line 188 diagnoses an unresolved `@/` import only. A malformed `#` import must fail too.
  - Line 201 needs app test owners.
- `layout-rules.ts`
  - `root-implementation-modules` (lines 78-81 and 222) needs the app source roots.
  - `mapped-source-paths` (lines 274-280) needs a new placement model.
  - `no-generic-buckets` (line 336) must add `lib`.
  - `no-compatibility-identifiers` (line 359) inherits the product-source predicate.
- `ui-rules.ts`
  - `PACKAGE_UI_FILE` (line 52), owner detection (lines 86-115) and concern selection (lines 195-200)
    need app coverage.
  - The `named-react-imports` guard (line 428) skips apps.
  - `apps/web/src/main.tsx` sits above `ui/` and counts as browser code.

Repository tests to extend:

- `boundaries.test.ts`: app-local `#` imports, package-to-app and app-to-app refusals, own-test
  access, browser-entry limits.
- `ui-lint-policy.test.ts`: app UI placement, the 600-line UI limit and the 500-line limit for
  other tests.
- `package-graph.test.ts`: three layer-8 owners and no incoming app edge.
- `package-api.test.ts`: scan `apps` in place of `src`.

Scopes keyed on `src/` that must gain `apps/`:

- `.oxlintrc.jsonc`: the test ignores (lines 48-50) and the five canvas overrides (lines 190-194).
- `.oxlintrc.tests.jsonc`: lines 41, 80 and 93-94.
- `package.json` scripts: `startup`, `fix`, `test:modules`, `lint:tests`, `lint:policy`.
- `tsconfig.json`, `tsconfig.frontend.json`, `components.json`, `.impeccable/live/config.json` and
  `.github/workflows/ci.yml` (line 88).

## Paths that break without a message

- `packages/server-lifecycle`
  - `spawn.ts` holds the server entry.
  - `staleness.ts` must watch `apps` as well as `packages`.
  - `server-spawn-target.ts` holds the startup remedy text.
- `packages/workbench`: `server/services/host/module-paths.ts` sets `moduleDir` to
  `SOURCE_CHECKOUT/src`. The server can use `SOURCE_CHECKOUT/dist/frontend` directly.
- `packages/skills`
  - `processes/archboard.ts`, `isolation.ts` and `server.ts` launch the old CLI and server entries.
  - `provenance.ts` hashes `src` and `packages`. A missing `src` throws, so hash `apps` and
    `packages`.
  - `classify.ts` must keep the old paths for batches recorded before the move.
- `tests/system/browser/support/frontend-build.ts` scans `frontend`, `src` and `packages` to decide
  whether the bundle is stale. `tests/system/server-state/staleness-source.test.ts` must touch an
  app file.
- System tests that hold a server launch string or generated code naming the entry:
  `shell-layout.test.ts`, `navigator-support.ts`, `opener-settings.ts`, `local-bind.test.ts`,
  `server-http-lifetime.test.ts`, `initial-send-failure-server.ts`, `codex-production-server.ts` and
  the other owners under `tests/system/{support,process-contracts,server-state,cli,semantic-boards}`.
- Tests that import app internals (`command-contract-artifacts`, `artifact-fixture`,
  `recording-page-address`, `application-lifetime-terminal-stop`) move into the owning app. Do not
  add an app export for them.
- CLI: `commands/run.ts` command-owner paths and `command-contract/artifacts.ts` `generatedFrom`
  record file paths. Update them.
- `apps/web`
  - `src/ui/theme/app.css` holds the renderer theme, font and `@source` paths, which are relative to
    the stylesheet.
  - `main.tsx` holds the libavoid WASM URL. The package exports only `.`, so keep a file URL.
  - The moved `index.html` links the stylesheet.
  - `stylesheetBeyondRoot` in `vite.config.ts` exists only for the old outside-root stylesheet.
- `docs/readme/assets.json` source lists and `readme-lockup.test.ts`. The asset digest includes
  paths.
- `evals/coverage.json` owner strings, `INSTALL.md`, `TESTING.md` and `AGENTS.md`.
- Vault boards stay stale until TASK-500.06.

## Browser verification

The web steps run the whole `test:serial-browser` lane (real Chrome) and the frontend build. They
also check in development mode that the stylesheet loads and that React Fast Refresh works from the
moved root.
