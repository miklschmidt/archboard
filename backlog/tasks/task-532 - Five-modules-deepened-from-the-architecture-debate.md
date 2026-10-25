---
id: TASK-532
title: Five modules deepened from the architecture debate
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T02:39:00Z'
updated_date: '2026-10-25T05:38:00Z'
labels: []
dependencies: []
references:
  - docs/adr/0055-packages-own-behavior-and-apps-compose-it.md
  - docs/adr/0057-an-interface-is-the-few-operations-its-callers-need.md
priority: high
ordinal: 951000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two independent reviewers (Codex gpt-6-astra at xhigh and Claude Opus 5.5) each read the repository at 175c820c9, then cross-examined each other's candidates in a second round. The five below are the deepening opportunities both agreed on, plus the fifth chosen by the orchestrator. The briefs and both rounds are in /tmp/deep (round1 and round2 files). TASK-529 narrowed export lists; these tasks move behaviour behind deeper operations so callers stop assembling internals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each subtask is merged into feat/reusable-codex-workbench with its focused tests passing
- [ ] #2 The interface width ceilings do not rise
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Vault closing (branch vault/close-529-530-532, from f667552b2):

- Proposals named TASK-532:
  - Command interface (8603df7ff), base 11340202f: a new Stated change part (readVariantChange) is read once for semantic edit and semantic resolve. Board client is rebound, and Claim client and Pane client are new. Locality and Footprint read refusal codes from code-intel and are otherwise unchanged.
  - Board viewer (bf1285a97), base 11340202f: Follow drill-downs binds use-drill-target.ts, and use-drill-place.ts is gone. Board refresh and Board cache keys are new, and every refresh caller reports to the one module. Both flows are restated with their step ids kept.
  - Browser application (48427f8e3), base 6032096a9: it holds the TASK-529 and TASK-530 changes of that board.
  - Board persistence (af7e39f2d), base 6032096a9: new Check a candidate (candidate.ts), Prepare a write (prepare.ts), Carry a rename (carry.ts) and Read a variant (variant.ts). A new flow, "A correction is prepared, then committed".
  - Archboard server routes (073e69fd5), base 6032096a9: a new flow, "An agent corrects a historical board" (prepare, read evidence, commit). The History lens takes board and variant names for locality and footprint.
  - Live panes (7183ac0de), base 6032096a9: the pane registry and the show route open a board through readBoardVariant. The tab adapter is anchored on installWorkbenchTabSessions.
  - Archboard server (200285424), base 6032096a9: the write refusals are anchored in candidate.ts. Rename calls renameSemanticBoard, and the store carries the doing line and the claim. Take-back calls takeBackBoard. The code check pass is restated around createCodeCheck.
- Footprint parts left undrawn: on Archboard server, Application lifetime (bf475e4da, 1799df5b9) and Semantic context input (type derivation and renames). On Live panes, 16 parts that changed only by renames and type derivation (11340202f, 2b3efc8a6, bf475e4da, 8a5b268d5, b2d2b6cfb, f13270a0a, 913ab9180, 86a49dabc, 1c8980a9c, 97581e85a). namedNotChanged was empty on every board.
- Explained, not drawn:
  - Board persistence: the two propagateEdit anchor findings were in the base run, and no task touched them.
  - Archboard server routes: four RELATIONSHIP_UNDRAWN findings (Checkout registry, Repository listing, Semantic board store, Semantic renderer) were in the base run. They stay undrawn to keep the overview at 25 lines.
  - Live panes: Board announcements, Panes report, Repository routes and Pane socket reach the board store only through parseBoardKey, normalizeBoardKey or boardLockState, which are address rules. Archboard server: Browser reaches the Semantic renderer. Both were in the base run.
- Code finding (no source changed): the pane socket and several announcement routes reach the board store only for address parsing. A narrower address export can remove that reach. EXPOSED_UNUSED on Pane session (apps/web/src/ui/clients/pane-session) was in the base run.
<!-- SECTION:NOTES:END -->
