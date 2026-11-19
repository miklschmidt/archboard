---
id: TASK-653.06
title: The docs/design folder is gone
status: To Do
assignee: []
created_date: '2026-11-19T16:50:00Z'
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
- [ ] #1 docs/design is deleted; its seven investigation markdown files are gone, not relocated
- [ ] #2 The wide-board fixtures, measure.ts and timing.ts live beside the renderer tests that read them, every import and the archboard-renderer skill use the new path, and the vault binds MCVEWRGl and S6MFhkV7 to it through the archboard CLI
- [ ] #3 The skill-eval baseline lives under evals/ and evals/pins.json points at it, without starting any skill evaluation
- [ ] #4 No tracked file outside backlog/ names docs/design/ except example text about a consumer's own docs (README.md:280, site/src/components/demos/DocsTiles.astro), and AGENTS.md, TESTING.md, docs/agents/domain.md, scripts/move-source.ts, scripts/painter-bench.ts and .gitignore no longer point there
- [ ] #5 No lint, type or test rule is weakened, and bun run check passes apart from check:model's known INTERFACE_WIDE and MODULE_SHALLOW findings that TASK-653 clears
<!-- AC:END -->
