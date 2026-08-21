---
id: TASK-079
title: >-
  A refused write does not interrupt, and the three outcomes are offered when
  the human asks
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-20 20:17'
updated_date: '2026-08-21 14:00'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/core/board-hold.ts: a per-board hold, in kept(). It carries the conflict that started it, when, how many writes it has taken since, and the board content itself. Beginning a hold is what a refused write does after refusing; clearing one is what an outcome does.
2. readBoardContent() answers with the held copy while a board is held. One seam, so describe, query, compare, the change feed, the panes and every route read the same board without knowing about holds.
3. persistBoard(): held boards take the write into the hold and do not touch the note or savedAt; unheld boards write as now, and a BoardWriteConflictError begins the hold and is still thrown. The write that trips it is refused clean — nothing captured — so an agent's retry is a retry and not a duplicate, and AC 1 and 5 stand.
4. The pane learns from the 409 and immediately rebases: one report carrying its whole scene, accepted only into a held board, which makes the held copy what the human is looking at rather than their note plus one gesture. Until it lands the pane renders nothing the server sends, because the premise that a reply was computed from what this pane sent is broken.
5. The mark: a chip in the board bar that says the board is not saving, and a button that summons the existing ConflictDialog. No modal fires on its own.
6. The three outcomes, each clearing the hold: open --reload takes the note and discards the held copy; save --force writes the held copy over theirs; save --as writes the held copy to another note, releases the source to their version, and moves the panes with it - a deliberate exception to ADR 0012, because staying behind means watching your own work vanish.
7. Agents: every write to a held board answers with the hold and the three commands; board list and board info carry it too. The CLI exits 5 on the refusal that starts a hold.
8. Docs: ADR 0006 gains what ADR 0015 changed about when it fires, CLAUDE.md gains the hold, the skill and the parity note.
9. check-boards gains the AC 6 block: write a note underneath, assert the refusal, assert the hold takes further writes without touching their note, then each of the three outcomes. Revert-proof and count.
<!-- SECTION:PLAN:END -->
