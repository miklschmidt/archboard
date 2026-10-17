---
id: TASK-494
title: archboard check warns when two parts bind the same symbol
status: In Progress
assignee:
  - '@implementer'
created_date: '2026-10-17 10:56'
updated_date: '2026-10-17 11:04'
labels:
  - check
  - board-store
dependencies: []
type: feature
ordinal: 859000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The archboard skill says to link another board with drillDown on a part the board draws anyway, never duplicating its parts (skills/archboard/SKILL.md, near 'never duplicating its parts'). Nothing enforces it, and agents keep copying parts. On 2026-10-17 the agent fixing the device-trust pull-request bodies measured the Docs-Architecture-Design vault: 43 bindings are held by the live variants of two or more boards, 33 of them naming the same symbol. Three kinds: copies made so one flow can cross two boards (Endpoint Trust Sequences restates 8 bound parts each of Device Trust Control Plane and Endpoint Gateway, and the flows have drifted apart), task boards that copy the board they change (TASK-411 TLS Termination and Platform Test IIS Ingress against Platform Test Cluster), and the same code under two names ('Azure PostgreSQL' and 'Private trust PostgreSQL'; one Application Gateway drawn twice on Endpoint Gateway). A bare file can be shared correctly (one OpenTofu root applied for test and for production), so only bindings that name a symbol count, and this is a warning, never a refusal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard check warns with its own code when two distinct parts in live variants (current and draft, not historical or shelved) bind the same repository, path and symbol, on one board or on two, and the warning names both parts with their boards and variants
- [ ] #2 The same part continuing across variants of one board (same id) is not a duplicate
- [ ] #3 No warning when one of the two parts drills down to the other's board
- [ ] #4 Bindings without a symbol are never reported
- [ ] #5 Tests own each rule above and fail on the old code
- [ ] #6 Run read-only against a copy of the Docs-Architecture-Design vault, the warning finds the 33 symbol duplicates the measurement found, or the difference is explained
- [ ] #7 The archboard skill names the warning beside the drill-down rule
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New lib file src/runtime/semantic-board-store/lib/shared-bindings.ts, called from checkSemanticVault beside the other per-board checks (it needs every board, like the drill-down lookup). 2. Parts keyed by board + node id; collect the symbol bindings of each part across current and draft variants (contentCheckedVariants); group by repo+path+symbol; one SHARED_SYMBOL warning per pair of distinct parts, unless a part's drillDown opens the other's board (resolved by the drill lookup, boards differing). 3. Add optional machine-readable sharedBinding field to VaultDiagnosticSchema (binding, two parts with board, variants, id, name). 4. Tests in store tests/shared-bindings.test.ts, one per rule, plus one CLI/server contract check that the field survives the schema. 5. SKILL.md sentence + generate:skill-artifacts. 6. AC6 run on a /tmp copy of the Docs-Architecture-Design vault (read-only source).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built: src/runtime/semantic-board-store/lib/shared-symbols.ts, run by checkSemanticVault (the plain vault check, no --code) after the per-board checks. Warning SHARED_SYMBOL, one per pair, with machine-readable sharedSymbol {binding:{repo,path,symbol}, parts:[{board,id,name,variants[]}x2]} added to VaultDiagnosticSchema (src/shared/semantic-policy). A part is board+node id across current and draft variants only. Decisions: (1) two parts of one board are a pair only where one variant carries both, so a draft that replaces a part under a new id (PART_RECREATED confirmed) stays quiet; on the Docs vault this drops telemetry-route (34 -> 33 definitions). (2) a drill-down counts when resolved by the vault's drill lookup (former names, own repository identity) and the pair is on two boards. AC6 on a /tmp copy of Docs-Architecture-Design: 33 distinct symbol definitions shared, 63 pairs, equal to the measurement of 33. Tests: tests/shared-symbols.test.ts (9), check.test.ts keeps sharedSymbol through the CLI schema. SKILL.md names the warning.
<!-- SECTION:NOTES:END -->
