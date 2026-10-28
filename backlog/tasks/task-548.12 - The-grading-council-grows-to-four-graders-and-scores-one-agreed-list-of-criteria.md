---
id: TASK-548.12
title: >-
  The grading council grows to four graders and scores one agreed list of
  criteria
status: Done
assignee:
  - '@claude'
created_date: '2026-10-27T12:13:00Z'
updated_date: '2026-10-28T01:20:00Z'

updated_date: '2026-10-28T01:21:00Z'
labels:
  - renderer
  - tooling
dependencies: []
documentation:
  - docs/design/grading-council.md
parent_task_id: TASK-548
ordinal: 966000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner added Gemini 4 Argon, through Cursor, as a fourth grader beside Opus, gpt-6.1-sol and gpt-6-astra. Each grader had its own criteria and gave a bare verdict per pair, so a verdict could not show which quality decided it, and graders that disagreed could not be compared. The owner wants the council to agree on one list of criteria and to score each criterion from 1 to 10 for both pictures of a pair. The owner's weighting (defects are defects; among pictures without defects, tight composition counts most) still comes first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Gemini 4 Argon writes its own criteria from the same sample pictures before it sees the other graders' criteria, and they are recorded
- [x] #2 All four graders agree on one list of criteria, each with a test and anchors for the 1 to 10 scale, recorded in docs/design/grading-council/
- [x] #3 The procedure in docs/design/grading-council.md has each grader score every criterion from 1 to 10 for both pictures, list defects apart from the scores, and states how scores become a verdict per pair with four graders
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Gemini 4 Argon (Cursor, reasoning effort high, the highest it offers) writes its own criteria from PRODUCT.md, CONTEXT.md and the twelve samples in /tmp/council/samples, with the same brief the other three had, before it reads theirs.
2. Proposal round: each of the four graders reads all four criteria files and the owner's weighting and proposes one shared list: criteria with a test, anchors for 1, 4, 7 and 10, and a weight; defects stay a gate outside the scores; a rule from scores to a verdict.
3. Agreement rounds: merge the proposals into one draft that keeps each grader's wording where it differs; each grader accepts or amends every item; repeat until all four accept, at most three rounds, else 3 of 4 with the dissent recorded.
4. Record the agreed criteria as docs/design/grading-council/criteria.md, replacing the per-grader files; rewrite the procedure for scores, defects and four graders; make the tally a script if counting by hand is no longer practical.

Spec review: reproduce the exact 0.40 boundary and incomplete four-grader inputs at the tally command. Keep weighted totals exact until after the median. Refuse incomplete council input before deciding pairs. Cover both behaviors through the command. These fixes leave the architecture boards and consumer workflow accurate. Keep task statuses unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Argon wrote its own criteria (commit e62d75d4e) from PRODUCT.md, CONTEXT.md and the twelve samples in /tmp/council/samples, with the brief the other three had, before it saw theirs.

Agreement: round 1, each grader proposed one shared list (4 to 7 criteria, anchors at 1/4/7/10, weights, defects, rules) and scored the samples with it. The chair merged them into one draft: K compact frames and space 30, R short direct relationships 25, T traceable lines 18, L owned labels 10, O reading order 10, W readable at pane fit 7; nine defects outside the scores; one grader: weighted Q, margin 0.40; council: defects ruled by the person running it, then the median of the graders' margins. Round 2: all four accepted weights, defects, rules and the draft's answer to all six open questions; Opus, Sol and Astra amended How to look, K, L and W. Round 3: the chair applied the amendments (round down; a pocket is at least one card wide and four card areas; a crowded label is closer than a quarter label height; a half-card margin for reading order; no aspect-ratio bands); all four accepted every change, no objection.

Calibration on the twelve samples: scores more than 2 apart between any two graders fell from 31 of 72 (round 2) to 6 of 72 (round 3). All four graders reached the same verdict on every pair in both rounds: Board persistence blocks better, Live panes track better, Archboard server routes both fail (lines through the Pane state header, found by all four), the other three same. L is 10 on almost every sample (layout gaps are about 15 px against a 7 px threshold), so it only catches touching stacks today. Argon missed the header defects in round 1 and found them in round 2, after reading Opus's round-1 proposal, so its own eye for fine defects is not yet shown; the rulings step covers any grader's misses only if another grader reports the defect.

scripts/council-tally.ts unblinds verdicts/<grader>.json with key.json, refuses while a reported defect has no ruling in rulings.json, and prints each pair's verdict, the graders' margins and whether the change passes (exit 1 when it fails). Checked on synthetic verdicts: an unruled defect stops it (exit 2); a malformed score is refused with the field; a new defect in an after picture makes the pair worse and fails the change; the documented example parses. Policy lint passes. Artifacts: /tmp/council/agree (sources, r1, r2, r3, drafts).

Standards review, 2026-10-28: malformed JSON in the key, grader verdicts, or rulings exits 1 without naming the input file. The review will use the existing refusal path and add one process test table for these three inputs. This repair changes no architecture board meaning or consumer skill workflow.

Standards review complete: readJson now routes JSON read and parse failures through the command refusal. It names the input file and exits 2. The three process cases fail before the fix and pass afterward. They test the exit status, empty stdout, and file path without locking diagnostic wording. All 17 focused renderer and rasterizer cases pass. The complete nix develop gate passes all 20 tasks, including all 19 browser files. The full log is /tmp/archboard-standards-review-check.log. Lint and type rules remain unchanged. The final simplification pass keeps the fix in the existing reader.

Spec review: three command regressions reproduce exact 0.40 margins classified as same, including a worse change that exits zero. Weighted totals now stay in integer hundredths through the median. The three regressions pass in both before-side orientations and at a split median. No drawing, board meaning, consumer workflow, acceptance state, or task status changes.

Spec review: the command accepted one, three, or five grader files, and silently omitted a grader that skipped a pair. Four failing command regressions verify this. The tally now requires exactly four files and names the grader and pair when a score is missing. All seven tally regressions pass. The procedure states the input requirement. Task statuses and council acceptance remain unchanged.

Review validation: nix develop --command bun run check passes all 20 tasks, including all 19 browser files. The module, system, and repository lanes report 4975, 285, and 168 passing tests with no failures. The repository lane includes all seven tally regressions. Final simplification replaces skipped scores with a required score in one map. The architecture boards and consumer skill remain accurate. Task statuses and acceptance states remain unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The grading council has four graders and one agreed list of criteria.

What changed:
- Gemini 4 Argon, through Cursor, joined Opus, gpt-6.1-sol and gpt-6-astra.
- docs/design/grading-council/criteria.md holds the agreed list: six criteria scored 1 to 10 with anchors and weights (composition 55 of 100), nine defects kept outside the scores, and the decision rules. It replaces the four per-grader files.
- docs/design/grading-council.md describes the scores file, the rulings on defects and the tally.
- scripts/council-tally.ts decides each pair by the median of the graders' weighted margins and says whether the change passes.

Evidence:
- All four graders accepted every item in round 3.
- On the twelve samples, all four reached the same verdict on every pair, and their scores came within 2 points in 66 of 72 cases.

Risks:
- L rarely leaves 10 on today's layouts.
- Argon's own eye for fine defects is not yet shown.
<!-- SECTION:FINAL_SUMMARY:END -->
