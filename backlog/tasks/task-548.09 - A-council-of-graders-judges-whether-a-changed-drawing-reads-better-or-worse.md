---
id: TASK-548.09
title: A council of graders judges whether a changed drawing reads better or worse
status: Done
assignee:
  - '@claude'
created_date: '2026-10-26T16:24:00Z'
updated_date: '2026-10-26T17:03:00Z'
labels:
  - renderer
  - tooling
dependencies: []
parent_task_id: TASK-548
ordinal: 962000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner dropped byte-identical drawings as the bar for layout speed work. A change that alters drawings needs a judgment of whether each drawing reads better or worse to a person. The owner wants three graders (Opus, gpt-6.1-sol and gpt-6-astra), each forming its own criteria for a readable architecture diagram, not anchored on the old scorecard metrics (packages/renderer/tests/runtime/support/drawn-scorecard.ts and the drawn-* checks).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A command turns two corpus renders into blind pairs of PNG pictures for every drawing that differs, with the key to which side is which kept apart from the graders
- [x] #2 Each grader writes its criteria before it sees a pair, and the criteria are recorded
- [x] #3 A council run records each grader's verdict per pair (better, worse or same, with a reason) and the majority, and the procedure is written down in docs/design
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Picture half (this worker): 1. scripts/render-corpus.ts exports its key format (keyOf, drawingOf, svgFileOf, runOf) and runs only as main. 2. scripts/council-pairs.ts <before> <after> <out>: runs each checkout's own render-corpus (current variants, light theme, both comparison settings, --svg) so each side is drawn by its own code; keeps the keys of one vault that differ, drops a comparison drawing that equals its plain one on both sides, lists one-side-only keys in key.json; --limit N with --sample picks N at random by --seed; rasterizes both sides at one shared scale (native, capped by --max-side) with the renderer's headless Chromium rasterizer; writes pairs/NNN/{A,B}.png and about.json (board, view, engine) and key.json outside pairs/. 3. docs/design/grading-council.md: pairs, criteria first, per-pair verdicts, majority after unblinding, defects fail a change. 4. Prove on 50c045f6d -> 764d3b9ca (zero pairs, one-side keys) and a temporary PACK_GAP change in an exported copy (real pairs).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Picture half built: scripts/council-pairs.ts and docs/design/grading-council.md; render-corpus.ts exports its key format (keyOf, drawingOf, svgFileOf, runOf) and runs only as main.

Decisions: each side is drawn by running that checkout's own scripts/render-corpus.ts (current variants, light, comparison on and off, --svg), so its board reader, layout and painter are its own; a corpus run with SVGs takes about 30 s and 290 MB per side, so the command always renders afresh into a new <out> rather than reusing runs. One rasterizer (this checkout's headless Chromium) turns both SVGs of a pair into PNGs at one shared scale: native, shrunk only past --max-side (default 4096). A comparison drawing is paired only where it is a different picture from its plain one on either side (with --variants current it never is). When all three graders disagree the pair counts as same (written in the doc). No test: the blindness is structural (writePair gets no side or key; key.json is written at <out>, never under pairs/), and a test would need two built checkouts and Chromium.

Evidence: 50c045f6d -> 764d3b9ca: 0 pairs, 104 keys on one side only (52 + 52, the renamed Renderer layout variant), matching render-corpus compare on the same runs. Temporary PACK_GAP 72 -> 96 in an exported copy of 764d3b9ca (never committed): 54 blocks drawings differ, 54 pairs, 24 before-at-A and 30 before-at-B with seed 11; rasterizing took 49.9 s (about 0.9 s a pair) after about 33 s of corpus renders; pairs 001 and 004 checked by eye and readable.

Criteria: docs/design/grading-council/criteria-{opus,sol,astra}.md, each written from PRODUCT.md, CONTEXT.md and twelve sample pictures (/tmp/council/samples) before any pair, without the scorecard, the drawn-* checks or the layout rules. Procedure: docs/design/grading-council.md; the parent closed a blinding leak (graders grade a copy of pairs/ in a directory of their own, never beside key.json). Calibration run: six pairs sampled with seed 3 from the 54 pairs of a PACK_GAP 72 to 96 change (/tmp/council/case2, grading copy /tmp/grading-calib). Opus, gpt-6.1-sol and gpt-6-astra (xhigh) each graded all six 'same'; majority same on all six, so the change passes. All three independently reported the same pre-existing defect on pairs 016, 035, 038 and 039 (a trunk joining different sources toward different targets); the parent confirmed it on 016 A by eye. It is tracked as a bug under TASK-548.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The grading council exists and ran once.

What changed:
- scripts/council-pairs.ts turns two checkouts into blind A/B PNG pairs of every drawing that differs, each side drawn by its own code, with key.json kept outside pairs/.
- docs/design/grading-council.md is the procedure; docs/design/grading-council/ holds each grader's own criteria.

Evidence:
- A calibration on six pairs of a spacing change: all three graders graded every pair 'same'.
- The three graders independently found the same trunk defect in four boards, now a bug task under TASK-548.

Follow-ups:
- Verdict counting is by hand; a script can come when the council grades large runs.
<!-- SECTION:FINAL_SUMMARY:END -->
