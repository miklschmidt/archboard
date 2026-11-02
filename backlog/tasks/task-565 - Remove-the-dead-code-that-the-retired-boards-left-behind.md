---
id: TASK-565
title: Remove the dead code that the retired boards left behind
status: To Do
assignee: []
created_date: '2026-11-02T20:10:00Z'
labels:
  - cleanup
  - refactor
dependencies:
  - TASK-564
documentation:
  - docs/adr/0068-one-live-canonical-model-and-consumer-path.md
priority: medium
ordinal: 1014000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0068 retired boards, but it removed behavior faster than it removed the code around that behavior. TASK-564 found eight source files that nothing imported, and that search looked only at whole files. Code with no caller costs every reader and agent time, and TASK-564 had to decide how to rename some of it. The repository has lint for boundaries and a ceiling on interface width, but nothing reports an export or a message that nobody uses, and package.json lists no dead-code tool. Leads from TASK-564, which still need proof: the browser handles the socket messages model_note, model_lock, model_doing and pane_error, but a literal search of server source found no sender. `embedsRelationships` in apps/cli/src/cli/operations/vault/vault.ts names `/api/semantic-boards` routes that no server route serves. The legacy reader under the canvas behavior has callers in retained replay and migration preview, so some of it is live, and each part needs its own proof.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every source file under packages/ and apps/ is reachable from a process entry, a browser entry or a package export
- [ ] #2 Every exported name has a caller outside its own file, and a test does not count as the only caller unless the name is a test fixture export
- [ ] #3 No socket message, CLI route relationship, refusal code or configuration key remains that nothing sends, serves or reads
- [ ] #4 Each package whose interface gets narrower has a lower ceiling in tests/system/repository-policy/interface-width-ceilings.json
- [ ] #5 Tests that only covered deleted code are gone, and no test of live behavior was removed
- [ ] #6 LEGACY_AUTHORITY migration, retained originals and talk replay keep working, and the decoding of legacy formats keeps reading exactly as before
- [ ] #7 The ADR of TASK-564 still names each kept use of the word board correctly after the deletions
- [ ] #8 bun run check passes
<!-- AC:END -->
