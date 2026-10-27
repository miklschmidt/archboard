---
id: TASK-549.22
title: Preserve legacy walkthroughs, bookmarks, and addresses
status: In Progress
assignee:
  - '@codex-backend'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-27T11:18:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.14
  - TASK-549.21
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 952000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 22.

## What to build

Migration must preserve existing navigation and presentations without retaining duplicate model content.

Complete the migration preview with dynamic walkthrough readings, imported bookmarks, former names, and explicit legacy address mappings.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.14, TASK-549.21
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Complete the migration preview with dynamic walkthrough readings, imported bookmarks, former names, and explicit legacy address mappings.
- [ ] #2 Expand referenced views into walkthrough beats. Preserve other named views as bookmarks that own no model content.
- [ ] #3 Resolve migrated subject and state targets without fallback to similar names or current content. Unpinned external historical references remain explicitly unresolved.
- [ ] #4 A reader can play the converted walkthrough and follow a legacy address within the preview. The original vault still remains authoritative.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Publish the preview playback, bookmark, and legacy address contract. Create draft Board persistence, Command interface, and Archboard server routes proposals through claimed CLI writes.
2. Use focused RED/GREEN public runtime cases with real files and Git for converted readings and exact address resolution. Preserve original coverage, identity choices, and retained inputs.
3. Extend the existing playback and reference owners, then add thin CLI and HTTP selectors. Update consumer, domain, ADR, evaluation, and test ownership documentation.
4. Run affected validation with fixed source, simplify, merge latest integration, release claims, stop this checkout server, and write the backend handoff. Parent owns frontend acceptance and keeps proposals draft.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Published task-549.22-contract.md in the shared context directory before implementation. Created Board persistence@TASK-549.22, Command interface@TASK-549.22, and Archboard server routes@TASK-549.22 through claimed CLI writes. Their planned descriptions extend existing readers and adapters without adding a persistence owner. The original vault remains authoritative. The approved primary test interface is the public runtime with real disk and Git.

Focused RED/GREEN cases now pass for complete narrative conversion, unused bookmarks, exact legacy addresses, immutable playback metadata, and predecessor former names. The existing playback owner supplies readiness and retained-target refusal. Original files stay byte-identical and continue to own live reads. Added identity-only visibility selectors to preserve exact original relationship subsets.

Extended thin CLI and HTTP selectors for exact legacy addresses and optional bookmarks. Historical drill-down choices now identify their original source state. Same-vault preview references use the existing reference owner, including explicit earlier checkpoint targets. Legacy omitted views expand to complete instructions: the original overview before the first explicit view, then the last explicit view. Parent contract records this behavior. Preparing the signed TASK-549.18 integration merge while preserving accepted diagrams and draft .22 provenance.

Merged signed integration 9d19307d41d33b328916a9a3ebe6c3bca309a21c through signed merge 4b6ced182. All accepted .18 variants, views, and lifecycle decisions remain exact. Preserved .22 draft identities and parents, then composed accepted .18 content into those drafts through claimed CLI edits with explicit identity restoration. The portable closure validator now accepts only the migration checkpoint envelope through the existing originals reader. A focused RED/GREEN export/import case preserves exact original playback, bookmarks, and former addresses. No current portable input validation rule changed.

Owner correction supersedes the prior view inheritance plan. Every converted beat now requires an explicit original view. Removed activeView inheritance and implicit overview selection. Old original bytes and omitted fields remain decodable and retained. Missing views produce WALKTHROUGH_VIEW_REQUIRED on only their affected beats. Overview fixtures now name an explicit all-scope architecture view. Canonical beats retain their existing required complete reading, with no legacy view ID added. Focused RED/GREEN missing-view evidence is 42-required-view-red.log and 43-required-view-green.log. Parent has no UI edits yet.

Backend acceptance evidence is complete at the approved real-file/Git runtime seam. Final explicit-view migration suite passes 34 cases and 173 assertions. Reused unchanged passing evidence covers seven canonical narrative cases, ten reference cases, three adapter/portable cases, and 73 package/skill cases. Source and browser types, full lint with zero warnings, formatting, evaluation input validation, and diff whitespace pass. New missing-view behavior has focused RED/GREEN evidence and an explicit all-scope view fixture. Final .22 draft code checks have zero warnings; eight unrelated Archboard warnings remain. Two semantic warnings reproduce on the exact accepted .18 current variants, which this task preserves as requested. The inherited 250/188 interface transition remains with .24. No full gate or browser acceptance is claimed. Simplification removes inherited view state and duplicate retained reads, keeps one playback owner, and reuses the portable archive validator. Parent UI and .23 installation remain outstanding. TASK-549.22 stays In Progress, all acceptance items stay with the parent, and all .22 proposals remain draft. The shared contract and task-549.22-backend.md contain exact source, fixture, evidence, and recovery details.
<!-- SECTION:NOTES:END -->
