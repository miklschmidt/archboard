---
id: TASK-281
title: Rename semantic boards and variants without losing identity or links
status: To Do
assignee: []
created_date: '2026-09-19 16:15'
labels:
  - needs-triage
dependencies: []
references:
  - src/runtime/semantic-board-store
  - src/cli
documentation:
  - docs/adr/0010-board-names-are-case-insensitive.md
  - skills/archboard/SKILL.md
type: feature
ordinal: 495000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A user of the Docs-Architecture-Design vault asked to give every board and variant proper human-readable names. Existing boards have slug-like names such as platform-public-api and common-weblib; variants include Initial and public-api-independent. The installed semantic CLI can create names but cannot change existing board or variant names, and semantic edit exposes no naming metadata. The consumer skill correctly refuses direct edits to server-owned board files, so the request cannot currently be completed.

Enable agents to improve these names through the supported authoring interface while retaining the architecture, variant history, and navigation readers already use. Example outcomes: platform-public-api becomes Platform Public API, and public-api-independent becomes Independent Public and Phone APIs. Renaming must remain a metadata operation, not a delete/recreate or adoption operation. Keep the browser read-only. This task covers the naming capability, not renaming a particular consumer vault or unrelated node/icon work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent can rename an existing semantic board and an existing variant through a documented CLI operation, including names containing spaces, without editing vault files directly.
- [ ] #2 Renaming preserves board, variant and subject IDs, all architectural content, variant ancestry, lifecycle, reconciliation and adoption history; it does not create replacement boards or variants.
- [ ] #3 Board listings, variant selectors and open readers show accepted names. Existing drill-down references, including named-variant links, remain valid; saved pane URLs remain resolvable or receive a deterministic redirect to the renamed subject.
- [ ] #4 Renames obey expected-version checks, leases and claims. A stale, conflicting or invalid request leaves the vault and its references unchanged, with an actionable diagnostic.
- [ ] #5 Name validation follows the existing board addressing and collision rules, including case normalization and the @ delimiter; variant-name collisions within a board are refused. Case-only and unchanged-name requests have explicit, tested behavior.
- [ ] #6 CLI help, consumer skill recipes/references and applicable generated schemas describe the supported naming workflow. Focused behavioral tests cover successful board/variant renames, identity and link preservation, live-reader refresh, collisions and stale-write refusal.
<!-- AC:END -->
