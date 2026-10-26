---
id: TASK-529.06
title: The code binding, intelligence and opener interfaces are a few operations
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T05:44:00Z'
labels: []
dependencies: []
parent_task_id: TASK-529
type: task
ordinal: 947000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of TASK-529 for the code-binding, code-intel and code-opener package(s). TASK-500 kept every name callers imported, so callers assemble internals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The callers use only the package's narrowed public entries, and the package's focused tests, type-check and lint pass
- [x] #2 Each public entry exposes operations a caller needs, measured by the names and facts it must learn
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Deepened code-binding, code-intel and code-opener from 99 exported names (45 + 41 + 13) to 47 (18 + 16 + 13), each within its interface-width ceiling.
- code-intel: createCodeCheck().run is the whole code check that the server route used to assemble (boards, plans, pass, behind, answer, refusal words). symbolLine moved from code-opener into code-intel/code-facts. The pass steps, behind and the code facts reader are private; package tests reach them through tests/runtime/support/code-check/pass.ts and tests/runtime/support/history-lens/lens.ts. The shared entries name only the answers; callers derive parts by indexed access.
- code-opener: owns the open's wire contract (shared/schemas) and the GitHub link (server/projections/github-link.ts), moved from code-binding; ./opening exposes the notice, the GitHub URL schema and the reply schemas the system tests parse. activateCodeTarget takes one onNotice; OpenerSettings (the dialog over its flow) moved from apps/web into the package; openInEditor plans and launches in one call.
- code-binding: loses ./opening (26 names) and githubUrlForBinding; the resolver names its own failure codes. Dead presentationTargetForBinding and buildInternalCodeTargetUrl deleted.
Behavior unchanged: code-intel tests, the server code-check, footprint and locality route tests, the CLI check and history tests, and tests/system/code-targets pass. The code-target system tests failed once under machine load (422 and timeouts) and passed 23/23 when rerun.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The code check is createCodeCheck().run(request); symbolLine moved into code-intel; the open contract moved into code-opener ./opening with openInEditor. code-binding 45 -> 18, code-intel 41 -> 16, code-opener 13. Verified by type-check, lint, the code-intel, code-binding, code-opener and server tests and the code-targets system tests.
<!-- SECTION:FINAL_SUMMARY:END -->
