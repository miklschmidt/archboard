---
id: TASK-229
title: Stop scenario prompts naming what the skill should do unprompted
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 12:22'
updated_date: '2026-09-15 12:27'
labels:
  - skill-evals
dependencies:
  - TASK-227
references:
  - evals/evals.json
  - evals/coverage.json
  - TASK-212
priority: high
type: enhancement
ordinal: 389000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Most scenario prompts in evals/evals.json tell the author how to use the product: give each part a configured kind, put the internals in a container, bind each part to its file, keep identities, say traffic is illustrative, select one relationship by id, keep every beat id. A person asking for a board says what they want to understand and the names the board should carry; knowing the product is the skill's job, and a prompt that restates the skill hides whether the skill teaches it. The batch measured a skill that was being told the answers. Every prompt should carry only what a person would say (the question, the level, the names the harness anchors its outcome checks and captures on, an explicit product request such as vocabulary or traffic settings when that is the request) and the expected-feature checklist then states what the skill must have added on its own. Changing the prompts changes the inputs digest, so the next batch is a new baseline; the frozen baseline skill is unaffected.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No prompt in evals/evals.json instructs a product mechanism the skill teaches (kinds, containment, bindings, identity retention, external parts, repeat, note, message kinds, view selection mechanics, beat identity, illustrative-traffic wording); each keeps the board, variant, view and node names its outcome checks and captures rely on
- [x] #2 Each scenario's expectedFeatures still names everything the run must produce, now including what the prompt no longer says, and the harness outcome checks still pass against a board that does what the skill teaches
- [x] #3 The suite loads (bun test src/runtime/skill-evaluation) and evals/coverage.json still names a scenario for every entry it did before
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite every prompt in evals/evals.json to carry only what a person would say: question, level, anchored names, explicit product requests. 2. Keep outcome checks and captures; adjust expectedFeatures requirements only where they quoted prompt wording. 3. Load the suite in tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote the prompts of S00, S01, S02, S03, S04, S05, S07, S08, S10, S11, S12, S13 and S14 to carry only the question, level, anchored names and explicit product requests; S06 and S09 needed no change. A script check confirms no prompt still says configured kind, bind each, stays unbound, identity, illustrates, by id, referencing the push, keeping every, registering it, at least two, Include a note or an external. Outcome checks and captures untouched; expectedFeatures already state the now-unprompted requirements. coverage.json unchanged (99 entries, 23 without scenarios, as before). Suite loads in bun test src/runtime/skill-evaluation. The inputs digest changes, so the next batch is a new baseline.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Scenario prompts no longer instruct product mechanisms the skill teaches; the checklist carries what the skill must add on its own. Verified by a prompt scan, the suite tests and an unchanged coverage inventory.
<!-- SECTION:FINAL_SUMMARY:END -->
