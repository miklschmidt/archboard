---
id: TASK-143.05.03
title: Define the six general thread-coordination tools
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 02:53'
labels: []
dependencies:
  - TASK-143.01.03
  - TASK-143.01.07
  - TASK-143.01.16
  - TASK-143.01.17
references:
  - docs/design/codex-workbench-authored-contracts.md
  - docs/design/desktop-app-server-sharing-research.md
modified_files:
  - src/runtime/codex-thread-tools
parent_task_id: TASK-143.05
priority: high
type: task
ordinal: 186000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Load and validate the exact reviewed eager archboard_app namespace manifest and strict schemas. This catalogue describes tools only; it does not dispatch effects or author tool text. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The namespace description, ordered six tools, deferLoading false, strict schemas/limits, and additionalProperties false match the canonical literal manifest byte-for-byte, including wait_threads cursor input.
- [x] #2 Result parsing accepts only canonical per-tool envelopes, including confirmed create/fork identity with initialTurn delivery/not-delivered/uncertain state; media and unknown fields fail closed.
- [x] #3 The stable manifest hash is bound to reviewed workhorse bytes and supplied only on eligible Archboard-created starts; attach/reconnect cannot install or replace tools.
- [x] #4 Fixtures fail on order/prose/schema/limit/tag drift, unknown tools/fields, caller-selected identity, unsupported override, malformed bound cursor/timeout, missing partial-result fields, or non-text output; the public wait timeout maximum imports and remains strictly below CODEX_BROWSER_COMMAND_LEASE_MS.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the reviewed archboard_app manifest, canonical workhorse bytes, public wait timeout, and exact Codex result envelopes. 2. Implement one codex-thread-tools catalogue boundary with byte-stable eager namespace metadata, strict request/result schemas, and eligible-start binding only. 3. Add independent fixtures and mutation tests for ordering, prose, schema, limits, tags, cursor/timeout, delivery uncertainty, media, identity selection, and attach/reconnect exclusions. 4. Run focused, module, repository, type, lint, format, diff, and clean-status gates; record evidence for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review-driven dependency correction from TASK-143.01.16: the 120,000 ms wait_threads maximum is owned by this public tool schema, not by a test-only literal in shared timing. This leaf now depends on TASK-143.01.16 and must enforce its exported timeout maximum against CODEX_BROWSER_COMMAND_LEASE_MS while retaining the exact reviewed manifest bytes.

Reserved immediately after TASK-143.01.07 finalized at integration HEAD d890552. This dependency-ready leaf owns only src/runtime/codex-thread-tools and is path-disjoint from every active implementation.

Implemented in 93cdace from fixed integration base 317d3aca9c82e4f13242def9040a1aa5ffb0f07c. Added the exact eager archboard_app manifest, independent raw-byte SHA-256 verification, strict six-tool argument/result boundaries, canonical compact JSON and one-inputText response validation, reviewed workhorse-byte binding, and fresh Archboard-created-start-only installation gating.

Focused evidence at this head: bun test --isolate src/runtime/codex-thread-tools/tests (14/14 tests, 276 expectations); bunx tsc --noEmit --pretty false; bunx oxlint src/runtime/codex-thread-tools; bunx oxfmt --check src/runtime/codex-thread-tools; git diff --check; manifest sha256sum df0fc2b1b33d985a7b84e54431162d6c00a3da0f8cecd98a18730e55bc7b272e. The public wait maximum is 120000 ms and is checked strictly below CODEX_BROWSER_COMMAND_LEASE_MS.

The uncapped module/system/check/serial-browser lanes were intentionally not rerun in this continuation after the desktop app OOM; parent-owned capped broad validation remains the integration follow-up. Scope remains src/runtime/codex-thread-tools/** plus this task record.

Review remediation committed in b6b86cdea6138b1202382a869f37a4e3f94ee5ab from prior head 5c0d1f2f8632d8dc845ce27e3678a6c4e7722021: split code-point manifest maxLength validation from explicit UTF-8 output caps, removed the undocumented NUL rejection, added recursive schema-defined canonical JSON serialization, correlated create/fork initialTurn delivery with state and identities, restricted success:false to boundary refusals, and enforced list/read/inputText cardinalities. Added adversarial mutation coverage for all envelope families, refusal reasons, state/identity combinations, and reviewed 100/101, 20/21, and 16,384/16,385 boundaries. Focused evidence at this head: bun test --isolate src/runtime/codex-thread-tools/tests (20/20 tests, 344 expectations); bunx tsc --noEmit --pretty false; bunx oxlint src/runtime/codex-thread-tools; bunx oxfmt --check src/runtime/codex-thread-tools; git diff --check; manifest sha256sum df0fc2b1b33d985a7b84e54431162d6c00a3da0f8cecd98a18730e55bc7b272e. Uncapped module/system/check/serial-browser lanes remain intentionally deferred after desktop-app OOM; parent owns capped broad validation. Scope remains src/runtime/codex-thread-tools/** plus this task record.

Independent review returned REVIEW_CLEAN for the complete fixed range. Root validation passed in capped unit archboard-task1430503-focused-4486941.service (20 tests, 344 expectations, 43.9 MB peak, 0 swap, 6 GB/1 GB caps) and capped integration unit archboard-integration-modules-6220ca2.service (1,296 tests, 12,673 expectations, 1,018.6 MB peak, 0 swap, 12 GB/2 GB caps); neither cap was hit.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Defined the exact six-tool archboard_app coordination catalogue, strict argument and canonical result envelopes, and eligible fresh-workhorse binding. Review remediation closed Unicode/byte-limit, canonical serialization, delivery-state, refusal-boundary, and cardinality gaps. Independent review and capped focused plus full module validation passed.
<!-- SECTION:FINAL_SUMMARY:END -->
