---
id: TASK-152
title: >-
  A person's edit is optimistic, but the note still decides: version-check human
  writes and freeze content editing under an agent claim
status: To Do
assignee: []
created_date: '2026-09-06 12:59'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 300000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AGENTS.md carried the rule 'a person is never refused: never version-refused, an agent never makes the canvas stop responding, and never works out of sight'. That rule is wrong and is implemented in three layers. The intended design: the on-disk note is the single source of truth; a person's edit is an optimistic local update that must never let a pane drift from the note; a human write is version-checked like an agent's and refused when stale, after which the pane reconciles to the note; while an agent claims a board, panes showing it stop taking content edits (pan and zoom keep working) instead of a content edit revoking the claim; an agent may edit any board whether or not a person is looking at it, and every pane shows in real time which board an agent is editing. Where the old rule lives: ADR 0006 ('A person is never checked at all') and src/runtime/engine/board-version.ts statedVersion, which skips the version precondition for writer 'human'; ADR 0016 ('a person can always take it back', TASK-118 content-edit takeover) with revokeClaim in src/runtime/engine/board-lock.ts, the /api/boards/hold route in src/server/canvas/lib/application.ts, and the takeover and heldBy handling in src/ui/canvas/useCanvasSession.ts; the 'never works out of sight / restructure in the open' guidance in ADR 0016 and the archboard skill. ADR 0006 and ADR 0016 need superseding paragraphs or a new ADR, not silent edits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A human element write carries the version the pane last saw and is refused with the same version conflict an agent gets when the note has moved
- [ ] #2 After a refused human write the pane reconciles to the note on disk and shows no local state the note does not hold
- [ ] #3 While an agent claims a board, a pane showing it accepts pan and zoom and rejects content edits, and a content gesture no longer revokes the claim
- [ ] #4 A person can still release an agent's claim through one explicit control, and the agent is told it lost the board
- [ ] #5 Every pane shows in real time which board an agent is editing, including boards no pane has open
- [ ] #6 ADR 0006 and ADR 0016 record the superseding decision and the archboard skill no longer tells agents to keep restructures in view of the person
- [ ] #7 The rewritten AGENTS.md invariant matches the behaviour
<!-- AC:END -->
