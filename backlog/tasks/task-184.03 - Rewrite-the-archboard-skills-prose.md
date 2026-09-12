---
id: TASK-184.03
title: Rewrite the archboard skill's prose
status: Done
assignee:
  - '@astra'
created_date: '2026-09-12 15:22'
updated_date: '2026-09-12 16:59'
labels: []
dependencies: []
parent_task_id: TASK-184
ordinal: 340000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owned exclusively by Astra; Claude edits nothing under skills/archboard/**. The plan the writer stated: keep SKILL.md and, optionally, references/architecture-workflow.md, and delete references/cheatsheet.md, references/cli-workflows.md and references/semantic-boards.md as redundant. Use-case guidance is to be shortened, with no talk of panes and no response internals. Level stays a conceptual term rather than a schema field.

Recorded here so the batch has one place to look and so the code that refers to those files (TASK-184.04) has something to depend on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 SKILL.md stands on its own, with the redundant references retired.
- [x] #2 The guidance says nothing about panes and nothing about response internals.
- [x] #3 Derived skill trees are re-synced once the prose is final.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Authored by Astra, accepted by the parent

Recorded by Claude on the parent's instruction so the evidence is attached without waiting on the writer's own Backlog edit. Claude edited nothing under `skills/archboard/**`.

- `SKILL.md`: 634 words, down from 1243.
- `SKILL.md` plus the one optional reference (`references/architecture-workflow.md`, 332 words): 966 words, down from 5298 — 82% less.
- `evals/evals.json`: 477 words over seven authoring scenarios.
- Retired as redundant: `references/cheatsheet.md`, `references/cli-workflows.md`, `references/semantic-boards.md`. `references/architecture-workflow.md` kept.
- Validated against the real CLI help: `semantic new`, `edit`, `branch`, `show`, `render`, `adopt`, plus `claim`, `release` and `repo add`, and the JSON input schemas with their replacement behaviour. No vault writes and no static-content tests.
- The parent corrected the level vocabulary: a system board shows services, and a service board shows the modules inside it. Level stays conceptual — there is no schema field for it.

Parent review accepted the rewrite as complete. What remains is Claude's: re-syncing the derived skill trees and retiring the install fixture's hardcoded copies (TASK-184.04).

## Status recorded by Claude, on the parent's instruction

Astra authored the rewrite and Astra and the parent accepted it; the status is recorded here rather than waiting on the writer's own tooling. Claude edited nothing under `skills/archboard/**` at any point — what Claude owns is the code that referred to the retired files (TASK-184.04) and the derived trees.

Evidence, as reported: `SKILL.md` 634 words (from 1243); with the one optional reference (`references/architecture-workflow.md`, 332 words) 966 (from 5298, −82%); `evals/evals.json` 477 words over seven authoring scenarios; `references/cheatsheet.md`, `references/cli-workflows.md` and `references/semantic-boards.md` retired. Validated against the real CLI help for `semantic new/edit/branch/show/render/adopt` plus `claim`, `release` and `repo add`, and the JSON input schemas with their replacement behaviour, with no vault writes and no static-content tests. The parent corrected the level vocabulary — a system board shows services, a service board the modules inside it — and level stays a conceptual term with no schema field.

Claude's part is done and verified: `bun scripts/sync-skills.ts` re-derived `.agents/skills/` and the `.claude/skills/` symlinks from the tracked source, the install fixture copies only the three files the skill now has, and the CLI install owners pass. Nothing outside historical Backlog entries mentions the retired references.

## Prompt cleanup, authored by Astra and accepted by the parent

A second pass the parent asked for after the skill rewrite: the always-injected prompt was carrying a board and reconciliation tutorial that duplicated what the concise skill now teaches, which undermined it. Astra owned both files; Claude edited neither and only refreshed the digests afterwards.

- `workhorse-developer-instructions.txt`: **231 words, down from 643.** The skill pointer stays, and so does the required `--as-session <your thread>` on board writes — the session identity this task's delivery rule depends on. The target, epoch, authority and approval contracts are preserved.
- `coordinator-role-extension.txt`: the stale "archboard skill live-browser workflow" pointer is gone with the reference the rewrite retired, and the redundant reconciliation lecture is trimmed. The explicit real-presentation lookup protocol is preserved.

Claude's part: the three pinned digests were recomputed and updated together — the workhorse document, the coordinator extension and their composition — and the two copies pinned in owners moved with them. Runtime policy is unchanged by any of it.
<!-- SECTION:NOTES:END -->
