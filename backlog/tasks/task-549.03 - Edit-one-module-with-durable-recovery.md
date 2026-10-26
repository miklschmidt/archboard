---
id: TASK-549.03
title: Edit one module with durable recovery
status: In Progress
assignee:
  - '@codex-backend'
created_date: '2026-10-26T05:24:00Z'
updated_date: '2026-10-26T10:16:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.02
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 933000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 3.

## What to build

A lost response or interrupted write must not leave readers with mixed architecture files.

An agent changes a module description through the shared operation interface. The CLI and server return the same durable outcome and recovery information.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.02
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent changes a module description through the shared operation interface. The CLI and server return the same durable outcome and recovery information.
- [ ] #2 Include an explicit target, expected read token, operation ID, writer, doing line, and subject claim. Claim visibility and take-back work in the browser.
- [ ] #3 Use the complete journal and installation contract for this narrow edit. Signing failure changes no current files. Interrupted installation resumes or reports preserved foreign content.
- [ ] #4 Repeating a completed request returns its recorded result. Reusing its operation ID for another request fails. Readers never receive a mixed installation.
- [ ] #5 Stable external edits refresh readers without inventing adoption. Invalid or changing files block writes and mark an old scene stale.
- [ ] #6 Journals remain checkout-specific. Branch changes block unsafe recovery. Notifications follow durable completion, and reconnection obtains a fresh coherent read.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create TASK-549.03 draft proposals on Board persistence, Command interface, and Archboard server routes. Preserve every existing identity.
2. Add subject claims and one description-edit operation at the approved public runtime seam. Keep the current read schema stable.
3. Build signed preparation, checkout-local journal recovery, exact-byte guards, durable completion, retries, and public news in red/green slices with real files and Git.
4. Connect the same contracts to CLI and HTTP. Document recovery, domain terms, and consumer examples.
5. Simplify, run focused checks, merge latest integration, commit signed checkpoints, and hand off remaining browser criteria without closing the ticket.

Affected drafts: Board persistence@TASK-549.03, Command interface@TASK-549.03, Archboard server routes@TASK-549.03. Browser proposals remain parent-owned. The public read signature stays synchronous and its success schema stays unchanged. Current reads block pending installs. Explicit recovery and a vault-scoped snapshot/news stream supply the browser integration.
<!-- SECTION:PLAN:END -->
