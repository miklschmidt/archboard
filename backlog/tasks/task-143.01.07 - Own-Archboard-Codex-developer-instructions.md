---
id: TASK-143.01.07
title: Own Archboard Codex developer instructions
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 22:34'
labels: []
dependencies:
  - TASK-143.01.17
references:
  - docs/design/codex-workbench-authored-contracts.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-instructions
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Load, byte-freeze, hash, and compose the canonical authored contracts from the reviewed design record. Callers select a reviewed role and typed context; Luna implementers may not change prose or manifest semantics.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tracked workhorse and coordinator documents match the canonical UTF-8 bytes exactly; coordinator composition is workhorse bytes, the documented LF separator, then coordinator bytes with stable hashes.
- [ ] #2 additionalContext uses exactly key archboard and value {kind: application, value: canonical-json-string}; canonical JSON has the documented ordered fields and rejects caller-authored prose or unknown keys.
- [ ] #3 Ordinary turn/start and turn/steer text is exactly one UserInput {type: text, text, text_elements: []}; developer-role input_text is emitted only by the semantic thread/inject_items body. Attach/reconnect/rejoin never rewrites persisted instructions or tools, while forks use the literal reviewed fork profile.
- [ ] #4 Byte/body fixtures fail on BOM, newline, whitespace, separator, field order, prose, schema, omitted-field, role, or hash drift from the reviewed contract.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the reviewed authored-contract byte sections and fixed digests into a single codex-instructions module boundary without changing any prose, manifest semantics, or caller-selected suffixes.
2. Expose reviewed-role instruction composition and typed builders for canonical additionalContext, UserInput turn/start and turn/steer bodies, semantic developer-role inject_items, and the literal fork profile.
3. Keep attach/reconnect/rejoin paths free of instruction or tool rewriting and close every object/order/role/omission contract at the module boundary.
4. Add byte/body fixtures and mutation tests for BOM, newline, whitespace, separator, field order, prose, schema, omission, role, and hash drift; run focused, module, repository, type/lint/format, diff, and clean-status gates.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Batch reservation at integration HEAD 7e0c8ae: newly ready scoped leaves are exactly TASK-143.01.07 and TASK-143.01.16, with disjoint runtime/codex-instructions and shared/timing ownership. TASK-143.01.13 remains active on the protocol/package seam, so three of four leaf-worker slots are occupied. Slot 4 is intentionally unused because no other TASK-143/TASK-144 leaf is ready; all other ready scoped entries are parent containers and remaining leaves are dependency-blocked. TASK-141/TASK-142 remain unrelated CI-restoration bugs.

Implemented the scoped src/runtime/codex-instructions boundary: tracked UTF-8 role documents load with fixed SHA-256 validation; canonical context, turn/start, turn/steer, thread/inject_items, and fork builders use strict schemas and deep-frozen outputs. Added byte/body mutation fixtures for encoding, boundary, order, schema, role, omission, and hash drift cases. Focused validation passed: 11 tests, 81 expectations; tsc, Oxlint, and Oxfmt checks passed.
<!-- SECTION:NOTES:END -->
