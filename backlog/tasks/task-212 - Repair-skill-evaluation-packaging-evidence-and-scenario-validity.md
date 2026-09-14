---
id: TASK-212
title: 'Repair skill evaluation packaging, evidence and scenario validity'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-14 22:26'
labels: []
dependencies: []
references:
  - src/runtime/skill-evaluation
  - skills/archboard/evals
  - .skill-evals/2026-09-14T13-50-10-617Z/report.json
priority: high
type: bug
ordinal: 372000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Planning only after the human-run batch .skill-evals/2026-09-14T13-50-10-617Z. Candidate authors read evals shipped inside their skill; file-change events were omitted from grading evidence; guardrails misclassified redirects; prompts/checklists disagree; resumed grader usage appears double-counted. Preserve the original batch and frozen baseline. Authors and graders stay human-run; home-isolation work is deferred.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Canonical evaluation inputs live in repository-root evals/ and are absent from installed/synchronized consumer skills; loaders, provenance, tests and maintained links use the new location.
- [ ] #2 Recorded file changes and commands expose direct vault writes and evaluation-material reads to guardrails, graders and reports; harmless read-only redirects are not mutations.
- [ ] #3 S00/S02/S08/S09/S10/S12/S14 prompts, fixtures, outcomes and rubric agree on requested observable behavior and source-grounded architecture; inherited fixture defects and unavailable renders are attributed accurately.
- [ ] #4 Pinned Codex usage semantics are verified without model calls; resumed usage is counted once and protected by synthetic regression tests.
- [ ] #5 Original batch artifacts remain untouched; any later corrected report names its source, corrections, contamination and comparability limits.
- [ ] #6 Focused model-free tests and bun run check pass after independent-scope and boundary review; no eval authors or graders run.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Proposed plan for user review before implementation:
1. Move skills/archboard/evals/ to evals/. Update loader, provenance/fixture tests, install expectations, development guidance and documentation. Test that distribution and synchronization exclude evaluation material. Leave .skill-evals/ output ignored and the frozen baseline unchanged.
2. Preserve Codex file-change events in author evidence and audit direct board mutations. Fix read-only redirection false positives. Record observed eval-material exposure and distinguish audit failure from final board correctness. Cover sanitized recorded event shapes with fast tests.
3. Repair S02 subject counts; give S08 an honest recovery contract or deterministic refusal owner; remove hidden S09 wording requirements; correct S00 call/sequence ambiguity and bindings, S10 fixture inaccuracies/scoring attribution, S12 selection intent and S14 external expectations. Apply identical contracts to both arms.
4. Verify pinned resumed usage semantics and normalize accounting; retain separate author/grader usage and explicit visual-evidence availability.
5. Preserve existing evidence and document invalidated conclusions. Coordinate the separate S11 restoration product fix and TASK-211 guidance before a human reruns affected scenarios, then the full comparison.
6. Review independent scopes and packaging/provenance, evidence/guardrails/grading and scenario/product interfaces. Run focused ordinary tests and bun run check. No model calls; home isolation remains deferred.
<!-- SECTION:PLAN:END -->
