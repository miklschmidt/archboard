---
id: TASK-549.09
title: Correct historical architecture with an audit trail
status: Done
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-27T05:55:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.08
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 939000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 9.

## What to build

Historical factual errors need explicit corrections that preserve the original record.

An agent explicitly corrects a historical or shelved state with a reason and source references. Readers see the correction through its lasting state identity.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.08
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An agent explicitly corrects a historical or shelved state with a reason and source references. Readers see the correction through its lasting state identity.
- [x] #2 The original checkpoint remains exact and readable. Ordinary edits to historical states still fail. Comparisons expose the correction and its audit trail.
- [x] #3 Following local drafts reconcile against the correction. Adopted successors and unrelated current states remain unchanged.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [x] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement the approved backend/shared contract/CLI/server slice only.
1. Confirm signed integration ancestry before runtime work.
2. Claim Board persistence, Command interface, and Archboard server routes. Create TASK-549.09 draft proposals.
3. Publish the shared correction contract and browser fixture recipe in the durable task directory.
4. Use public architecture operations with real files and Git for focused RED/GREEN correction, exact history, family reconciliation, recovery, and adapter coverage.
5. Update consumer instructions, ADRs, domain terms, and test ownership. Run required affected gates without changing limits.
6. Merge latest integration, simplify, sign commits, release claims, stop this server, and publish backend handoff. Parent owns frontend acceptance, adoption, and closure.

7. Add Browser application@TASK-549.09. Extend the existing state history disclosure with correction reasons, source commits, exact reading links, and comparison-base audit evidence. Keep one bounded history region and no browser correction writes.

8. Use the existing browser seam with public HTTP fixture edits and real temporary Git. Prove live archive-only correction refresh, original checkpoint navigation, comparison provenance, following draft inheritance, and unavailable history recovery. Reuse runtime evidence for authoring refusals and adopted-successor preservation.

9. Update consumer and frontend guidance. Run affected checks, simplify, restate and adopt the completed architecture descriptions, sign completion, release claims, stop the server, and hand the source to the merger.

10. Reuse correction-family runtime coverage and the existing reconciliation browser owner for following-draft behavior. The correction browser case owns audit visibility, exact navigation, comparison, archive-only refresh, and unavailable-history recovery.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Confirmed signed bd3566cadd9478ac749393d711e5f730fb722744 includes source 4e8320d1b and main a98f28811 before tests or servers. Claimed and authored draft proposals Board persistence@TASK-549.09 (7XP2HHCT), Command interface@TASK-549.09 (7Dr76nZE), and Archboard server routes@TASK-549.09 (Mt2loqNM). Early contract and parent fixture: /home/msc/.local/state/archboard-implementation/task-549/task-549.09-contract.md. Public real-file/Git architecture operations are the approved primary seam. Parent owns frontend acceptance.

Backend/shared contract/CLI/server slice is ready for parent browser acceptance. The shared writer accepts correction with previous exact checkpoint, reason and immutable source revisions. Retained identity changes preserve original checkpoints, lasting state identity and an explicit audit chain. Existing family reconciliation handles safe inheritance, conflicts and blocked descendants without changing adopted successors or current content. Completed-state claims, fetched logical history, source associations and live identity reservations use existing owners. The completion observer now detects archive-only writes from other processes.
Evidence: 24 runtime tests /161 assertions across11 owners pass on frozen source, plus the final structural correction case /5 assertions. CLI/HTTP parity passes1 case /10 assertions. Source/browser types, warning-free lint, formatting and21 evaluation scenarios /21 fixtures /14 coverage parts pass. Exact logs and early contract are in /home/msc/.local/state/archboard-implementation/task-549. The known board interface width remains245/188 under TASK-549.24; no rule or ceiling changes. Three draft architecture proposals remain unadopted. Parent owns every browser change and all acceptance criteria. No children, review, push, PR or task closure.

Final simplification uses one private change schema for current, proposal and correction intents, so TASK-549.14 can extend the change vocabulary once. The final CLI/HTTP owner passes1 case /10 assertions after the schema and identity reservation changes. Final types, lint and formatting pass. Code checks report zero warnings on the three task drafts; nine inherited warnings remain on unrelated boards. All original test deadlines and interface ceilings remain unchanged. The parent receives exact source, contract, fixture and evidence pointers in task-549.09-backend.md. Keep all criteria unchecked, the task In Progress and the three architecture proposals draft for parent browser acceptance.

First browser slice passes one case with seven assertions. An archive-only correction refreshes the open logical state while the current file revision stays unchanged. The existing history disclosure shows its reason, date, source commit, and exact prior and corrected reading links. Opening the prior checkpoint preserves original facts. Source and browser types and lint pass. Comparison-base audit, following draft acceptance, unavailable history recovery, final documentation and adoption remain pending.

The first comparison test repeated two extra archive writes for following-draft behavior and exceeded its case budget before a useful failure report. The browser case now compares the already retained original and corrected readings, which covers the same visible audit contract with less setup. The existing public correction-family tests own following-draft reconciliation and inherited facts. The existing reconciliation browser owner covers its unchanged visible standing contract. No existing deadline or wall-clock gate changes.

Parent browser acceptance passes four cases with 33 assertions across corrections, lifecycle, reconciliation and planning. The stable correction case passes 10 assertions after its diagram-fit wait. Source and browser types, lint, formatting and evaluation inputs pass. Both correction screenshots and the Browser architecture diagram were inspected. No screenshot calls remain. The existing bounded state history owns both audit trails and exact-reading navigation. Runtime family evidence proves draft inheritance and adopted-successor preservation. All four accepted architecture descriptions are adopted. Three original backend drafts are shelved as restatement provenance. Every original variant content and parent, prior decision, and view remains exact against f66b4709401804f608a88095a13e8edad16e9192. Current semantics has no diagnostics and affected scopes have no code warnings. Eight unrelated Archboard warnings and the inherited board interface width245/188 remain for the final integration work. No validation rule or deadline changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Agents can correct recorded facts with source evidence while exact originals remain readable. Readers can inspect correction reasons, dates, source commits, and prior or corrected checkpoints through the existing history disclosure. Comparisons expose both audit trails. Archive-only writes refresh logical readings without changing current files. Public runtime and browser tests cover reconciliation, preservation, recovery, and visible navigation. Architecture descriptions, ADR0061, consumer guidance and test ownership match the implementation.
<!-- SECTION:FINAL_SUMMARY:END -->
