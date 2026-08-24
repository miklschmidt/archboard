---
id: TASK-114
title: Rename the consumable skill to archboard
status: Done
assignee: []
created_date: '2026-08-24 11:20'
updated_date: '2026-08-24 11:29'
labels: []
dependencies: []
modified_files:
  - skills/archboard/SKILL.md
  - skills/archboard/evals/evals.json
  - skills/archboard/references/architecture-workflow.md
  - skills/archboard/references/cheatsheet.md
  - src/cli/commands/install-skill.ts
  - scripts/sync-skills.mjs
  - scripts/check-install-doc.mjs
  - scripts/check-branch-compare.mjs
  - scripts/check-side-by-side.mjs
  - scripts/check-surface-parity.mjs
  - AGENTS.md
  - INSTALL.md
  - skills/archboard-dev/SKILL.md
type: chore
ordinal: 116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The repository-wide consumable canvas skill is named excalidraw-skill even though it now teaches the archboard product specifically. Rename the current skill contract so agents discover and install it as archboard, without rewriting historical task records.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The tracked consumable skill directory and frontmatter name are archboard
- [x] #2 install-skill installs and documents the archboard skill name
- [x] #3 current docs and validation scripts refer to skills/archboard rather than skills/excalidraw-skill
- [x] #4 derived skill copies contain archboard and no stale excalidraw-skill copy
- [x] #5 the relevant test suite passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rename the authored skill directory and frontmatter.
2. Update installation, current documentation, and validation paths.
3. Sync derived skill copies and remove the stale derived name.
4. Run focused checks and the full suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Renamed the authored skill directory and frontmatter to archboard; updated installer, current docs, eval/parity paths, and derived sync. Added migration cleanup to both install-skill and sync-skills so the retired name does not remain discoverable. Verification: type-check, test:install (37), test:parity, test:branch, test:side-by-side, install-skill --print-source, derived-copy diff, and git diff --check pass. Full bun run test is blocked by two pre-existing test:boards assertions about case-colliding notes; test:boards fails identically on an isolated rerun, outside modified code.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Renamed the consumable canvas skill to archboard across its authored directory, frontmatter, eval metadata, installer, current docs, and validation paths. Upgrades and repository sync now remove the retired name so agents discover only archboard. Verified with type-check, installer migration, surface parity, branch/compare, side-by-side, print-source, derived-copy diff, and whitespace checks; the full suite remains blocked by an unrelated pre-existing test:boards collision-list failure reproduced in isolation.
<!-- SECTION:FINAL_SUMMARY:END -->
