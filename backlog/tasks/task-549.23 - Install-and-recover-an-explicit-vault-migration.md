---
id: TASK-549.23
title: Install and recover an explicit vault migration
status: In Progress
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-27T14:12:00Z'
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

Parent completes browser acceptance at the approved existing browser seam. Create Browser application@TASK-549.23. Subscribe already-open panes to the existing architecture feed and use the public reader for authority. Show legacy content only under confirmed LEGACY_AUTHORITY. Preserve explicit recovery and unavailable states. Reuse bookmark, former-address, model, and walkthrough owners for installed metadata. Preserve exact original coverage after old-address resolution. Show that model ownership transfer is unavailable. Prove durable cutover, installed navigation, and recovery with real files and Git. Inspect the resulting UI, update consumer instructions, and adopt complete architecture only after acceptance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend-only slice starts at signed integration 4aed11f76a960af4cbd22cb1515f1c1228712d68. Required main a98f28811 is an ancestor. The owner approved the public architecture runtime seam with real files and Git. Parent owns all frontend work. No children, review, push, PR, adoption, or task closure.

Implemented owner-authorized complete migration through the existing installer and recovery operation. The early public contract is task-549.23-contract.md in the external context directory. Public runtime cases prove cutover, exact originals, compact drafts, planning exclusion, standing, blocked descendants, signing refusal, full fingerprints, private history, portability, and four interruption phases. The thin adapter proves an existing event connection observes durable canonical completion. Required views apply to converted current/draft narratives. Historical/shelved originals retain omitted fields and unavailable beat diagnostics. Parent acceptance remains open.

Installed canonical reads expose migration.bookmarks, migration.addresses, and migration.states. A selected bookmark uses migration.bookmark. Ordinary reads omit migrationPreview and the original envelope. Exact former addresses reopen retained original coverage through the existing selector. Local context uses the canonical runtime and requires exact capture for another state, checkpoint, or stale revision. Source and browser types, full lint, formatting, architecture semantics, 76 contract cases with 156 assertions, portable/proposal regressions, and the existing local explanation owner pass. The inherited package-width transition remains: board exports 252 names against the unchanged 188 ceiling. Architecture code evidence has eight inherited warnings on Archboard and none on the five affected draft scopes. Parent browser acceptance and TASK-549.24 retirement remain separate.

Signing restoration blocks the final source checkpoint. The configured SSH agent has no identities. A signed commit attempt returned No private key found and created no commit. The private PIN request timed out. Keep signing requirements unchanged. Source changes remain staged in feat/canonical-migration-backend. All five claims are released and only worktree server 19089 stopped. The latest integration merge reports Already up to date at 4aed11f76a960af4cbd22cb1515f1c1228712d68. The external backend handoff records the exact contract, signed real fixtures, evidence, and remaining parent work.

Backend implementation is staged but not yet committed because the configured hardware signer is unavailable. The parent preserved its staged snapshot in task-549.23-staged-backup.patch. The smart-card service is active but reports USB timeouts while initializing the connected YubiKey. The parent requested reconnection and continues independent frontend work. No signing requirement is weakened. Existing backend evidence and the remaining final runtime case are recorded in task-549.23-backend.md. Keep the backend index unchanged until the signed checkpoint can be made.

The owner restored signing. The final blocked runtime case passes with 18 assertions. The exact staged backend is saved as signed commit 4977bbf48c8fa917ab35ed362808e16e807305d8. Parent browser work continues. Installed bookmarks and exact former-address navigation pass the focused browser case with five assertions. The previous signing blocker is resolved.

Fixed the confirmed installed-bookmark gap at signed source 4977bbf48. The public real-file/Git regression first reproduced empty diagnostics after valid external removal of Db. Bookmarks now share the existing playback readiness rules and report missing subjects, flows, scope, or filters through existing diagnostics. Exact reading intent, retained originals, and canonical authority stay intact. Focused runtime evidence: 17 cases, 103 assertions. Focused source/test lint and source types pass. Existing .23 drafts still describe this shared runtime behavior, so no extra proposal is needed. Status, assignee, acceptance criteria, and proposals remain unchanged for the parent.

Fixed the second confirmed cutover gap: installed addresses now capture exact legacy pane keys through the existing parser, serializer, and original-state resolver. Public RED reproduced LEGACY_ADDRESS_NOT_FOUND for shop after installation. Focused GREEN proves shop, shop@Old, and shop@Past reopen their exact original states and checkpoint, while uncaptured spellings refuse and colliding captured keys remain ambiguous. Two focused cases pass with nine assertions. Source types, focused lint, and formatting pass. The final simplification removes duplicate archive reads without changing deadlines. Source b94f8c3e6 remains an ancestor. Existing .23 runtime drafts stay accurate, with no extra proposal. Parent status, assignee, acceptance, frontend, and browser ownership remain unchanged.
<!-- SECTION:NOTES:END -->
