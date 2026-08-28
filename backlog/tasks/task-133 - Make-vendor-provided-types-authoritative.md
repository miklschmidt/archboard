---
id: TASK-133
title: Make vendor-provided types authoritative
status: Done
assignee:
  - '@codex'
created_date: '2026-08-28 14:02'
updated_date: '2026-08-28 14:07'
labels: []
dependencies: []
references:
  - docs/agents/boundaries.md
modified_files:
  - docs/agents/boundaries.md
priority: high
type: docs
ordinal: 149000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Record the repository rule that code representing a third-party data structure derives its types from that dependency's exported types. The rule exists so dependency upgrades make incompatible assumptions fail at type-check time instead of leaving handwritten copies to drift. Local input models, metadata, and adapters remain valid only where they represent genuinely different concepts at a named seam.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The canonical module and import rules require vendor-shaped local types to derive from vendor-provided types and forbid handwritten structural copies.
- [x] #2 The rule distinguishes derived vendor data from genuinely local input, metadata, and adapter types, and explains what to do when a dependency publishes no usable type.
- [x] #3 The rule requires a machine-enforced conformance check where the repository can express one stably, and names the current Excalidraw type copies as noncompliant work rather than an exception.
- [x] #4 Repository Markdown formatting and lint checks pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one authoritative vendor-type section to docs/agents/boundaries.md. 2. Track the existing Excalidraw migration as a separate implementation task. 3. Run focused Markdown formatting and lint verification, then finalize this documentation task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added the Vendor-owned data rule to docs/agents/boundaries.md. It makes vendor exports authoritative, separates genuinely local models at named seams, defines the no-type fallback, requires machine enforcement, and points the existing Excalidraw copies to TASK-134. Verified with bun run lint, bun run fmt:check, and git diff --check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made vendor-provided types authoritative in the canonical module and import rules. The rule forbids handwritten vendor-shaped copies, keeps local input and metadata behind named adapters, defines the no-export fallback, and requires machine enforcement. TASK-134 tracks the current Excalidraw violation. Verified by manual review of the rendered rule, bun run lint, bun run fmt:check, and git diff --check.
<!-- SECTION:FINAL_SUMMARY:END -->
