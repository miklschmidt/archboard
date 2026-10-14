---
id: TASK-472.07
title: >-
  Tests and skill evaluations make their vaults in the vault layout and address
  them with -C
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
updated_date: '2026-10-14 22:24'
labels: []
dependencies:
  - TASK-472.06
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 827000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
System tests, fixtures and the skill evaluation harness point `ARCHBOARD_VAULT` at bare directories, which ADR 0049 removes. They move to `<dir>/.archboard/vault` and `-C`, keeping their own ports and state directories. The evaluation world keeps its vault inside its flask checkout, which changes the world that the evaluations measure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No test, fixture, test support module or evaluation harness sets or reads `ARCHBOARD_VAULT`
- [ ] #2 Every isolated server in tests and evaluations still has its own port, HOME, state directory and registry
- [ ] #3 The evaluation world's vault is `.archboard/vault` inside its flask checkout, and evals/README.md records that batches after this change are not directly comparable with earlier ones
- [ ] #4 `bun run check` passes
- [ ] #5 TESTING.md, docs/agents/test-suite.md, evals/README.md and the archboard-dev skill describe isolated servers as built
- [ ] #6 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Handed over from the review of TASK-472.01 (2026-10-15): about 25 board-store tests, 3 engine lock tests and the code-check unit tests still set and restore process.env.ARCHBOARD_VAULT and load the store late for that reason, though nothing on their path reads it since the refactor. Delete the setup and restore, use static imports, and drop the now false comment that config.ts snapshots the environment in one-write.test.ts, aggregate-writes.test.ts and discard.test.ts.
<!-- SECTION:NOTES:END -->
