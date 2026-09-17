---
id: TASK-254
title: Stop the archboard skill carrying evaluation answers
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 16:08'
updated_date: '2026-09-17 16:27'
labels: []
dependencies: []
references:
  - evals/evals.json
  - TASK-235.02
  - TASK-243
  - TASK-253
priority: high
ordinal: 448000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every recipe in skills/archboard, and the frozen baseline under docs/design/skill-evals/baseline/archboard, used a worked example that answers an evaluation scenario: create-architecture was S00 (Flask request pipeline), edit was S01 (Flask JSON), propose-compare was S02 and S06 (Flask contexts / Context variables), and create-sequence was S07 nearly verbatim (Flask CLI startup, repeat 2, Startup exchange). Later rounds added more scenario-shaped rules (RequestContext.push self.match_request for S05, dispatch to the matched handler). The harness only flags an author who reads evals/, so both arms read the answers inside the skill. Every batch run so far measured recall of Flask answers, and none is evidence that the skill works. The user decided: the examples are about archboard itself, both packages are cleaned so the arms still differ only by the TASK-243/253 changes, and all previous results are void.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Neither skills/archboard nor the frozen baseline names Flask, its symbols, or any evaluation board, view or variant name; every worked example describes archboard source and is true to it
- [x] #2 bun run eval:skill check refuses a skill package, candidate or baseline, that contains an evaluation-specific name, and a fast test owns the refusal
- [x] #3 The evaluation docs and pins record that every batch before this change is void and why
- [x] #4 bun run check passes and the derived skills are synchronized
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace each recipe's worked example with archboard source (edit route to atomic write; install-skill setup with the CLAUDE.md/AGENTS.md loop; replaced-relationships edit; lease-table proposal) in both skill packages. 2. Make shared guidance portable across codebases and paradigms (OOP, functional, UI/async). 3. Add the leak guard to eval:skill check with a fast test. 4. Record the void batches in evals/README.md, pins.json and archboard-dev. 5. Check the payloads through the store; gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: every create payload in both packages written through semantic-board-store in a scratch vault, and the edit payloads parse against VariantEditInputSchema; bun run eval:skill check suite ok (the guard passes both packages); leakage.test.ts; bun run check exit 0 across all lanes; skills synced. The user extended scope to portable wording and paradigm coverage; archboard-dev section 'Portable rules, grounded examples' holds it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the evaluation's answers from both skill packages: the worked examples are archboard's own source, the shared guidance is general across paradigms, and eval:skill check refuses any package that names the evaluated framework or a scenario's boards, views, variants, groups or quoted symbols. Every earlier batch is recorded as void. Verified by store writes of the example payloads, leakage.test.ts, eval:skill check and bun run check.
<!-- SECTION:FINAL_SUMMARY:END -->
