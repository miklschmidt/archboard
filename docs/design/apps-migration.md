# Moving the rest of `src/` into `apps/`

Status: done (TASK-500.24). The last modules of `src/` and `frontend/` moved into three layer-8
apps, and `src/`, `frontend/` and the `@/` alias are gone (TASK-500.24.06). An advisor review
(Codex GPT-6-Astra) of the repository on 2026-10-19 produced the decisions below. This file keeps
them as a record. The rules that lint enforces today are in `docs/agents/boundaries.md`.

## Decisions

- **Layout.** An app uses the area and role folders of a package (`docs/agents/boundaries.md`).
  - `apps/web/src/ui/{components,hooks,state,rules,clients,...}/<behavior>/`
  - `apps/cli/src/cli/...`, and `apps/cli/src/runtime/...` for the clipboard
  - `apps/server/src/server/...`
- There is no `lib/` folder and no barrel. An app has `tests/` beside `src/` and a private
  `package.json` with no `exports`. Nothing imports an app. An app imports a package only through its
  `exports`. The board canvas stays private to `apps/web`.
- **Imports.** Each app has `"imports": {"#*": "./src/*", "#tests/*": "./tests/*"}` and spells the
  extension. Relative imports stay refused. `@/` went away with its last caller. Bun, `tsc` and Vite
  all honor the manifest `imports` field.
- **Entries.** `bin/archboard` stays a regular root file and runs `apps/cli/src/bin.ts`. A symlink
  breaks the hand-off test, which needs the real path of the launcher to equal its root path.
  The server entry is `apps/server/src/server.ts`. `packages/server-lifecycle` finds it with
  `join(SOURCE_CHECKOUT, "apps", "server", "src", "server.ts")`. That is a process-launch contract
  and no import. The browser output stays at the repository root `dist/frontend`. Vite takes
  `apps/web` as its root and an explicit output path.
- **The web app moved in two steps.** In between, the root `src/` modules reached the moved ones
  through a temporary `"#web/*": "./apps/web/src/*"` entry in the root `package.json`. The last step
  removed it with the rest of `src/`.
- **Shadcn.** `components.json` names plain repository paths, such as
  `packages/ui-kit/src/ui/components`. The CLI resolves them from the repository root, so the
  `@/` path alias is not needed (`bun run shadcn info` lists the resolved paths).

## Order

1. Tooling learns apps: workspaces, one owner parser for packages and apps, lint scopes, the graph
   and api tests, and tsconfig coverage. Fixtures prove the rules before any file moves.
2. `apps/cli`.
3. `apps/server`.
4. `apps/web` canvas.
5. `apps/web` rest, entry and Vite.
6. Remove `src/`, `frontend/`, the alias and the old module rules. Then update the docs.

## What the move touched

The paths below broke without a message, so each step checked them. Check them again before an app
file moves.

- `packages/server-lifecycle` holds the server entry (`spawn.ts`), the startup remedy text
  (`server-spawn-target.ts`) and the staleness check, which watches `apps` and `packages`.
- `packages/workbench` takes the frontend directory from `SOURCE_CHECKOUT/dist/frontend`.
- `packages/skills` launches the CLI and server entries and hashes `apps` and `packages` for the
  batch provenance. `classify.ts` keeps the old paths for batches recorded before the move.
- `tests/system/browser/support/frontend-build.ts` scans `packages` and `apps` to decide whether the
  bundle is stale. Many system tests hold a server launch string that names the entry.
- A test that imports app internals lives in the owning app. An app adds no export for it.
- The CLI records command-owner paths (`apps/cli/src/cli/operations/invocation/run.ts`) and `generatedFrom` file paths in its
  contract artifacts.
- `apps/web`: the stylesheet `src/ui/theme/app.css` imports the renderer theme and fonts through
  public package exports (TASK-502). Tailwind `@source` paths remain relative filesystem scan inputs.
  `index.html` links the stylesheet.
- `docs/readme/assets.json` source lists and `evals/coverage.json` owner strings name app paths. The
  README asset digest includes paths.
- Vault boards stay stale until TASK-500.06.

## Browser verification

The web steps ran the whole `test:serial-browser` lane (real Chrome) and the frontend build. They
also checked in development mode that the stylesheet loads and that React Fast Refresh works from
the moved root.
