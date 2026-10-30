---
id: TASK-549.08
title: Adopt or shelve a proposal without growing current history files
status: Done
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-27T03:31:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.07
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 938000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 8.

## What to build

Adopted and shelved history must remain readable without growing every current architecture file.

An agent explicitly adopts a settled proposal or shelves it with a reason. Readers can reopen and compare the retained result afterward.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.07
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An agent explicitly adopts a settled proposal or shelves it with a reason. Readers can reopen and compare the retained result afterward.
- [x] #2 Refuse superseded adoption by default. Forced adoption requires comparison and installs the complete resolved proposal. Code commits, merges, and approval never adopt it.
- [x] #3 Preserve ancestry, prior state, documents, reasons, and lifecycle timestamps. Remove active proposal files only within the durable operation.
- [x] #4 Repeated requests create one lifecycle event. The same later edit produces the same current-file delta after zero or many completed proposals.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [x] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm the supplied clean checkout at signed integration e28c69457986363ac26aad68131260ae988ce723. Keep frontend, browser tests, review, publication, adoption, and closure with the parent.
2. Create accurate TASK-549.08 draft proposals on Board persistence, Command interface, and Archboard server routes. Publish the exact shared contract in the durable task directory.
3. Use red-green tests through the approved public architecture operations with real files and Git. Extend the existing candidate, archive record, reader, claim closure, signed journal, recovery, retry, and event paths for adoption and shelving.
4. Cover superseded and forced adoption, unsettled refusal, preserved completed readings and dependent proposals, interrupted removal and installation, exact retries, signing, and bounded current-file churn. Keep adapters thin.
5. Update consumer guidance, ADR0061, domain terms, test ownership, and evaluation inputs. Pause and simplify duplicate ownership. Run affected evidence, merge latest integration, sign commits, release claims, stop only this worktree server, and save backend handoff. Keep all criteria unchecked and task proposals draft.

6. Parent completes read-only browser lifecycle acceptance through the existing architecture query, state/comparison selectors, and state details. Expose retained completed states and their reasons, timestamps, and ancestry. Use a real Git/browser fixture with explicit agent adoption and shelving, exact checkpoints, comparison, refresh, and missing-history recovery. Keep adoption and shelving out of browser write controls.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend implementation assignment accepted in supplied isolated checkout /home/msc/Projects/t3code/.t3/worktrees/archboard/t3-ce48997f, branch t3/ce48997f. HEAD and feat/canonical-module-model both equal signed e28c69457986363ac26aad68131260ae988ce723. TASK-549.07 is Done. No initial merge is needed. Parent owns frontend and browser acceptance. No child agents, reviews, push, PR, task closure, or proposal adoption are authorized.

Created draft architecture proposals before source changes: Board persistence@TASK-549.08 (VtLhJvof, version182), Command interface@TASK-549.08 (xfpVZpm5, version201), and Archboard server routes@TASK-549.08 (y5OB41xO, version167). The early exact contract is /home/msc/.local/state/archboard-implementation/task-549/task-549.08-contract.md. The first public real-file/Git adoption test failed on absent protocol, then passed with complete installation, both exact readings and one retained lifecycle event after retry. All acceptance criteria remain unchecked.

Signed checkpoint64e528a2a records the backend lifecycle implementation and three draft architecture proposals. The host renamed this same supplied checkout branch to feat/proposal-lifecycle-backend. Public red-green evidence covers absent lifecycle protocol, incorrect shelved materialization, superseded adoption, renamed current-file installation, retaining adopted current metadata, and reused completed subject identity. CLI/HTTP parity passes3 cases/34 assertions. Signed lifecycle publication and reopening through a local remote passes2 cases/24 assertions. Current-file churn compares zero and two completed proposals within the original30-second deadline. Archive-derived identity reservations feed the existing mint. Completed history enters neither current files nor active proposal files. Broad affected runtime evidence is running. No frontend, browser, review, push, PR, adoption, or closure work occurs.

The initial broad diagnostic omitted the normal --isolate flag and failed on Bun default deadlines. It is retained as task-549.08-runtime-unisolated-diagnostic.log and is not acceptance evidence. The corrected serial isolated run is underway with unchanged repository deadlines. Shared reads now derive states only for the default current catalogue request. Selected and exact reads avoid unrelated archive scans. Non-allocating edits avoid historical identity discovery. The public blocked-descendant shelving case first failed, then passed without requiring ancestor settlement. The inherited interface-width gate remains exactly245/188 and belongs to TASK-549.24. No ceiling changes or new public names occur.

Backend simplification preserves all existing admission and install guards. Claims read live state metadata without resolving a draft. Writers materialize only after token and standing admission. Exact archive inputs use one length-delimited Git blob batch through the existing process owner. The public Git-sensitive filename, signing, local publication, recovery, family, and CLI/HTTP owners pass in focused runs with unchanged deadlines. Types and lint pass. Frozen broad runtime evidence and later corrected owners cover all 117 cases across runs. The single broad run was 114 pass/3 deadline failures, so it is not claimed as a full gate pass. Final backend handoff will give each log and the remaining parent browser work. Latest integration now includes completed TASK-549.13 and will be merged before handoff. Criteria and architecture proposals remain unchecked and draft.

Resumed after the owner merged PR23 and the merger preserved the isolated source at signed 53f6715442e4fd590f3b823b7a3bf21fe98832c3. Confirmed origin/main a98f28811f4fa74233ae4a55e52b90d75defd93b ancestry before starting the worktree server. Merged only current feat/canonical-module-model e7dccaac9bb2a1401441747a4498e5f47a902ccc in signed 78e32db87301db83ad32a9fafa024fc2f4cacbbf. The code frontier is ebb36ed324cc9b5404641bed3bc72f0262b1e50c. Both Git stdin and PR23 disconnected process-group termination remain present. The parent rebase audit preserves every non-upstream source file. The parent process regression result is 34 pass, 138 assertions, with no orphan owners afterward. The owner killed the earlier orphan processes. This run takes no cleanup credit. The interrupted adapter command completed before the hold: 3 pass, 36 assertions, 20.98 seconds. The unchanged reconciliation owner passed both cases, including the original 15-second deadline case in 10.33 seconds. No passing owner or broad suite was repeated on resume. No code edits were needed. Three release calls found no remaining claim from this session. The worktree server was stopped after cleanup. The durable task-549.08-backend.md records the exact contract, evidence limits, draft versions, and remaining parent browser acceptance. Task status, all criteria, and all three task proposals stay unchanged: In Progress, unchecked, and draft.

Parent completed read-only lifecycle UI and the browser acceptance. Reading and comparison selectors use the public states catalogue. Decision history shows reasons, dates, named ancestry, exact baselines, and authored documents. The existing router opens each destination. Missing retained history preserves explicit intent and recovers after restoration. Shared date and reference presenters avoid component dependencies and duplicate formatting.
The new browser RED reached the missing completed-state choice. The final lifecycle, proposal, reconciliation, and comparison owners pass four cases and 33 assertions. Types, full lint, formatting, and evaluation input validation pass. Parent inspected adopted and shelved readings after the diagram fitted below the disclosure. Temporary screenshot calls are removed.
The three backend proposals were restated on current .13 architecture as TASK-549.08-integration. Their node and edge records match by stable identity, including every authored order. Flows and narrative arrays match exactly. Every original variant content and parent remains unchanged. Original drafts are shelved with reasons. Browser application@TASK-549.08 is adopted with the three integration proposals. Current semantics has zero diagnostics. The four affected current boards have no code warnings. Nine known warnings remain on Archboard and Archboard server. The inherited board width remains 245/188 under TASK-549.24.
Backend evidence and its historical limits remain in task-549.08-backend.md. Browser evidence is task-549.08-browser-regression.log. Current code evidence is task-549.08-adopted-code.json. No full gate, code review, push, or PR readiness change is claimed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Agents can adopt or shelve a proposal with an explicit reason through the shared public writer. Completed states remain readable and comparable through retained history. Current files keep one designation and its lineage. Repeated decisions reuse the same durable operation.
The browser now lists completed states and exposes their decisions, dates, lineage, baseline, and documents. Exact checkpoints keep their original lifecycle. Missing history remains explicit and recovers after restoration.
Public real-file and Git owners cover adoption safety, forced comparison, recovery, signing, identity retention, and bounded current-file churn. Four browser owners pass 33 assertions. Types, lint, formatting, and consumer input validation pass. Four accurate architecture proposals are adopted.
Nine unrelated architecture warnings and the existing board interface width remain outside this ticket. TASK-549.24 owns the interface cleanup. Final integration review remains with the parent spec.
<!-- SECTION:FINAL_SUMMARY:END -->
