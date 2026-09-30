---
id: TASK-184.04
title: Stop the install fixture copying skill references that no longer exist
status: Done
assignee:
  - '@claude'
created_date: '2026-09-12 15:22'
updated_date: '2026-09-12 15:39'
labels: []
dependencies:
  - TASK-184.03
parent_task_id: TASK-184
ordinal: 341000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/system/cli/support/install-fixture.ts names references/cheatsheet.md and references/cli-workflows.md in the set of files it copies when it builds an installed skill. Both are being deleted by the prose rewrite, so the fixture would copy files that are not there. Claude's scope: the fixture, not the skill.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The fixture copies only files the tracked skill actually has, and the CLI install owners still pass.
- [x] #2 The derived skill trees are re-synced from the tracked source once the rewrite has landed.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done, and policy-independent. `tests/system/cli/support/install-fixture.ts` copies `SKILL.md`, `references/architecture-workflow.md` and `evals/evals.json` — the three files the tracked skill actually has now. The derived trees were re-synced with `bun scripts/sync-skills.ts` (`.agents/skills/` plus the `.claude/skills/` symlinks), and the CLI install owners pass 12 of 12. Nothing else in the repository referred to the retired references: the only remaining mentions are in historical Backlog entries, which are records rather than instructions.
<!-- SECTION:NOTES:END -->
