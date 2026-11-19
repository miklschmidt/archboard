---
id: TASK-653.03
title: The boundaries document is gone
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T16:36:00Z'
updated_date: '2026-11-19T16:49:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-653
ordinal: 1116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner decided (owner decision 19 in the archboard-deepen run's decision log) that a document describing the code's layout never prevents a refactor, and that docs/agents/boundaries.md should not exist. Its 966 lines restate what the package graph test, the oxlint plugin, the workspace layout test and the architecture vault already hold, and it was cited as a rule that blocked moving workbench's pane routes. Every deepen ticket of TASK-653 would otherwise have to edit it, so it goes first. A rule that only the document holds is either moved to where it is enforced or recorded, or dropped.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/agents/boundaries.md is deleted, and no tracked file outside backlog/ names it: AGENTS.md, the docs under docs/agents, the oxlint plugin's messages, the repository-policy tests and the code comments that cite it
- [x] #2 Every lint and test failure message that pointed at the document instead says the rule itself, so an agent that hits it knows what to change
- [x] #3 Each rule the document held that no code, test, lint rule, ADR or vault entry enforces is moved to where it applies or dropped, and the task notes list each one with its outcome
- [x] #4 bun run check passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Outcome of each rule of docs/agents/boundaries.md:

Moved (only the document held them):
- Types a dependency owns ("Vendor-owned data"): moved, condensed, to a section of docs/agents/strict-analysis.md, the analysis policy that type checking enforces it under.
- Only packages/codex-app-server/src/shared/protocol/app-server-contract.ts imports the generated Codex tree, and only its types: moved to docs/agents/codex-upgrades.md, where an upgrade adapts that wrapper.
- Area directions: the import-boundaries lint message (TypeScript and CSS) now states the directions itself, from one AREA_DIRECTION_MESSAGE that matches AREA_IMPORT_DENIALS.

Already enforced or recorded, nothing to move:
- Workspaces, no src/ or frontend/ root, no @/ alias, # imports with extensions, TypeScript only: workspace-layout.test.ts, absolute-imports, typescript-source and layout lint rules, strict-analysis.md.
- Area, behavior and role folders, api/ directly under an area, tests mirroring source: ADR 0075, workspace-layout.test.ts, ROLE_FOLDERS in source-layout.ts, ui-concern-placement.
- Thin app entries: root-implementation-modules lint.
- Exports are the interface, nothing imports an app, test owners, ./testing for tests only, production never imports tests: module-entrypoints lint, package-graph.test.ts, boundaries.test.ts, app-boundaries.test.ts.
- Interface width and its ceilings: ADR 0058 and the interface-width.test.ts failure message.
- api/ folder rules: package-api.test.ts.
- Package layers, no cycles, codex-realtime-voice on its host-neutral foundation only: package-graph.test.ts.
- CSS boundaries and Tailwind @source scanning: css-imports.ts, css-boundaries.test.ts, the comment in apps/web/src/ui/theme/app.css.
- Line caps (500 for tests, 600 for policy source) and generic bucket folders: .oxlintrc.tests.jsonc, .oxlintrc.jsonc, no-generic-buckets.
- SOURCE_CHECKOUT import refused: no-restricted-imports in .oxlintrc.jsonc (ADR 0076). Telemetry records hold no names: ADR 0079. assistant-ui only in thread and assistant-runtime: assistant-ui-imports lint. node:fs not in state/: state-files-pure lint.
- Licenses (MIT voice stack, BUSL elsewhere): each package.json and LICENSE. Launcher symlink hand-off: source-checkout.ts. bin.ts loads config late: its comment. Command owner paths: scripts/move-source.ts rewrites them and command-contract-artifacts.test.ts holds the proof.
- Validation commands: TESTING.md and docs/agents/test-suite.md.

Dropped (they only described the layout or were soft advice):
- The per-package and per-app descriptions (timing through telemetry, apps/cli, apps/server, apps/web, apps/workbench-example): the architecture vault and the code describe them.
- Split a role folder past about 12 files: an unenforced heuristic.
- Keep a component used only inside its package private and delete one with no caller: covered by ADR 0055 (every public name has an outside caller) and ordinary dead-code removal.
- Put large test data in a non-TypeScript fixture: one of several ways to meet the enforced 500-line cap.
- Moving a command file means editing run.ts: scripts/move-source.ts rewrites repository paths.

Validation: bun run check ran every lane; all passed except check:model, which fails on the 19 INTERFACE_WIDE and MODULE_SHALLOW findings (17 + 2) that TASK-653 exists to clear and that this branch does not touch. test:system (227 pass), test:solo (15 pass) and test:serial-browser (1 pass), which check stopped before, pass when run alone. AC #4 stays unchecked until TASK-653 clears those findings.

Merged into deepen/module-depth (3c177786ce). bun run check: every stage passes except check:model, which fails only on the 19 INTERFACE_WIDE and MODULE_SHALLOW findings that TASK-653 exists to clear (the owner accepted that check:model fails on the lower layers until the run lands). Criterion 4 is checked on that basis; TASK-653's own criterion 1 holds the full pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Deleted docs/agents/boundaries.md. The area-direction lint message, for TypeScript and CSS, now states the directions itself. The vendor-type rule moved to docs/agents/strict-analysis.md and the generated Codex contract rule to docs/agents/codex-upgrades.md; every other rule was already enforced by lint, the repository-policy tests, an ADR or the vault, or only described the layout and was dropped (listed in the notes). Every pointer to the document is gone. bun run check passes every lane except check:model, whose 19 width and depth findings predate this branch and belong to TASK-653.
<!-- SECTION:FINAL_SUMMARY:END -->
