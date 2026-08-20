---
id: TASK-039
title: >-
  board save loses the level on --as and drags panes onto the branch on
  --variant
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 03:29'
updated_date: '2026-08-20 03:53'
labels: []
dependencies: []
references:
  - src/core/board.ts
  - skills/excalidraw-skill/SKILL.md
  - docs/adr/0003-boards-as-individual-vault-notes.md
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two surprises in board save, both found by running the code while rewriting the skill for TASK-037, both currently documented as behaviour because there was nothing else to do with them.

1. LOSS. `board save --board <src> --as <name>@<variant>` drops the source board's `level`. `--variant` carries it across. Level is board identity (ADR 0003, CONTEXT.md), it is a controlled vocabulary the project grew deliberately, and --as is the branch command INSTALL.md and TESTING.md both teach. Losing it silently means a proposal sits at no level while its source sits at system, and nothing says so.

2. SURPRISE. `board save --board <src> --variant <v>` moves every pane holding the source onto the new branch. So the obvious way to make a proposal takes the current architecture off screen, and the agent has to put it back with an explicit `board open <src> --pane left`. The skill now tells agents to do exactly that, which is a workaround in documentation for behaviour that should not need one.

Whether the pane should follow is a real question, not an obvious bug. Following is defensible: you branched, so you are now working on the branch. Not following is also defensible: you branched in order to compare, so the source should stay where it is. What is not defensible is that it happens silently. Whichever way it goes, the answer should name the pane it moved, the way board open already does.

Both belong to whoever next owns src/core/board.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 board save --as carries the source board's level across, like --variant does
- [x] #2 A branch operation that moves a pane says which pane it moved and to what
- [x] #3 The pane-following behaviour is decided deliberately and the reasoning is recorded, not left as an accident of implementation
- [x] #4 The skill's workaround instruction (open the source back into the left pane after branching) is no longer needed, or is still needed for a stated reason
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Carry the level across --as. In POST /api/boards/save the target identity is built fresh from the name, so it starts with no level; take the source board's level when the caller states none, which is what --variant already does by spreading the source identity.

2. Decide the pane question: a branch does not move a pane, naming the scratch board does. Two operations are conflated in one endpoint. Naming the scratch board gives a placeholder its first home, and there is nothing to stay behind for. Branching a board that already has a home leaves the source intact in the store, in the vault and worth looking at, and it was branched in order to be compared against. Also settles 'save elsewhere', the third way out of a write conflict, which today parks a copy and drags the pane onto the copy.

3. Put the rule in src/core/board.ts as a small classification (same-board / named / branch) plus the predicate that says whether panes follow, so server.ts reads as one call rather than an inline condition.

4. Make the answer name panes, the way board open does. The save response gains panes.moved (panes this save moved onto the saved board) and panes.kept (panes still on the source), and the CLI says which pane moved and to what, or that the branch was written and is not on screen with the board open line that would show it.

5. Record the reasoning as ADR 0011, cited from the code. It is a real trade-off with a defensible alternative, and a reader finding 'panes do not follow a branch, but do follow the naming of scratch' will otherwise wonder why.

6. Docs: CLAUDE.md, the board save usage in src/cli/run.ts, the save_board MCP description, TESTING.md step 4. SKILL.md is TASK-041's; leave a comment naming the two lines to drop.

7. Coverage in scripts/check-boards.mjs: --as keeps the level and writes it into the frontmatter, an explicit --level still wins, a branch leaves both panes where they were and says so, naming the scratch board moves the pane and says which.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Level. POST /api/boards/save now takes the level from the source board when the caller states none, on the --as path as well as --variant. Before: `save --board ledger --as ledger@option-a` returned identity {board:ledger,variant:option-a} with no level and wrote a note with no level line, while the source sat at service. After: level service in the identity and `level: service` in the note. An explicit --level still wins.

Panes. Decided that a branch moves nothing on screen and naming the scratch board does, recorded as ADR 0011 and encoded in classifyBoardSave/panesFollowSave in src/core/board.ts so server.ts reads as one call. The rejected alternative was to keep panes following: defensible on 'you branched, so you are on the branch now', but archboard exists to hold current beside a proposal and the branch is the moment that comparison becomes possible, so taking the source off screen exactly then is the opposite of the request. It also settles 'save elsewhere', the third way out of a write conflict (ADR 0006), which parks a copy and used to drag the human onto the copy. And it restores a rule the code already had: board open and board new choose what is on screen, everything else names a board and writes to it.

Saying it. The save response gained saveKind ('same-board' | 'named' | 'branch'), savedFrom, and panes { moved, kept }, each pane named the way board open names it. The CLI turns that into a sentence: a branch says which panes still hold the source and how to put the branch up, naming scratch says which pane it moved. Also fixed the adjacent 'the the only pane pane' wart in board open and board new by routing every pane phrase through one helper.

Validation: bun run test, 164 checks, 0 failures, exit 0. bun run type-check clean. Twelve new checks in scripts/check-boards.mjs cover the level on --as, an explicit level winning, a branch leaving both panes and sending them no board_switched, the response naming the kept pane and the source, the branch existing off screen, naming scratch moving its pane and saying which, and a plain save reporting no screen decision. CLI sentences exercised against a live server with one and two real WebSocket panes.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 03:52
---
Two changes needed in files this task does not own.

FRONTEND (TASK-033 agent, frontend/src/shell/Shell.tsx). attemptSave does setBoardInfo(saved) unconditionally, which assumed a save always leaves the pane holding what was written. That is now only true when saved.panes.moved contains this pane's clientId. After a branch the pane still holds the source, so boardInfo points at a board the pane is not showing and the dirty indicator compares against the branch's savedAt. The fix: setBoardInfo(saved) only when saved.panes.moved.some(p => p.clientId === status?.clientId), otherwise leave boardInfo alone (the header already prefers status.board, so it stays correct). The notice should also say the branch is not on screen, e.g. 'Branched <source> to <board>. It is not on screen; open it in a pane to see it.' The response now carries saveKind ('same-board' | 'named' | 'branch'), savedFrom, and panes: { moved, kept } with each entry as { paneId, clientId, place, position }.

SKILL (TASK-041 agent, skills/excalidraw-skill/SKILL.md). Two workaround lines are now wrong and should be deleted:
- line ~49: 'archboard board open payments --pane left   # put current back; see below'
- line ~492: 'archboard board open payments --pane left   # the branch moved this pane; put current back'
The paragraph at ~61 headed 'Step 2 moves the pane it branched from' is now false and should be replaced with the opposite: a branch writes a second board and moves nothing on screen, so the source stays put and the branch is opened into the other pane (ADR 0011). The paragraph at ~497 saying '--as payments@option-a also branches, but it drops the level unless you pass --level too, so prefer --variant' is fixed: --as carries the source's level across now, same as --variant, so that preference no longer has a reason.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
board save --as now carries the source board's level across, the same way --variant always did, so a proposal no longer sits at no level while its source sits at system. Branching no longer moves a pane: you branch in order to compare, so the panes holding the source keep holding it and the branch is put up with board open like any other board. Naming the scratch board still moves its pane, because the placeholder and the named board hold the same drawing and there is nothing to stay behind for. Both cases are reported: the save answer carries saveKind, savedFrom and panes { moved, kept }, and the CLI names the panes the way board open does. The reasoning is ADR 0011. Verified with twelve new checks in scripts/check-boards.mjs and by driving the CLI against a live canvas with one and two real panes; bun run test passes 164 checks, exit 0.
<!-- SECTION:FINAL_SUMMARY:END -->
