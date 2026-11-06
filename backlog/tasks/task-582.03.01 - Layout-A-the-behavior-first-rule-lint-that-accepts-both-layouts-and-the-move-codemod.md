---
id: TASK-582.03.01
title: >-
  Layout A: the behavior-first rule, lint that accepts both layouts, and the
  move codemod
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06T19:06:00Z'
updated_date: '2026-11-06T20:02:00Z'
labels: []
dependencies: []
documentation:
  - backlog/docs/doc-003 - Behavior-first-layout-plan.md
parent_task_id: TASK-582.03
ordinal: 1029000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The layout moves hundreds of files across many commits, and every commit must keep bun run check green. So the rule, its tests and its lint must accept both layouts before any code moves, and one tool must move files, rewrite imports and update the vault the same way each time. Plan: doc-003, step A1 and A2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ADR 0075 records the behavior-first layout and amends ADR 0055; docs/agents/boundaries.md and docs/agents/frontend.md state it
- [x] #2 workspace-layout.test.ts holds the new rule with a ratchet of trees still role-first, and fails if a listed tree has no role-first file left
- [x] #3 Each lint rule that reads a role folder accepts both layouts and keeps its guarantee, proven by rule tests in both forms
- [x] #4 A repository test fails when vite.config.ts names a test path that does not exist
- [x] #5 scripts/move-source.ts moves a reviewed manifest with git mv, rewrites aliases, relative specifiers and repository-path literals, and updates bindings and anchors through archboard model edit; a dry run over apps/web changes nothing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ADR 0075 (behavior first inside each area, amends ADR 0055 at its area/role sentences); 0055 gets an amended-by line; boundaries.md and frontend.md layout sections state the rule of doc-003 section 1.
2. workspace-layout.test.ts: rule (a) exactly one role folder, the last folder, for every tracked .ts/.tsx under <workspace>/<src|tests>/<area>/ (tests/<area>/support/ exempt, api only directly under the area), rule (b) no folder below an area named after an area. A ratchet constant lists the trees that still break the rule; the test skips them and fails when a listed tree breaks it no more. Trees that already conform (only flat <area>/<role>/<file>) are not listed and are checked now.
3. A repository-policy test reads the tasks of vite.config.ts through its default export and fails when a command names a repository path that does not exist; it also holds the exact file lists of the .oxlintrc overrides to existing files.
4. Lint: one shared role-folder reader in source-layout.ts. ui-concern-placement takes the one role folder, first or last, refuses two (twoConcerns) or one in the middle; assistant-ui-imports accepts the old owner position and thread or assistant-runtime before the role; state-files-pure unchanged with new-form fixtures; frame-clock override gains architecture-drawing/canvas and workbench-client/subtitles globs; mapped-source-paths message names behavior folders. Rule tests prove both forms and the old refusals.
5. scripts/move-source.ts: plan (default move plus prefix overrides, proposals for unbound files from importers, split-directory bindings proposed), apply [--dry-run] (git mv, alias, relative, URL and import.meta.dir rewrites, repository-path literals in the listed config and doc files, report of other references), then restart and one claimed model edit (set.binding, set.anchor on relationships and steps), extending the claim on CLAIM_REQUIRED, then release. Dry run over apps/web, no real move.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ratchet: ROLE_FIRST_TREES lists the 36 trees that break the rule today, not every tree. A tree of only flat <area>/<role>/<file> files (codex-app-server, process, timing and others) already conforms, so listing it would fail the 'a listed tree still breaks the rule' check. Those trees are held to the rule now.
Layout rule details settled from doc-003: tests/<area>/support/ is exempt; api must sit directly under the area (boundaries.md says it stays there).
ui-concern-placement accepts the role folder first (role-first trees) or last (behavior first); a role folder in the middle is refused (misplacedConcern), two role folders are refused (twoConcerns). The role set is the full doc-003 list; UI_ROLES still limits which roles a ui file may use.
assistant-ui-imports: the role-first form now requires the first folder to be a role (the old code took segment [1] of any path); no current file relies on the looser form.
Config-paths test also holds the single-file entries of both .oxlintrc override lists to existing files, which keeps the vendored exemption list exact after moves.
Found for layer B6: packages/renderer/tests/runtime/operations/routes/ is a behavior named 'routes', a role word, so its move needs a new folder name.

Codemod (scripts/move-source.ts with scripts/move-source/{layout,rewrite,vault}.ts): commands plan <path>... [--overrides file], apply <manifest> [--dry-run], rebind <manifest>. Overrides are new-layout prefixes to new prefixes (applied after the default move, mirrored from src/ to tests/). Manifest = {moves, bindings, proposals}; apply uses moves and bindings only. Reading and CLI answers are parsed with the model contract schemas.
Decisions: (1) repository-path literals are rewritten in the listed config and doc files AND in every tracked code file outside the exclusions, because tests and the CLI command table name source by path (readme-lockup.test.ts, panes-addressing.ts); other text files only get a 'references to review' note. (2) A relative 'import ... from "../x"' form is not rewritten: lint refuses relative imports in workspaces, so in workspace files such text is fixture text (boundaries.test.ts), which a rewrite would corrupt. new URL(..., import.meta.url) and join(import.meta.dir, ...) are rewritten. (3) Bindings pinned to a commit keep their path. (4) A bound directory whose files part blocks apply until the manifest names it in bindings; plan proposes the deepest folder its files share. (5) rebind repeats the vault step from a moved checkout and is idempotent (already moved bindings produce no statement).
Evidence: plan apps/web -> 567 moves, 1 binding proposed (apps/web/src/ui/clients/canvas -> apps/web/src/ui/canvas), 0 deeper places, 0 layout problems. apply --dry-run -> 463 files rewritten, 445 vault statements (107 edit-module, 199 edit-relationship, 139 edit-step), 0 blocking problems; git status and the vault revision digest dc527ed2... unchanged; no claims left.
Scratch proof in a throwaway clone (scratchpad, stub CLI that checks each request against the real claim and edit schemas): real apply of the apps/web manifest -> 448 renames with edits + 119 pure renames + 16 rewritten files; claim 445, CLAIM_REQUIRED, release, claim 446, retry with a new operation id, release. In the moved clone: tsc both projects pass, lint:policy over apps/web passes, lint:tests passes, bun test apps/web 621 pass 0 fail, workspace-layout ratchet fails for exactly apps/web/src/ui and apps/web/tests/ui (the move commit removes them). Renderer B6 overrides: new URL paths re-relativized (core-panic probe, layout-worker), vite.config.ts lane and worker paths rewritten, all new URL/import.meta.dir paths resolve, tsc passes. Real server: claiming the 445 web subjects succeeded and was released; vault revision unchanged.

Gate: nix develop -c bun run check passed, 21/21 tasks: test:repository 170 pass across 16 files, test:modules 4909 pass across 742 files, test:system 234 pass across 64 files, test:solo 15 pass across 2 files, test:serial-browser 49/49 owners, cargo test 33 suites ok, lint, format and both type checks clean. The first run failed one test (package-api.test.ts refused literal private workbench paths in the frame-clock fixtures), which 8abcb83a2 fixed.
AC #5 left unchecked: git mv, rewrites, claim growth and release ran for real in a scratch clone, but the vault answers there came from a stub CLI that checks each request against the real schemas. On this checkout only a claim and release of the 445 web subjects ran. A successful model edit on a real vault needs a real move, which this layer must not run. The first move (B1) proves it.

AC #5 proven by the first real move (TASK-582.03.02 B1, commit 2d131626b): apply of the codex-app-server manifest ran git mv on 46 files and rewrote 52 (# aliases in src and tests, the capacity lane path in vite.config.ts). The vault step on the real vault wrote 86 statements (12 edit-module set.binding, 19 edit-relationship set.anchor, 55 edit-step set.anchor) through archboard model edit: attempt 1 answered CLAIM_REQUIRED, the claim grew, attempt 2 (operation move-source-6f7f716e4061-1793994758915-2) answered success, applied: true; model claims was empty afterwards. archboard check then held 81 warnings, only CONTAINER_UNBOUND and CONTAINER_PARTS_OUTSIDE, and bun run check passed 21/21.
The first apply stopped after the moves because archboard restart refuses -C; f05718f21 drops -C (the restart runs in the checkout) and makes apply format the files it rewrote, because a rewritten import can change how a line wraps (the format check failed on 7 files of B1 without it). rebind then finished the vault step from the moved checkout, as designed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Layer A of the behavior-first layout (doc-003 A1 and A2). ADR 0075 amends ADR 0055: areas stay first, code is grouped by behavior inside them, and the role folder is the last folder of a path. boundaries.md, frontend.md and test-suite.md state it. workspace-layout.test.ts holds the rule (one role folder, the last; no area-named folder; api directly under the area; tests/<area>/support exempt) with ROLE_FIRST_TREES, the 36 trees that still break it. config-paths.test.ts fails for any path a Vite+ task or a single-file Oxlint override names that does not exist. ui-concern-placement and assistant-ui-imports accept both layouts (new twoConcerns and misplacedConcern refusals). The frame clock gains the architecture-drawing/canvas and workbench-client/subtitles globs, and state-files-pure gets behavior-first fixtures. role-folder-lint.test.ts proves both forms and the old refusals. scripts/move-source.ts plans, applies (git mv, alias, URL and import.meta.dir, exports and repository-path rewrites, formatting of the rewritten files, restart, one claimed model edit that grows its claim on CLAIM_REQUIRED) and rebinds. The apps/web dry run proposes 567 moves, 463 rewrites and 445 vault statements, and changes nothing. The first real move (codex-app-server, 2d131626b) proved the vault write on the real vault after f05718f21 fixed the restart call. bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
