---
id: TASK-214
title: Improve skill success through evidence checks and bitmap grading
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-14 22:44'
updated_date: '2026-09-14 23:01'
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
- [ ] #1 Canonical skill guidance requires a concise source-evidence record for authored relationships and sequence steps: caller/receiver or other relationship direction, semantic kind and supporting source location; ordering, branching, returns and repeat counts are checked where applicable, then saved results are audited against that evidence. Include a transferable example distinguishing sibling calls from a fictitious call chain.
- [ ] #2 Architecture creation explicitly considers inbound callers, important external libraries/services, application callbacks/plugins and relevant persistence/messaging boundaries; only dependencies material to the board question are included, with scope intentional rather than forced coverage.
- [ ] #3 Binding guidance requires the implementation owner of the stated responsibility, not an import, registration or invocation site. Unavailable external/application implementations remain unbound; mismatched responsibility and binding scope are narrowed or split truthfully.
- [ ] #4 Before writing, agents translate the request into applicable checks for board/version, target variant, preserved IDs/fields and exact view grammar/selectors, then verify the saved answer. The skill makes explicit-edge isolation distinct from node-region inclusion and proposal-only edits distinct from current-state edits.
- [ ] #5 The skill explicitly prohibits direct persisted-board repair, including IDs, versions and reconciliation metadata. Further refusal attempts require new evidence; when the supported workflow cannot satisfy the request, preserve valid state and report the unresolved requirement rather than bypassing the CLI. Follow TASK-213 for legitimate restoration.
- [ ] #6 Examples justify semantic claims from inspected source and avoid unsupported fixed repeat counts or implied mandatory paths. Visual verification checks the intended view, labels, clipping, relationships and sequence details; text inspection of SVG is not presented as looking at a diagram. Evaluation authors are not responsible for producing harness bitmap captures.
- [ ] #7 For every scenario, both arms and every repetition, the harness records real raster captures of the final saved diagrams at native scale, including read-only scenarios. A declared capture set covers all requested boards/views/variants, both predecessor/current and proposal where compared, and the selected data-flow view for sequences; it never silently substitutes a default view.
- [ ] #8 Capture provenance identifies the saved board version/content, variant, view, scale and image dimensions. Capture uses canonical renderer output and fonts with stable presentation state, contains complete diagram bounds, and is not an author-supplied substitute or unrelated screenshot. Images and optional full-resolution detail tiles remain ignored derived run artifacts and are provided without revealing the evaluation arm.
- [ ] #9 The grader is supplied image-capable access to every required bitmap and explicitly visually inspects each. Verdicts identify inspected capture IDs and image-grounded observations about readability, clipping, overlap, endpoints and sequence legibility; SVG parsing, file existence, board JSON and claimed author inspection cannot substitute. Large diagrams retain native-resolution detail through appropriate image access or supplemental tiles.
- [ ] #10 Missing/failed capture, unreadable image or omitted visual inspection is an explicit incomplete/failed visual evaluation and cannot receive an unqualified successful visual verdict. Failed author runs retain available final/partial-state captures where possible and explain absent diagrams; no placeholder counts as a capture. Static captures do not claim to prove traffic animation.
- [ ] #11 The task records hypotheses separately from demonstrated improvement; corrected inputs and the same CLI are used for future human-run comparisons, with success and semantic/visual quality primary and token usage secondary. Focused model-free behavior/contract tests, skill synchronization and the normal check gate validate implementation without agent-run evals or grading.
<!-- AC:END -->
