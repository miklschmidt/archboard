---
id: TASK-371
title: The voice coordinator runs on gpt-6-sol at low reasoning
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 02:25'
updated_date: '2026-09-29 02:44'
labels:
  - codex
  - voice
dependencies: []
priority: high
type: chore
ordinal: 657000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The voice coordinator runs on gpt-6-luna at high reasoning (60f2eacd). The coordinator only relays between the voice model and the workhorse: it reads boards, answers short questions and delegates sustained work, so high reasoning adds latency to every spoken answer without a measured gain. The user decided on 2026-09-29 that the coordinator runs on gpt-6-sol at low reasoning. Codex 0.158.0 lists gpt-6-sol with low among its supported reasoning levels (models_cache.json in the Archboard Codex home). The workhorse model is not part of this change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every coordinator thread starts on gpt-6-sol with low reasoning effort
- [x] #2 Startup and the coordinator readiness check require gpt-6-sol with low effort in model/list, and the refusal names that model
- [x] #3 Tests, fixtures, the archboard-dev Codex bump procedure and every document that names the coordinator model state gpt-6-sol at low
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Voice coordinator@TASK-371 restates the Coordinator thread part's description with gpt-6-sol at low effort; no part or relationship moves.
1. src/runtime/codex-coordinator-tool-contract/lib/contracts.ts: COORDINATOR_IDENTITY holds gpt-6-sol and low, and is the one place they are written; CoordinatorIdentitySchema takes its literals from it.
2. src/runtime/codex-coordinator/lib/model.ts and lib/contract.ts derive the model and effort from COORDINATOR_IDENTITY, so model/list selection, the unsupported-effort refusal and the configured settings follow it.
3. Fakes: the production fake Codex lists gpt-6-sol (efforts low and medium, default medium) beside the workhorse model, and a started thread reports its model's default effort, so the settings update to low is what the system test proves.
4. Docs: the archboard-dev Codex bump step (gpt-6-sol must be listed with low) and docs/design/codex-workbench-authored-contracts.md (the coordinator profile and its settings update).
5. Verify: codex and voice module tests, the system lane, the gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The fork of this session (killed by the user) wrote the fake Codex, system test and doc edits in parallel; they matched this change and are kept. Browser test fixtures that name gpt-6-luna with medium effort are arbitrary projection data, not the coordinator identity, and are unchanged. Validation: bun run check lanes all pass (lint, fmt:check, type-check, 3711 module tests, 182 system tests including codex-workbench-production, repository, serial browser); dogfood check reports no diagnostics.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The coordinator runs on gpt-6-sol at low reasoning. COORDINATOR_IDENTITY in the coordinator tool contract is the one place the model and effort are written; model selection, the unsupported-effort refusal and the configured settings derive from it. The production fake Codex lists gpt-6-sol, the production system test proves the settings update to low, and the archboard-dev Codex bump step and the authored-contracts doc name gpt-6-sol at low. Voice coordinator board adopted at version 10. Verified with the full gate lanes and dogfood check.
<!-- SECTION:FINAL_SUMMARY:END -->
