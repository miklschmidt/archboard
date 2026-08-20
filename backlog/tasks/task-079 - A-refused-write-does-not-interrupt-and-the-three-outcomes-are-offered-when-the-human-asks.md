---
id: TASK-079
title: >-
  A refused write does not interrupt, and the three outcomes are offered when
  the human asks
status: To Do
assignee: []
created_date: '2026-08-20 20:17'
labels: []
dependencies:
  - TASK-078
references:
  - docs/adr/0006-optimistic-concurrency-for-board-writes.md
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - frontend/src/shell/Shell.tsx
  - docs/design/server-is-the-truth.md
type: enhancement
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 8 of docs/design/the-plan.md, immediately after the store work. ADR 0006 survives ADR 0015, but the moment it fires moves, and if nothing else changes it fires at the worst possible moment.

WHAT GOES WRONG IF THIS IS NOT DONE. Today a write conflict surfaces when somebody runs `board save`, which is a moment they chose. Under ADR 0015 every change is a write, so the conflict surfaces 400 ms after a human lifts their finger, and the dialog's three outcomes read as: reload and lose what you just drew, overwrite somebody else's work, or save this somewhere else right now. Being interrupted mid-thought by a modal whose best offer is "discard what you just drew" is worse than the problem it reports.

WHY THE CONFLICT STILL EXISTS AT ALL. The lock in ADR 0016 excludes archboard processes from each other. It does not stop the Obsidian Excalidraw plugin, a sync client, or a text editor, and ADR 0016 says so: "the lock handles our own concurrency, the hash catches everybody else's."

WHAT TO BUILD. A failed write does not have to interrupt anybody.

- The write is refused, nothing is written, and the pane keeps its scene. Nothing is lost while it waits.
- The board is marked as not being persisted, visibly, so the human is not drawing into a void without knowing.
- The human keeps drawing. Further changes are held rather than written.
- The three outcomes from ADR 0006 are offered when the human asks for them, not when the conflict happened. They are unchanged: reload (`board open <name> --reload`), overwrite (`board save --board <name> --force`), or save elsewhere (`board save --board <name> --as <other>`). Archboard still picks none of them.

WHAT AN AGENT SEES. Not a dialog. A write that is refused because the note changed underneath returns the conflict, as it does today, and an agent can say so out loud. The CLI still exits 5.

THE HONEST LIMIT, WORTH WRITING DOWN WHERE A USER SEES IT. Reapplying held changes onto a note that somebody else has rewritten is a merge over a partial view: a pane's baseline covers only what that pane has seen. ADR 0006's advice stands and should be repeated in whatever this puts on screen: keep a board open in one editor at a time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A write refused by the ADR 0006 hash check writes nothing and leaves the pane scene intact
- [ ] #2 The pane shows that the board has stopped being persisted, without a modal appearing mid-gesture
- [ ] #3 Changes made after a refusal are held, not written, and are not lost
- [ ] #4 The three ADR 0006 outcomes are reachable at a moment the human chose, and archboard still picks none of them
- [ ] #5 An agent write refused for the same reason still returns the conflict and still exits 5 from the CLI
- [ ] #6 A check writes a note underneath a pane and asserts nothing was overwritten and nothing was lost
<!-- AC:END -->
