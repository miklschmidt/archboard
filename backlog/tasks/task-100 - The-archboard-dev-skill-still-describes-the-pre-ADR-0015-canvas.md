---
id: TASK-100
title: The archboard-dev skill still describes the pre-ADR-0015 canvas
status: Done
assignee:
  - '@claude'
created_date: '2026-08-23 02:15'
updated_date: '2026-08-23 02:16'
labels: []
dependencies: []
references:
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - docs/adr/0006-optimistic-concurrency-for-board-writes.md
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The skill tells an agent the canvas is in-memory, that a restart drops every unsaved board, and that only `board save` puts anything in the vault. ADR 0015 made every write a write to the note: there is no unsaved board content, a restart costs the process and nothing on any board, and the one exception is a held board (TASK-079), whose held changes live in the canvas process and in no note. The skill also says the conflict hash is recorded when a note is read; since TASK-079 the baseline is the bytes archboard last wrote, checked on every write. An agent following the skill saves defensively, warns about losses that cannot happen, and stays silent about the one loss that can.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The skill no longer claims the canvas is in-memory or that a restart loses unsaved boards; it states the ADR 0015 model
- [x] #2 The one real restart loss is named: a held board's held changes (TASK-079)
- [x] #3 The conflict-check description matches ADR 0006 as amended: the baseline is the bytes archboard last wrote, verified on every write
- [x] #4 `bun scripts/sync-skills.mjs` has been run so the synced copies match the source
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite the restart warning in "After changing source": a restart costs the process and nothing on a saving board (ADR 0015); the one exception is a held board, whose held changes live only in the canvas process (TASK-079).
2. Rewrite the "canvas is in-memory" mislead bullet to state the note-is-the-board model, keeping the scratch-note pointer.
3. Correct the conflict-check bullet: baseline is the bytes archboard last wrote, verified on every write, and a refusal holds the board rather than opening a dialog.
4. Run bun scripts/sync-skills.mjs and verify the synced copies match.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Three passages rewritten in skills/archboard-dev/SKILL.md: the restart warning in "After changing source" (a restart costs the process, tabs, panes and feed cursor — never board content on a saving board), the "canvas is in-memory" mislead bullet (now states the note-is-the-board model), and the ADR 0006 bullet (baseline is the bytes archboard last wrote, checked on every write; a refusal holds the board rather than opening a dialog). Both spots that discuss restarts name the one real loss: a held board's changes since the refusal (TASK-079). Verified by grep: "in-memory", "unsaved board" and "when it reads it" no longer appear; sync run and `diff skills/... .agents/skills/...` is clean. excalidraw-skill checked for the same staleness and is already correct ("There is no unsaved board", line 507).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rewrote the three pre-ADR-0015 claims in the archboard-dev skill: the canvas is no longer described as in-memory, a restart is described as costing the process and connections but no board content, the held-board exception (TASK-079) is named in both places restarts come up, and the conflict-check description now matches ADR 0006 as amended (baseline = bytes archboard last wrote, verified on every write, refusal → held). Verified by grepping the stale phrases to absence and a clean diff against the synced copy after bun scripts/sync-skills.mjs.
<!-- SECTION:FINAL_SUMMARY:END -->
