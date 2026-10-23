---
id: TASK-509
title: Correct historical variants against pinned Git revisions
status: Done
assignee:
  - '@codex'
created_date: '2026-10-23 02:27'
updated_date: '2026-10-23 02:56'
labels: []
dependencies: []
ordinal: 916000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Historical variants can contain diagram mistakes. Authors need a deliberate correction path that describes the code at the historical point rather than current code. The current write boundary refuses all historical content edits, and variants do not record a complete revision per repository.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Ordinary edits still refuse historical content changes.
- [x] #2 An explicit correction identifies immutable Git commits for the repositories it describes and refuses unavailable revisions.
- [x] #3 The correction keeps variant identity, ancestry, lifecycle, and adoption history, with a recorded reason and revision evidence.
- [x] #4 The author can inspect proposed corrections and run the code check against the stated historical revisions before writing.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Proposals: Board persistence@TASK-509, Command interface@TASK-509, Archboard server routes@TASK-509. Add a dedicated correction transition and command, with preview/write routes. 2. Require a reason and explicit immutable commits per referenced repository. Suggest commits from supersession time without treating the guess as proof. 3. Preview the complete in-memory candidate and code findings using Git trees, including when the commit equals dirty HEAD. Write repeats validation and uses the existing lease and expected-version boundary. Preserve all other variants and adoption records. 4. Record correction evidence on the historical variant, update ADR and consumer guidance, and add behavior tests. 5. Run the complete gate, inspect and adopt proposals, and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User approved the explicit correction design. Adoption timestamps can suggest candidate commits, but preview and write use explicit immutable commits after inspection.

Implemented semantic correct with default preview, explicit --apply, and --suggest. Suggestions use supersession time and HEAD ancestry as guesses. The candidate checker forces immutable Git trees for bindings, anchors, and documents, including dirty HEAD. The write refuses code warnings and uses the existing expected-version lease boundary. Correction provenance stays on the historical variant. Descendants and adoption records do not change. Live preview/apply succeeded and ordinary historical edit remained refused. Footprint read against 820e12fdf: Command catalogue and its Commands container only gained registration of the new command through their existing contract edge, so their responsibilities and drawn relationship remain correct. README asset fingerprints report all assets stale, but this change alters no existing pictured UI or example diagram, so no visual asset refresh is needed. TASK-510 repairs the observed GET suggestion lifetime error.

Final bun run check passed: 4883 module tests, 257 system tests, 136 repository tests, and all 19 browser owners. Proposal code checks introduced no findings compared with the baseline. Existing baseline findings remain: 5 ANCHOR_SYMBOL_MISSING, 21 EXPOSED_UNUSED, 15 RELATIONSHIP_UNDRAWN. Refreshed footprints against 820e12fdf leave no changed parts missing from proposals; named-but-unchanged endpoints are contract dependencies. Adopted Board persistence v86, Command interface v120, Archboard server routes v87. Plain archboard check reports no diagnostics after adoption. The simplicity pass retained the normal write boundary and shared edit guardrails, with one authoritative revision map for historical evidence.

Post-adoption code check has no diagnostic delta. Other task-related behind entries stay accurate: Archboard Workspace packages and board/code-intel/server-lifecycle/skills keep their existing package responsibilities; Archboard server Code check gains immutable candidate reading inside the same responsibility; Skill evaluation Evaluation inputs only changes the coverage catalogue. The three adopted boards show zero commits behind. Renderer and Voice coordinator behind entries belong to unrelated earlier commits.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added semantic correct with timestamp-based commit suggestions, preview and explicit application. Historical corrections use immutable Git evidence, preserve identity and adoption history, and record a reason and revision provenance. The complete gate, live CLI smoke and plain vault check pass. Architecture proposals are adopted.
<!-- SECTION:FINAL_SUMMARY:END -->
