---
id: TASK-363
title: >-
  A model list without the coordinator model stops the Archboard server at
  startup
status: Done
assignee: []
created_date: '2026-09-28 18:26'
updated_date: '2026-10-11 14:24'
labels:
  - codex
dependencies: []
priority: high
type: bug
ordinal: 604000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found live on 2026-09-28: with a revoked sign-in (401 token_revoked), Codex 0.155.1's model/list fell back to its bundled model list, which lacked gpt-6-luna. The coordinator's model selection (src/runtime/codex-coordinator/lib/model.ts) refused ('The coordinator requires gpt-6-luna, but model/list did not advertise it'), initializeSession in src/server/archboard/lib/codex-workbench-hooks.ts throws when the coordinator is not ready, and the throw reaches abandonStartup, so the server exits with 'The production Codex workbench did not become ready'. Codex 0.158.0 bundles gpt-6-luna, which hides the trigger but not the cause: any model list without the coordinator model (a catalog change, an account without it) still stops the whole server, while the same coordinator failure after a sign-in (the account owner's ensureCoordinator in codex-workbench-account.ts) is tolerated and published as the coordinator's own failure state. Making startup tolerate it touches when the session and the child are marked account-ready, so it was left out of TASK-360.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A model list without the coordinator model leaves the server running, with the coordinator's failure visible to a pane
- [x] #2 The next message or Talk after the coordinator model becomes available starts the coordinator, because each attempt reads model/list again
- [x] #3 The unit and adapter owners prove it: model.test.ts (a model list without the coordinator model is refused), codex-workbench-adapters.test.ts (a create whose coordinator cannot start is refused with its reason), codex-workbench-production-initialization.test.ts (a signed-in session is ready without a coordinator) and codex-workbench-realtime-actions.test.ts (a failed start is refused and the next start tries again)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11 audit and user decision: 2f871cf52 (TASK-373 S4) removed ensureCoordinator from startup, so a model list without the coordinator model no longer reaches abandonStartup. The coordinator starts with the first message or Talk (coordinatorForConversation), and each attempt reads model/list again. The user accepted the existing unit and adapter owners in place of a fake-Codex system owner, so AC2 now names the next message or Talk as the retry point and AC3 names those owners instead of a fake Codex. Verified: model.test.ts, codex-workbench-adapters.test.ts, codex-workbench-production-initialization.test.ts and codex-workbench-realtime-actions.test.ts pass (27 tests). Not covered: a system test with a fake Codex whose model/list lacks the model.

2026-10-11 follow-up (review finding): AC2's retry is owned by the coordinator lifecycle test 'refuses while model/list lacks the coordinator model, then starts once it is listed' in src/runtime/codex-coordinator/tests/lifecycle.test.ts. It drives one coordinator through a model/list without the model (ensure rejects with code model_unavailable, snapshot state failed, no thread/start) and then a model/list with it (ensure ready, model/list read twice). It fails if selectModel were cached. The four owners named in AC3 do not drive that sequence.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed by 2f871cf52 (TASK-373): startup no longer touches the coordinator, so a model list without the coordinator model leaves the server running, the failure reaches the pane as a refused create with the coordinator's reason, and the next message or Talk reads model/list again and starts the coordinator once the model is listed. Verified 2026-10-11 by four existing unit and adapter test files (27 tests pass). By the user's decision, those owners replace the fake-Codex system owner the original AC3 asked for.
<!-- SECTION:FINAL_SUMMARY:END -->
