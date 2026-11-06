---
id: TASK-582.03.01
title: >-
  Layout A: the behavior-first rule, lint that accepts both layouts, and the
  move codemod
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T19:06:00Z'
updated_date: '2026-11-06T19:25:00Z'
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
- [ ] #1 ADR 0075 records the behavior-first layout and amends ADR 0055; docs/agents/boundaries.md and docs/agents/frontend.md state it
- [ ] #2 workspace-layout.test.ts holds the new rule with a ratchet of trees still role-first, and fails if a listed tree has no role-first file left
- [ ] #3 Each lint rule that reads a role folder accepts both layouts and keeps its guarantee, proven by rule tests in both forms
- [ ] #4 A repository test fails when vite.config.ts names a test path that does not exist
- [ ] #5 scripts/move-source.ts moves a reviewed manifest with git mv, rewrites aliases, relative specifiers and repository-path literals, and updates bindings and anchors through archboard model edit; a dry run over apps/web changes nothing
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
<!-- SECTION:NOTES:END -->
