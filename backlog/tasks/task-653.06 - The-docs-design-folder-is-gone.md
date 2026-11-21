---
id: TASK-653.06
title: The docs/design folder is gone
status: Done
assignee:
  - '@implementer'
created_date: '2026-11-19T16:50:00Z'
updated_date: '2026-11-19T17:18:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-653
ordinal: 1119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner asked to delete docs/design (owner decisions 19 and 20 in the archboard-deepen run's decision log: agent-written context is not a rule). It holds seven investigation write-ups, which go, and two things code still reads, which move: the wide-board layout fixtures (JSON imported by renderer tests, plus measure.ts and timing.ts, which the archboard-renderer skill runs and the architecture vault binds as modules MCVEWRGl and S6MFhkV7), and the archboard skill-eval baseline that evals/pins.json pins. TASK-653.05 deletes five docs/agents guides beside this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/design is deleted; its seven investigation markdown files are gone, not relocated
- [x] #2 The wide-board fixtures, measure.ts and timing.ts live beside the renderer tests that read them, every import and the archboard-renderer skill use the new path, and the vault binds MCVEWRGl and S6MFhkV7 to it through the archboard CLI
- [x] #3 The skill-eval baseline lives under evals/ and evals/pins.json points at it, without starting any skill evaluation
- [x] #4 No tracked file outside backlog/ names docs/design/ except example text about a consumer's own docs (README.md:280, site/src/components/demos/DocsTiles.astro), and AGENTS.md, TESTING.md, docs/agents/domain.md, scripts/move-source.ts, scripts/painter-bench.ts and .gitignore no longer point there
- [x] #5 No lint, type or test rule is weakened, and bun run check passes apart from check:model's known INTERFACE_WIDE and MODULE_SHALLOW findings that TASK-653 clears
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Delete the seven investigation markdown files under docs/design.
2. Move the wide-board fixtures, measure.ts and timing.ts to packages/renderer/tests/runtime/support/wide-boards/, fix imports, comments and the archboard-renderer skill command; rebind vault modules MCVEWRGl and S6MFhkV7 through archboard model edit.
3. Move the skill-eval baseline to evals/baseline/archboard, update evals/pins.json, and keep the exposure classifier calling a read of it skill-package exposure now that it sits under evals/.
4. Point the CLI contract generator's default output at the ignored artifacts/ folder so .gitignore no longer names docs/design; remove the pointers in AGENTS.md, TESTING.md, docs/agents/domain.md, scripts/move-source.ts and scripts/painter-bench.ts.
5. Run bun run check and the remaining lanes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixtures, measure.ts and timing.ts now live in packages/renderer/tests/runtime/support/wide-boards/; the scripts find their fixtures with import.meta.dir and import the support helpers beside them. model edit rebound S6MFhkV7 and MCVEWRGl (bindings and their four relationship anchors); the CLI rebased the 15 drafts on the new current revision. Under heavy machine load the history Git calls timed out at their 5 s bound several times before the edit applied.
The baseline now sits under evals/, which the exposure classifier treats as evaluation inputs, so a read of the baseline is matched as skill-package exposure before the evaluation-inputs test (the existing evidence test covers it). No skill evaluation was started.
generate:cli-contract writes to the ignored artifacts/cli-contract by default, so .gitignore no longer names docs/design; tests/system/cli/command-contract-artifacts.test.ts checks that path.
docs/agents/test-suite.md:578 still names docs/design/generated; TASK-653.05 deletes that file.
Checks: bun run check passes every stage before check:model; check:model stops only on the known INTERFACE_WIDE and MODULE_SHALLOW warnings. Lanes run after it: test:modules 5324 pass, test:system 227 pass, test:solo 15 pass, test:serial-browser pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Deleted docs/design. The seven investigation write-ups are gone. The wide-board layout fixtures and their measure.ts and timing.ts scripts moved beside the renderer tests that import them (packages/renderer/tests/runtime/support/wide-boards), with imports, comments, the archboard-renderer skill command and the vault bindings of modules S6MFhkV7 and MCVEWRGl updated through archboard model edit. The frozen skill-eval baseline moved to evals/baseline/archboard and evals/pins.json points there; the exposure classifier still reports reading it as skill-package exposure. The CLI contract generator now writes to the ignored artifacts/ folder, so .gitignore, AGENTS.md, TESTING.md, docs/agents/domain.md and the two scripts no longer point at docs/design. Verified with bun run check (only check:model's known findings) and all four test lanes run separately. Follow-up: docs/agents/test-suite.md still mentions docs/design/generated until TASK-653.05 deletes it.
<!-- SECTION:FINAL_SUMMARY:END -->
