---
id: TASK-045
title: The skill does not teach the pane commands that now exist
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 03:55'
updated_date: '2026-08-20 04:08'
labels: []
dependencies: []
references:
  - skills/excalidraw-skill/SKILL.md
  - skills/excalidraw-skill/references/cheatsheet.md
  - src/cli/commands/pane.ts
  - src/cli/commands/viewport.ts
priority: high
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-033 added the commands that fix the failure the user reported: Codex kept re-targeting the first pane and overwriting the board they were reading, because layout was a click in the browser and a thread that can only talk had one pane and reused it.

The commands now exist:

  pane open [--board <key>]   makes a new pane and opens that board into it.
                              It CANNOT target an existing pane, so it cannot overwrite one.
  pane close <spec>           spec always required
  viewport --fit|--ids|--element|--zoom [--pane <spec>]
  screenshot --pane <spec>    two panes, two different pictures

The skill's CLI reference table has no row for any of them. The TASK-033 agent kept its edits under skills/ to the minimum the parity check forced, because a sibling agent owned that directory at the time. So the capability shipped and the agents who need it cannot find it.

TASK-037 rewrote the skill around the main path, current beside a proposal, and had to describe that path as needing a human to press Split. That is now false and should be the one-command move it describes.

Also stale for the same reason: any text saying an agent cannot create a pane, cannot screenshot the right pane, or should use describe --board as a workaround for not being able to see the proposal it drew.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The CLI reference table has rows for pane open, pane close, viewport and screenshot --pane
- [x] #2 The main-path section uses pane open --board rather than telling the agent a human must press Split
- [x] #3 Text describing pane creation or right-pane screenshots as impossible is gone
- [x] #4 The skill says pane open cannot target an existing pane, because that is the property that stops a thread overwriting the board a human is reading
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Cold-read the current skill for "current beside a proposal" and record the command sequence it produces, checked against real help and src/core/panes.ts.
2. SKILL.md main path: replace the "human pressed Split" premise with pane open --board, and drop the --pane left/right flags that a single pane refuses.
3. SKILL.md "Boards, panes, and what a command targets": add bullets for pane open / pane close and for --pane on screenshot and viewport; delete "you cannot screenshot the right pane" and the describe --board workaround; keep the mermaid primary-pane restriction, which is still real (src/server.ts /api/elements/from-mermaid).
4. SKILL.md CLI Quick Reference: rows for pane open, pane close, viewport; --pane on the screenshot row.
5. SKILL.md: fix the browser-tab lists (Interfaces, panes workflow, Error Recovery) to include making and closing a pane; requalify "answers screenshots" as the default pane, not the only one; fix step 6 of Drawing a New Diagram.
6. references/cheatsheet.md: new Panes and camera CLI section (pane open, pane close, panes, viewport); --pane on the screenshot row; correct the no-board command list.
7. references/architecture-workflow.md: screenshot the pane you drew in, and put a second board beside the first with pane open.
8. node scripts/sync-skills.mjs, then bun run test. Verify each AC and commit named files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote the skill's pane story around the commands TASK-033 added, and picked up the ADR 0012 change (TASK-039/TASK-042) that landed on the branch mid-task.

SKILL.md
- Main path no longer opens with "the human having pressed Split". It opens with `pane open --board <key>`, states that it cannot target an existing pane, and the worked example is now: board new (no --pane, one pane on screen), draw, save, `board save --variant option-a`, `pane open --board payments@option-a`, `screenshot --pane right`, compare.
- Dropped the `--pane left` / `--pane right` flags from the single-pane steps. With one pane its place is "the only pane" (src/core/panes.ts placeOf, arrangement 'single'), so `--pane left` matched nothing and the old sequence was refused outright.
- "Step 2 moves the pane it branched from" replaced with the opposite, per ADR 0012, including saveKind / panes.moved / panes.kept and the scratch-naming exception.
- "Boards, panes, and what a command targets": deleted "you cannot screenshot the right pane" and the `describe --board` workaround. Added bullets for pane open, pane close, and --pane on screenshot and viewport, plus the exit-4 rule. Kept the mermaid primary-pane restriction, which is still real (src/server.ts /api/elements/from-mermaid refuses when the primary pane holds another board).
- CLI Quick Reference: rows for `pane open`, `pane close`, `viewport`; --pane added to the screenshot row; the branch row now says it moves no pane.
- Requalified "answers screenshots" as the default pane rather than the only reachable one, fixed the three browser-tab lists, and the off-screen recovery tip now names `viewport --fit`.

references/cheatsheet.md
- New "Panes and camera" CLI section: panes, pane open, pane close, viewport, with the full flag set from run.ts.
- screenshot row takes --pane; the no-board command list gained viewport and pane close and notes pane open's optional --board.
- board save row: --as now carries the level (TASK-039), and a branch moves no pane.

references/architecture-workflow.md
- "Check your own work" uses `screenshot --pane <spec>`, with describe as the headless read.
- Second board goes beside the first with `pane open --board <name>`.

Verification, all on a private server on port 3941, never port 3000:
- ./bin/canvas help pane | viewport | screenshot | board read before writing; every documented flag comes from run.ts or the command module.
- Flag surface exercised: pane open --board (exit 4, no browser), pane close with no spec (exit 2), pane close right (exit 4), viewport --fit --pane right (exit 4), screenshot --pane right (exit 4), viewport with no mode (exit 2), viewport --element with --zoom-factor (exit 2).
- Headless main path on a throwaway vault: board new with no --pane, add, save, then `board save --board payments --variant option-a` returns saveKind "branch", savedFrom "payments", panes {moved: [], kept: []}, identity.level "service". `--as payments@option-b` also keeps level "service", confirming the TASK-039 behaviour I documented.
- node scripts/sync-skills.mjs, then bun run test: exit 0, including "every eval says how it is graded" and surface parity. evals.json untouched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The skill now teaches pane open, pane close, viewport and screenshot --pane, and the main path is one command instead of a request that a human press Split. pane open cannot target an existing pane, which is stated where an agent reading for the side-by-side move will hit it, and is the direct fix for a thread overwriting the board a human is reading. Every claim was read off ./bin/canvas help and the command modules before it was written; the flag surface and the branch save were exercised against a private server on port 3941. Also picked up ADR 0012, which landed mid-task: a branch no longer moves a pane, so the workaround line the skill taught is gone and the save's saveKind / panes.moved / panes.kept are documented instead.
<!-- SECTION:FINAL_SUMMARY:END -->
