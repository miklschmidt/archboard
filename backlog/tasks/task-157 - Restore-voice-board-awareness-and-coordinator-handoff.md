---
id: TASK-157
title: Restore voice board awareness and coordinator handoff
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-07 00:20'
updated_date: '2026-09-07 00:51'
labels: []
dependencies: []
type: bug
ordinal: 309000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Danish voice conversation about platform migration and the legacy portal answered generically, asked the person to share existing boards, and claimed the coordinator connection was read-only. Voice users need grounded answers from existing boards through the linked coordinator.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Voice board questions reach a capable coordinator and return evidence from existing boards.
- [x] #2 A focused regression or replay covers the observed failure, and applicable checks pass.
- [x] #3 Both voice and coordinator receive the available board and variant catalogue at voice session start and quiet item updates after creation or deletion, including unopened vault boards.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Capture the failing session or construct a reproducible handoff probe. 2. Isolate the context or delegation failure and repair the owning boundary. 3. Verify the regression and complete gate; document real-audio verification limits.

User confirmed stronger role prompts: make board work the coordinator primary objective, require reading archboard SKILL.md before requests, and give realtime its own voice prompt through the actual prompt field. Supply the same current board brief to coordinator mode context.

Add a vault-backed catalogue source, capture it at voice start for both models, and publish deduplicated developer-item updates while that exact voice session is active. Verify create/delete, variants, unchanged content, and cleanup.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced the supplied transcript in the private coordinator rollout: voice delegation reached the coordinator, but delegate_to_workhorse and inspect_workhorse were refused as direct_input_unknown. Root cause: thread/list omits root direct-input capability after the first turn; direct thread/read reports it. Extended the existing proved-root read path without weakening false/null, epoch, source, metadata, or loaded-membership refusals. A second defect was prompt:null explicitly suppressing realtime default instructions while realtimeStartInstructions reaches the coordinator. Added distinct board-first voice/coordinator prompts, required first-step archboard skill reading, current board context to both, and a bounded vault catalogue with quiet replacement items for both models. Catalogue watch follows nested/unopened board and variant changes and is released at stop/disposal. Focused regressions pass; complete gate rerunning against frozen source after an earlier run overlapped a prompt edit.

User refinement applied: voice always communicates with the coordinator in English, preserving board/system names, and always replies to the user in the language they speak. Realtime adapter checks pass after this prompt-only adjustment.

The complete bun run check passed for the voice implementation, including the controlled production browser voice workflow. Catalogue lifecycle tests exercise startup delivery to both models, create/variant/delete replacements, deduplication, stopped-session cleanup, and partial injection failure. The proved-root regression reproduces the history direct_input_unknown refusal and verifies live capability recovery. Real microphone/speaker confirmation of a Danish board question remains pending a server restart and fresh voice session; AC1 intentionally remains open. Rerunning the complete gate after TASK-158 test cleanup before committing and pushing the branch as requested.

Final bun run check also passes after TASK-158 cleanup, including all 305 system tests and the controlled production browser voice scenario. User requested commit and push to the current origin branch. The running user server was not restarted; fresh-session real audio confirmation remains the only unverified acceptance item.
<!-- SECTION:NOTES:END -->
