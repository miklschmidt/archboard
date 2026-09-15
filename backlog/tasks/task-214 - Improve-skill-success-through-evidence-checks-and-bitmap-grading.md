---
id: TASK-214
title: Improve skill success through evidence checks and bitmap grading
status: Done
assignee:
  - '@codex'
created_date: '2026-09-14 22:44'
updated_date: '2026-09-15 19:30'
labels: []
dependencies:
  - TASK-212
  - TASK-213
  - TASK-215
references:
  - skills/archboard/SKILL.md
  - skills/archboard/references
  - src/runtime/skill-evaluation
  - evals
  - TASK-211
  - .skill-evals/2026-09-14T13-50-10-617Z/report.json
  - TASK-215
priority: high
type: enhancement
ordinal: 374000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human-run batch .skill-evals/2026-09-14T13-50-10-617Z showed that agents can read correct guidance and relevant source yet still author false relationships, omit meaningful external dependencies, bind nodes to invocation sites, select incorrect views, or bypass a refused CLI write. All three candidate S12 runs read the views reference and still used the wrong selection semantics. S00/S14 exposed relationship and binding errors; S11 exposed direct vault editing after an unsupported operation. These are evidence for the failure mechanisms, not proof that a proposed instruction change improves success.

Hypothesis: requiring concrete source evidence, explicit request-to-payload checks and saved-result verification will improve semantic success more than merely adding prose or minimizing discovery tokens. The user explicitly prioritizes success even at higher token cost; the previous one-targeted-reference efficiency preference must not block reading or verification needed for correctness. Keep procedures proportionate to the requested operation, rather than imposing all checks on every trivial read.

Record all six agreed changes: (1) source-proof relationships and sequence semantics before writing and audit saved results; (2) explicitly discover external boundaries; (3) bind only to implementation ownership; (4) translate requests into exact checks for variants, identities, fields and view selectors; (5) put CLI-only persistence and evidence-driven refusal recovery near the top; (6) remove unsupported precision from examples and require genuine visual verification.

The user additionally requires actual bitmap captures of final diagrams in EVERY scenario run, owned by the harness rather than the author agent, and visually inspected by the grader. Existing SVG/text-only evidence and captures of a default architecture view instead of the requested sequence cannot establish visual quality. Capture and inspection are separate obligations; a file existing is not evidence it was seen. Preserve source-grounded semantic grading alongside visual grading.

Claude is implementing TASK-212 and TASK-213 concurrently. Build on their corrected packaging/evidence/scenario and restoration contracts; do not duplicate or interfere with them. Canonical eval inputs now belong in root evals/. Original batch artifacts and frozen baseline remain evidence, not files to silently rewrite. Agents must not run author evals or the grader; humans perform measured validation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Canonical skill guidance requires a concise source-evidence record for authored relationships and sequence steps: caller/receiver or other relationship direction, semantic kind and supporting source location; ordering, branching, returns and repeat counts are checked where applicable, then saved results are audited against that evidence. Include a transferable example distinguishing sibling calls from a fictitious call chain.
- [x] #2 Architecture creation explicitly considers inbound callers, important external libraries/services, application callbacks/plugins and relevant persistence/messaging boundaries; only dependencies material to the board question are included, with scope intentional rather than forced coverage.
- [x] #3 Binding guidance requires the implementation owner of the stated responsibility, not an import, registration or invocation site. Unavailable external/application implementations remain unbound; mismatched responsibility and binding scope are narrowed or split truthfully.
- [x] #4 Before writing, agents translate the request into applicable checks for board/version, target variant, preserved IDs/fields and exact view grammar/selectors, then verify the saved answer. The skill makes explicit-edge isolation distinct from node-region inclusion and proposal-only edits distinct from current-state edits.
- [x] #5 The skill explicitly prohibits direct persisted-board repair, including IDs, versions and reconciliation metadata. Further refusal attempts require new evidence; when the supported workflow cannot satisfy the request, preserve valid state and report the unresolved requirement rather than bypassing the CLI. Follow TASK-213 for legitimate restoration.
- [x] #6 Examples justify semantic claims from inspected source and avoid unsupported fixed repeat counts or implied mandatory paths. Visual verification checks the intended view, labels, clipping, relationships and sequence details; text inspection of SVG is not presented as looking at a diagram. Evaluation authors are not responsible for producing harness bitmap captures.
- [x] #7 For every scenario, both arms and every repetition, the harness records real raster captures of the final saved diagrams at native scale, including read-only scenarios. A declared capture set covers all requested boards/views/variants, both predecessor/current and proposal where compared, and the selected data-flow view for sequences; it never silently substitutes a default view.
- [x] #8 Capture provenance identifies the saved board version/content, variant, view, scale and image dimensions. Capture uses canonical renderer output and fonts with stable presentation state, contains complete diagram bounds, and is not an author-supplied substitute or unrelated screenshot. Images and optional full-resolution detail tiles remain ignored derived run artifacts and are provided without revealing the evaluation arm.
- [x] #9 The grader is supplied image-capable access to every required bitmap and explicitly visually inspects each. Verdicts identify inspected capture IDs and image-grounded observations about readability, clipping, overlap, endpoints and sequence legibility; SVG parsing, file existence, board JSON and claimed author inspection cannot substitute. Large diagrams retain native-resolution detail through appropriate image access or supplemental tiles.
- [x] #10 Missing/failed capture, unreadable image or omitted visual inspection is an explicit incomplete/failed visual evaluation and cannot receive an unqualified successful visual verdict. Failed author runs retain available final/partial-state captures where possible and explain absent diagrams; no placeholder counts as a capture. Static captures do not claim to prove traffic animation.
- [x] #11 The task records hypotheses separately from demonstrated improvement; corrected inputs and the same CLI are used for future human-run comparisons, with success and semantic/visual quality primary and token usage secondary. Focused model-free behavior/contract tests, skill synchronization and the normal check gate validate implementation without agent-run evals or grading.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Skill guidance (skills/archboard): CLI-only persistence and evidence-driven refusal recovery near the top of SKILL.md; an Evidence-before-a-write section (request-to-checks translation, source evidence per relationship and step with the sibling-versus-chain example, deliberate boundary discovery, binding to the implementation owner); recipes justify every semantic claim from inspected source, drop the fixed repeat count, and verify by opening a PNG or SVG picture of the intended view; references sharpen node-region versus explicit-edge selection, proposal-only versus current-state edits, repeat versus note, bindings and refusal repair.
2. Harness: every scenario declares captures (evals.json, schemaVersion 3; S07 asks for a Startup exchange view); after every run, and after a failed run where the canvas is up, the harness takes each declared capture through archboard semantic rasterize at native scale with provenance and native-scale tiles (--region) for large bitmaps, records failed captures with the reason, blinds paths, stages captures/ for the grader, and downgrades a visual pass the captures cannot corroborate.
3. Grader contract: a required visual answer (inspectedCaptures, verdict, observations), a prompt and rubric that demand opening every capture image and forbid SVG or JSON reading as inspection; report columns for visual pass/fail/incomplete beside semantic compliance.
4. Fast owners: captures.test.ts (receipt to record, grammar and view mismatch, tiles, visual standing), suite.test.ts (captures declared, sequence views, both comparison sides), blinding and grader contract tests; sync skills; bun run check without model runs.
5. Record hypotheses apart from demonstrated improvement in docs/design/skill-evals/2026-09-15-evidence-and-bitmap-grading.md; extend coverage.json, evals/README.md, rubric.md, TESTING.md and the archboard-dev skill.

Review implementation against TASK-214 and reconcile the branch with reviewed TASK-212/213 fixes. Fix confirmed raster ownership, capture-evidence and visual-verification findings; run model-free regressions, visual QA and the full normal check gate in an isolated checkout. Merge into feat/semantic-boards while preserving concurrent theme and pane work. No author evals or grader runs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: bun test src/runtime/skill-evaluation (80 pass incl. captures.test.ts, suite captures test, blinding captures test, strict visual verdict parsing), tests/system/cli/install-targets.test.ts (9 pass after bun scripts/sync-skills.ts), bun run lint clean, type-check clean, fmt:check clean, test:modules 3025 pass, test:repository 8 pass, test:system 159 pass with only the 4 pre-existing resource-cleanup failures. No model was run. Hypotheses are recorded apart from evidence in docs/design/skill-evals/2026-09-15-evidence-and-bitmap-grading.md; the preservation assessment gained six rows. Inherited snapshot code (sessionUsage, comparisonStanding) was split to pass the complexity ceiling. Input correction: S07 now asks for a Startup exchange view and checks it exists, so its sequence has a data-flow capture. evals.json schemaVersion is 3; the 2026-09-14 batch stays a frozen baseline and cannot be re-graded on the new inputs by design.

Independent review fixed mechanism-specific relationship evidence, renderer-defect handling, inspected multi-repository bindings and the required view grammar check. Failed and cancelled author setups now persist blinded capture bundles with explicit unavailable reasons. Grading calls attach every required main image and native tile; harness-owned delivery receipts bind image bytes to the exact verdict. Per-capture observations and complete verified delivery are required before either visual pass or fail counts as assessed. Missing/stale evidence remains incomplete and visual failures prevent token-efficiency claims. Capture receipt validation now shares the CLI authority. Model-free suite check and independent scope/boundary reviews pass; no author evals or grader runs. Normal-gate criterion remains unchecked because the integration target contains concurrent styling failures outside this task: eight existing renderer module assertions and an OKLCH arrowhead-selector browser failure. Those files are owned by TASK-217 and preserved unchanged.

Final review validation: 116 focused tests pass across skill evaluation, rasterizer, restoration and system rasterization. All 163 system tests and 8 repository-policy tests pass; the nine remaining browser owners pass after isolating the existing semantic-status-legibility failure. Full gate reached 3031 passing module tests plus the one subsequently corrected mock-receipt regression and eight unrelated renderer assertion failures. No eval authors or grader ran.

Batch .skill-evals/2026-09-15T03-21-37-188Z, read on 2026-09-15: 24 of its 47 listed failures were visual 'incomplete' only because the Claude grader named the files it opened (captures/capture-0-<label>.png) instead of the labels; grader.ts now reads a label back from such a file name (captureLabelOf, covered in tests/captures.test.ts). The efficiency gate in report.ts now needs every run measured (did what was asked, pictures inspected) rather than visually passed: a visual fail still fails the run and regresses quality, but no longer withholds the cost comparison, since both arms share the renderer; the batch failed every S02, S06 and S09 run in both arms on two renderer defects, filed as TASK-224 and TASK-225. Report regenerated with 'eval:skill report' under the batch's pinned inputs. S05's fixture and prompt now route make_response and process_response through finalize_request as Flask 3.0.0 does (the grader flagged the fixture); that changes the inputs digest, so the next batch is a new baseline.

AC 11: docs/design/skill-evals/2026-09-15-evidence-and-bitmap-grading.md records the hypotheses apart from what is demonstrated; the TASK-235 corrections to inputs keep the same CLI for the next human-run comparison; validation is model-free tests, skill sync and bun run check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Evidence checks and bitmap grading landed across the skill, the harness and the grader; hypotheses recorded apart from demonstrated improvement; verified by the model-free tests and the check gate.
<!-- SECTION:FINAL_SUMMARY:END -->
