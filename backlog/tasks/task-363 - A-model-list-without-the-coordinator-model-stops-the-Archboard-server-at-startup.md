---
id: TASK-363
title: >-
  A model list without the coordinator model stops the Archboard server at
  startup
status: To Do
assignee: []
created_date: '2026-09-28 18:26'
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
- [ ] #1 A model list without the coordinator model leaves the server running, with the coordinator's failure visible to a pane
- [ ] #2 A refresh or sign-in after the model becomes available starts the coordinator
- [ ] #3 A fake Codex whose model/list lacks the coordinator model proves both
<!-- AC:END -->
