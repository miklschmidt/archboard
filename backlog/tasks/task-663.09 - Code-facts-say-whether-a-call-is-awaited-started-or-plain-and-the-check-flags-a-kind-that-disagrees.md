---
id: TASK-663.09
title: >-
  Code facts say whether a call is awaited, started or plain, and the check
  flags a kind that disagrees
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T14:12:00Z'
updated_date: '2026-11-22T14:32:00Z'
labels:
  - feature
dependencies: []
parent_task_id: TASK-663
ordinal: 1155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sync and async must be decided from code, not guessed, in every language the code check reads (spec section 6).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each adapter (TypeScript, Rust, Python, Go, C#, Swift, Objective-C, C) reports awaited, started and plain call sites where its language decides them, and reports undecidable otherwise
- [x] #2 The code check reports a sync relationship whose anchored call is awaited or started, and an async one whose call is neither, as information
- [x] #3 Tests cover each adapter's await and task-start cases
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Code facts: each reference that calls its name, or hands it to a task starter, carries its site's timing (Reference.timing): awaited, started, plain, unknown, or unawaited where the callee decides. One shared reading (code-facts/operations/call-timing.ts) with a small timing table per grammar (<lang>-timing.ts), read beside the value mark (runs.ts markUse). Distinct references keep one per timing.
2. Definitions mark async callables (Definition.async) in TypeScript, Python, Rust and C#, so an unawaited call resolves to started or plain.
3. Code check: CALL_TIMING_MISMATCH (information) on an anchored sync relationship whose calls are all awaited or started, or async whose calls are all plain (claims/operations/call-timing-kind.ts). Evidence carries each call's timing.
4. API: @archboard/code-intel/code-facts exports readCallTimings and CallTiming for the upgrade inventory (TASK-663.08).
5. Tests: tests/runtime/code-facts/operations/call-timing.test.ts per adapter, relationships.test.ts for the finding, call-timings.test.ts for the API.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence: bun test packages/code-intel: 499 pass, 0 fail. call-timing.test.ts covers awaited, started and plain per adapter (TypeScript, Rust, Python, Go, C#, Swift, Objective-C, C) and async marks for TypeScript, Rust, Python and C#. relationships.test.ts e15 (sync, awaited post) and e16 (async, plain send) get CALL_TIMING_MISMATCH information; e11 (async, send handed to queueMicrotask) and e17 (sync, plain send) get none. call-timings.test.ts: imported async callee unawaited is started, sync callee plain, mixed sites unknown.
Decisions: a call inside a Swift await that is not its own is unknown; an Objective-C message handed a block or naming a completion handler is unknown; a name passed to anything but a starter carries no timing. Disagreeing sites decide nothing.
Boundary: the code-intel fixtures moved from kind call to sync, since TASK-663.08 refuses call. Not in my paths: apps/cli check-help.ts should list CALL_TIMING_MISMATCH beside DEPENDENCY_CALLED, and apps/server wires readCallTimings into the upgrade inventory (TASK-663.08).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Code facts now say how each call site runs its callee: awaited (await, .await, .then), started (a task starter such as create_task, Task.Run, Task {}, spawn, go, dispatch_async, pthread_create, or an async callee left unawaited), plain (a sync callee), or unknown. Go, C, Objective-C and Swift decide a bare call by syntax; TypeScript, Python, Rust and C# resolve it through the callee's async mark. The code check reports CALL_TIMING_MISMATCH, information, on a sync relationship whose anchored calls are all awaited or started and an async one whose calls are all plain. readCallTimings in @archboard/code-intel/code-facts gives the upgrade inventory an anchor's timing through code facts alone. Follow-ups outside this task's paths: check help in apps/cli should name CALL_TIMING_MISMATCH, and the server's upgrade route wires readCallTimings (TASK-663.08).
<!-- SECTION:FINAL_SUMMARY:END -->
