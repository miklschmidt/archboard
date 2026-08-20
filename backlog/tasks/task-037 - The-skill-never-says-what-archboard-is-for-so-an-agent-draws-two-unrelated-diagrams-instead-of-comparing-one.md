---
id: TASK-037
title: >-
  The skill never says what archboard is for, so an agent draws two unrelated
  diagrams instead of comparing one
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 03:10'
updated_date: '2026-08-20 03:28'
labels: []
dependencies: []
references:
  - skills/excalidraw-skill/SKILL.md
  - docs/adr/0009-every-call-names-its-board.md
  - src/core/compare.ts
  - CONTEXT.md
priority: high
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Feedback from a real Codex plus GPT-Live session. The skill teaches the commands and nothing about the point of the tool, and the model failed in exactly the ways that predicts.

WHAT WENT WRONG, as observed:

1. Panes confused it. Which pane a command targets is implicit wherever it can be, by design (ADR 0009 keeps board explicit and lets pane default only where it cannot be wrong). The skill never explains that, so the model kept re-targeting the first pane and overwriting what was already there. The pane model has to be taught, not inferred: board is authority and always named, pane is display and defaults only when there is one pane on screen.

2. It did not know archboard is a comparison tool. The intended shape is current architecture in one pane, a proposal in the other, side by side. The skill presents boards, variants and panes as three unrelated features, so nothing tells the model to put them together.

3. It treated a variant as a blank canvas. Asked for a variant, it drew a completely different diagram. A variant is a MODIFICATION OF A SOURCE BOARD: branch the source with `board save --as <name>@<variant>`, then change what the proposal changes and leave everything else alone. This is not a style preference, it is what makes compare work at all. compare diffs on node identity, so a variant redrawn from scratch shares no node ids with its source and the diff degenerates into 'everything removed, everything added'. The skill has to say this and say why.

4. It ignored the element library. 111 curated stencils are on the server and readable with `library list` (TASK-023, TASK-026), and the model drew plain rectangles instead.

These are all one root cause: the skill is a command reference with no model of the work. Reading it end to end tells you how to call things and not what you are doing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The skill explains the pane model: board is always named, pane is display, and what the default targets when there is one pane versus two
- [x] #2 The skill states that archboard is for comparing architectures, and shows the current-in-one-pane, proposal-in-the-other workflow as the main path
- [x] #3 The skill defines a variant as a modification of a source board, tells the agent to branch with board save --as before changing anything, and explains that compare diffs on node identity so a redrawn variant produces a useless diff
- [x] #4 The skill tells the agent to check the library before drawing primitives, and shows the command
- [x] #5 An agent following the skill from cold can produce a current board and a proposal variant that compare cleanly, without a human correcting its approach
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite the head of skills/excalidraw-skill/SKILL.md: a 'What archboard is for' section before the interface section, stating the comparison purpose (current in one pane, proposal in the other), that every call names its board, that a variant is a branch of its source, and that the library comes before primitives. Include the main-path command sequence so a reader who stops after one screen still has it.
2. Rewrite the frontmatter description so the pointer leads with architecture comparison and keeps the drawing triggers.
3. Teach the pane model in 'Workflow: Boards': --board decides what a write lands on, a pane is only where a board is shown, only board open / screenshot / mermaid / viewport concern a pane, and the --pane default rule.
4. Rewrite 'Workflow: Comparing Variants' to open with variant-as-modification: branch with board save --board <src> --as <name>@<variant>, open it in the other pane, change only what the proposal changes. Explain the join on customData.archboard.node and the everything-added/everything-removed degeneration, quoting what compare actually warns.
5. Point the drawing workflow at library list before drawing primitives.
6. Refresh references/architecture-workflow.md: drop the stale describe-cannot-see-customData and mermaid-not-synced claims, name boards on every command, replace the snapshot before/after with the variant + compare loop, and keep it path-free (archboard, not ./bin/canvas).
7. Verify every documented flag against ./bin/canvas help <command>; run node scripts/sync-skills.mjs; walk the skill cold and check the command trace against the CLI and against what compare joins on.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote the head of skills/excalidraw-skill/SKILL.md: a purpose section (archboard compares architectures), three rules before the first command (name the board, branch the variant, list the library), a 'main path' command sequence, and a 'Boards, panes, and what a command targets' section separating board (authority, always named) from pane (display, only board open/board new choose one, screenshot/mermaid/viewport answer from the primary pane). Renamed 'Comparing Variants' to 'Workflow: Variants and comparison' and made it lead with variant-as-modification, the branch command, and why a redrawn variant destroys the join. Added the library-first step to the drawing workflow and to the Stencils section. Refreshed references/architecture-workflow.md (changes/selection read-back, promote-based bindings, variants instead of snapshots for proposals, dropped the stale 'describe cannot see customData' and 'mermaid is not synced' claims). Added changes, snapshot --force and branch semantics to references/cheatsheet.md. Ran node scripts/sync-skills.mjs.

VERIFICATION. Every documented flag was checked against ./bin/canvas help <command>. The whole main path was then run end to end against an isolated canvas server on port 3997 with its own vault and two simulated panes over WebSocket, never touching the live canvas on 3000:

  board new orders --level service --pane left     -> 'on screen in the left pane'
  library list --text                              -> '111 stencils in the library'
  add / promote x3 / board save --board orders
  board save --board orders --variant option-a     -> writes orders@option-a; LEFT PANE FOLLOWS to it
  board open orders --pane left                    -> current back on the left
  board open orders@option-a --pane right
  add + promote --variant option-a on the variant
  compare orders orders@option-a
    -> comparable true, sharedNodes 3, nodesAdded 1 (redis-cache), edgesAdded 1, edgesUnchanged 2

Redrawing the same architecture from scratch instead of branching was measured for contrast: sharedNodes 1, 2 added, 2 removed, 2 edges removed, from nothing but three labels being worded differently.

Two behaviours the skill now documents were established by running the code, not by reading it: 'board save --variant' moves every pane holding the source onto the branch (verified over the WebSocket protocol), and 'board save --as name@variant' drops the source's level while '--variant' carries it across (verified in the written frontmatter).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 03:28
---
Three code-level problems the skill can only paper over, named here rather than fixed (this task was documentation-only, and another agent was mid-build).

1. Already tracked as TASK-035. A freshly branched variant still reports every copied node as changed with variantAnomaly, and unchanged: 0. Measured again on a clean branch: nodesChanged 3, all three {variantAnomaly: {from: null, to: 'current'}}. The skill now tells the agent this is bookkeeping and not to narrate it as a difference, which is the best documentation can do. Note the scope in TASK-035 is 'save --as'; '--variant' has the same defect, and so does promote, which stamps variant 'current' even when the board it is promoting on is a variant (src/core/promote.ts:383, request.variant ?? DEFAULT_VARIANT). Defaulting promote to the board's own variant would fix the second half.

2. Already tracked as TASK-033. An agent cannot create a pane, so the side-by-side comparison the tool exists for depends on a human pressing Split. The skill says so plainly rather than pretending otherwise.

3. Not tracked anywhere I can find. Image export is answered only by the primary pane (frontend/src/shell/Shell.tsx:273 sets primary = index === 0; useCanvasSession.ts:724 answers export only when primary), so screenshot always captures the LEFT pane and there is no way to see a proposal held on the right. This is the same root as TASK-033 #4 (viewport can only address the primary pane) but is not in its acceptance criteria. The skill routes around it with 'describe --board <key>', which is a real workaround and not a substitute for seeing the picture.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Turned skills/excalidraw-skill/SKILL.md from a command reference into a document that says what archboard is for. It now opens with the comparison purpose, three rules an agent must hold before its first command (name the board, branch the variant, list the library), and a main-path command sequence for current-in-one-pane against proposal-in-the-other. A new section separates board from pane: board is what a command writes to and is always named; pane is where a board is on screen, and only board open and board new choose one, while screenshot, mermaid and viewport are answered by the primary (left) pane. 'Workflow: Variants and comparison' now defines a variant as a modification of its source, gives the branch command, and explains that compare joins on node identity slugged from the node's name, so a proposal redrawn from scratch degenerates into everything-removed-everything-added. The drawing workflow and the Stencils section now put library list before any primitive. references/architecture-workflow.md was refreshed for the read-back loop and had stale claims removed; references/cheatsheet.md gained changes, snapshot --force and the branch semantics of board save.

Verified by running the documented sequence end to end against an isolated canvas server on port 3997 with its own vault and two panes simulated over the WebSocket protocol, leaving the live canvas untouched. It produces comparable: true, sharedNodes 3, one node and one edge added and two edges unchanged, which is a clean diff of exactly the change made. The same architecture redrawn from scratch instead of branched produces sharedNodes 1 with 2 added and 2 removed, which is the failure the task reported. Every documented flag was checked against ./bin/canvas help. No source was changed and no build or test suite was run.
<!-- SECTION:FINAL_SUMMARY:END -->
