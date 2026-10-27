---
id: TASK-549.23
title: Install and recover an explicit vault migration
status: In Progress
assignee:
  - '@codex-backend'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-27T13:10:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.17
  - TASK-549.22
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 953000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 23.

## What to build

Format replacement must survive interruption and refuse source changes after preview.

An owner applies a complete migration preview. The operation retains original inputs before replacing the live format and switching every surface to the canonical model.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.17, TASK-549.22
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An owner applies a complete migration preview. The operation retains original inputs before replacing the live format and switching every surface to the canonical model.
- [ ] #2 Changed source or target inputs require a new preview or explicit recovery. Interrupted cutover resumes through the existing journal without losing either representation.
- [ ] #3 A repeated completed migration is a no-op. Only one format remains authoritative. CLI, server, browser, and local agents use the new runtime afterward.
- [ ] #4 The same workflow supports Git-backed and untracked vaults. Cache and subscription changes follow durable completion. Ownership transfer controls explain that transfer is unavailable.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Publish the shared migration request, receipt, authority discovery, and parent fixture contract.
2. Claim Board persistence, Command interface, and Archboard server routes and draw TASK-549.23 drafts.
3. Use focused public-runtime RED/GREEN cases for complete cutover, original retention, proposals, signing, fingerprints, retry, recovery, private history, and portability.
4. Add thin CLI/HTTP routing and canonical local-agent context.
5. Align consumer instructions, ADRs, domain terms, and test ownership. Merge current integration, simplify, sign checkpoints, and deliver the backend handoff. Keep task In Progress and proposals draft.

Architecture drafts: Board persistence@TASK-549.23, Command interface@TASK-549.23, Archboard server routes@TASK-549.23. Keep each draft for parent acceptance.

Additional affected architecture: Live panes@TASK-549.23 and Archboard server@TASK-549.23 describe the delivered canonical local-agent context. Their existing context-to-runtime relationships remain valid. Keep both proposals draft.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend-only slice starts at signed integration 4aed11f76a960af4cbd22cb1515f1c1228712d68. Required main a98f28811 is an ancestor. The owner approved the public architecture runtime seam with real files and Git. Parent owns all frontend work. No children, review, push, PR, adoption, or task closure.

Implemented owner-authorized complete migration through the existing installer and recovery operation. The early public contract is task-549.23-contract.md in the external context directory. Public runtime cases prove cutover, exact originals, compact drafts, planning exclusion, standing, blocked descendants, signing refusal, full fingerprints, private history, portability, and four interruption phases. The thin adapter proves an existing event connection observes durable canonical completion. Required views apply to converted current/draft narratives. Historical/shelved originals retain omitted fields and unavailable beat diagnostics. Parent acceptance remains open.

Installed canonical reads expose migration.bookmarks, migration.addresses, and migration.states. A selected bookmark uses migration.bookmark. Ordinary reads omit migrationPreview and the original envelope. Exact former addresses reopen retained original coverage through the existing selector. Local context uses the canonical runtime and requires exact capture for another state, checkpoint, or stale revision. Source and browser types, full lint, formatting, architecture semantics, 76 contract cases with 156 assertions, portable/proposal regressions, and the existing local explanation owner pass. The inherited package-width transition remains: board exports 252 names against the unchanged 188 ceiling. Architecture code evidence has eight inherited warnings on Archboard and none on the five affected draft scopes. Parent browser acceptance and TASK-549.24 retirement remain separate.

Signing restoration blocks the final source checkpoint. The configured SSH agent has no identities. A signed commit attempt returned No private key found and created no commit. The private PIN request timed out. Keep signing requirements unchanged. Source changes remain staged in feat/canonical-migration-backend. All five claims are released and only worktree server 19089 stopped. The latest integration merge reports Already up to date at 4aed11f76a960af4cbd22cb1515f1c1228712d68. The external backend handoff records the exact contract, signed real fixtures, evidence, and remaining parent work.
<!-- SECTION:NOTES:END -->
