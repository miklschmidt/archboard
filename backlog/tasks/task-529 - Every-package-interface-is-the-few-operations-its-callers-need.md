---
id: TASK-529
title: Every package interface is the few operations its callers need
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T05:47:00Z'
labels: []
dependencies: []
priority: high
type: enhancement
ordinal: 937000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-500 moved code into packages but kept every name the old shallow callers imported. Its rule exported whatever outside code imported today, and its criteria counted subpaths, not names. Five packages now export more than 120 names, and callers assemble package internals themselves. ADR 0055 asks for a few operations per job. The codebase-design skill measures an interface by everything a caller must learn.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each package exposes only operations that callers need, and callers no longer assemble its internals
- [x] #2 A recorded rule and a repository check keep an interface from regrowing by caller demand alone
- [x] #3 The renderer is out of scope because it is being rewritten
- [ ] #4 bun run check passes, except the waived renderer timing owners
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Vault closing (branch vault/close-529-530-532, from f667552b2):

- Proposals that hold TASK-529 changes:
  - TASK-529 on Skill evaluation (bf1b98e49) and on Command dispatch (99dc8bf63). Footprint base 11340202f.
  - TASK-532 on Command interface, Board viewer, Board persistence, Archboard server routes, Live panes and Archboard server. TASK-530 on Archboard.
- Skill evaluation: the evaluation command line moved into the skills package (runEvaluationCommand). Eval CLI binds its command.ts, and scripts/evaluate-skill.ts is a new Eval script part that only hands over the arguments and the checkout.
- Command dispatch: a new Vault address part (findAndRegisterVault) replaces the two calls the CLI made to the vault finder and the registry.
- Command interface: the board, claim and pane clients are drawn in the CLI. Server client keeps health, sync status and refusal formatting.
- Board viewer: Pane chrome moved from ui-kit into apps/web, and the shell provides it.
- Browser application: server requests narrowed to requestJson and strictReply. The opener settings dialog moved into the code opener. The walkthrough package publishes the recording and replay pages.
- Archboard server: the code check route makes one call to createCodeCheck().run. The code opener reads variants through readBoardVariant and finds a line through symbolLine. Rename and take-back are board operations (renameSemanticBoard, takeBackBoard).
- Archboard: the narrowed interfaces moved anchors, and each is re-anchored: paneBoardAddress, resolveCodexExecutable, git, symbolLine, strictReply, readBoardVariant, errnoCode, CODEX_PROCESS_MS, keepTalk, recordingPageUrl and resolvePane.
- Footprint parts left undrawn: they changed only by the timing sweep (bf475e4da), type derivation (8a5b268d5, 93d679053), the Git-runner sweep (1c8980a9c) or moved imports (2b3efc8a6). On Archboard, Recorded talks (keepTalk and place, 245bdcb38 and db387d815) and the narrowed server-requests, workspace, code-binding, code-intel and code-opener keep responsibilities that are still true. namedNotChanged was empty on every board.
- Explained, not drawn: on Archboard, these RELATIONSHIP_UNDRAWN findings were in the base run, and no task changed them:
  - Skill evaluation to walkthrough, process, board and renderer.
  - code-intel to timing and workspace.
  - Recorded talks to workspace.
- Code findings (no source changed): these modules expose names that no file outside them uses. All were in the base run.
  - Command routing (apps/cli/src/cli/protocol/routing) and Command contract (apps/cli/src/cli/protocol/contract).
  - The apps/web modules Voice session, Pane session, Application composition, Workspace routing, Board catalog, Walkthrough replay and Walkthrough recording.

AC #2 evidence: TASK-529.08 (ADR 0057 and interface-width.test.ts with its ceilings). AC #3 evidence: git diff main HEAD -- packages/renderer is empty. AC #1 stays open with TASK-529.01 #2 (the board's transition builders are public and need deeper operations; 61 names are pinned by the renderer) and TASK-529.05 #2 (target 45 not reached; 21 names held by codex-app-server, the workbench and the renderer). AC #4 stays open: besides the waived renderer timing owners, wide-boards.test.ts fails 'Codex workhorse (blocks)' on labels off their own route, a layout failure, not a timing one, and the renderer is out of scope.
<!-- SECTION:NOTES:END -->
