---
id: TASK-653.02
title: Timing owns the waiting
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T16:23:00Z'
updated_date: '2026-11-19T17:43:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 1 of the archboard-deepen run, first and alone on the TypeScript track. packages/timing is wide (37) and shallow (132 pieces of logic): 26 names only return a stored number, and callers hand-write 15 poll loops and about 24 deadline and age sums. The settled design, every decision and its reason: the "Candidate 1, timing: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md and the tree tree-01-timing.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout). Owner decision 18 (one keyed getter per package) is in the same log.

## Architecture

- Proposal: the redesign proposal of the deepen/module-depth layer (see TASK-653.01 notes for its id).
- Slice: timing (packages/timing) and the callers that change: the modules of the 142 importing files.
- Gate: `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state <proposal> --model-at checkout --fail-outside` exits 0 or has recorded exceptions, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on timing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 timing exports exactly waitUntil, pause, deadline, durationMs, painterPhasesJson, reachHopDelayMs, columnSlideSettledMs, codexRestartDelayMs and localityDefaultSinceSeconds; INTERFACE_WIDE and MODULE_SHALLOW clear on timing
- [x] #2 The hand-written poll loops use waitUntil or pause, each keeping its probe order, final sleep, deadline check placement and abort point
- [x] #3 Deadline and age sums use deadline; callers keep their own comparison operators; no wait bound or cadence is readable through durationMs except the registry lock poll cadence
- [x] #4 Every duration value, epoch timestamp, painter JSON byte and caller sentence is unchanged, and the voice package bundle and the site build pass
- [x] #5 Fake-clock seam tests cover sleep-first policies, boundMs, capAtMs, signal before probe, deadline equality, overshoot, cancellation precedence and probe errors; superseded tests are replaced, not layered
- [x] #6 An ADR records the getter rule, its one exception and the rejected timer, age and retry operations; boundaries.md and the frontend examples follow the new interface
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Timing core, test first: durations named "<owner>.<key>" (DurationName) over the private groups; durationMs over a closed ReadableName list (every key with a numeric consumer; wait-only bounds and cadences left out except modelLock.poll); deadline(name, fromMs, capAtMs?); Clock port { now, after -> cancel } with a private default that reads globals at call time; waitUntil over private wait policies (bound, cadence, sleep-first, check placement, comparison, last sleep, 1 ms floor); pause over private cadence policies. Fake-clock seam tests replace the value-pin test; relationship and backoff tests move to the seam suite.
2. Number substitutions, one commit per package: getters become durationMs, one-key deadline functions, overloads and inline sums and ages become deadline (callers keep their operators); caller tests that advance time by a getter switch to literals.
3. Loop conversions, one commit per site: each hand-written poll uses waitUntil or pause and keeps its probe order, final sleep, check placement and abort point; WorkTreeStopClock and ProcessGroupCleanupClock become the Clock port.
4. Delete the 26 getters and the one-key functions, move createElapsedClock to code-intel, lower the interface-width ceiling to the measured count, write the ADR, update boundaries.md, frontend.md and the timing header.
5. Verify: build, types, lint:all, format:check, test:modules, test:repository, test:system, browser lane for changed UI callers, pack:voice and its test, site build, check code --fail-shallow-modules; merge deepen/module-depth and rerun.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr (timing's slice is added when the build reports its relationships).

Implementation (TASK-653.02):
- timing exports waitUntil, pause, deadline, durationMs, painterPhasesJson, reachHopDelayMs, columnSlideSettledMs, codexRestartDelayMs, localityDefaultSinceSeconds, and the type Clock. Code check: 9 functions, 1 type, 224 pieces of logic, no finding on timing. ADR 0058 ceiling 37 -> 10 (measured, types included).
- Durations are named "<owner>.<key>" over the private groups. Wait policies (15) and pause cadences (5) are private rules. Two literal cadences moved into timing with their values: pane.settlePoll 50 and serverLifecycle.startupProbePoll 250. createElapsedClock moved to code-intel.
- Loops converted (one commit each): server-lifecycle stop pidfile wait and stop confirmation, start readiness (preload overrides via waitUntil), CLI pane arrival, skills server health and group settle, voice work-tree stop (pause, Clock port), workbench target wait and layout settle, Git group absence, Codex kill drain (Clock port), frozen-group pauses, walkthrough replay-page and recording-page readiness (monotonic clock), web frame readiness and tap drain (monotonic clock), model lock acquisition (pause), rasterizer document load, headless Chromium port and exit. registry-file keeps its synchronous loop, reads modelLock.poll and uses deadline for the lease age.
- Verification: build, types, lint:all, format:check, test:modules (5348 pass), test:repository (176 pass), test:system 226 pass / 1 fail (voice-package concept check, below), browser lane 8 owners pass, pack:voice builds, site build passes, check code: no finding on timing.

Blocked (design conflict, reported, not worked around):
- AC #4: tests/system/process-contracts/voice-package.test.ts fails. The one keyed name table (owner decision 18: one getter per package; names resolved at runtime) imports every owner group, so the published voice bundle now carries every duration, its comments and names such as "pane.report", and the packed-package concept check finds Archboard concepts. Before, the bundler kept only codex.ts. No implementation of a single name-keyed lookup lets the bundler drop unused owners; stripping comments in the pack would still leave "pane.*" names and the `dock` key. Needs an owner or advisor decision.
- AC #3: "git.groupCleanup" stays readable through durationMs: it bounds the Git group-absence wait and is also the grace timer a terminated Git command races against (git-command.ts settleRun), and the settled design gives timers durationMs. ADR 0083 records it.
- AC #6: docs/agents/boundaries.md was deleted on deepen/module-depth by TASK-653.03; the timing description now lives in the timing.ts header and ADR 0083. ADR number 0083 may collide with the Scene ticket's ADR if it lands first.
- The vault's relationship anchors still cite the removed getters (12 ANCHOR_* warnings) and "Code check -> timing" is lost; the vault was left unchanged as instructed.

Resolution of the voice package conflict (settled deviation, decisions.md "TASK-653.02 deviation, SETTLED"):
- timing's private tables are split under src/shared/tables/rules/: published.ts holds codexApproval, codexProcess, codexRealtime, codexSession and processGroup, the wait processGroup.killDrain and the pauses processGroup.poll and codexSession.workTreeStopPoll; host.ts holds every other group (git included), the other 13 waits and the pauses modelLock.poll, git.groupPoll and recorder.poll. Both read the same owner groups under constants/. shape.ts holds NameOf, WaitPolicy<Name> and PausePolicy; published policies are typed against published durations only.
- No Git key is published: the packed bundle reaches no Git command (process/git is not imported by the voice graph); the bundle's timing calls name only Codex and processGroup durations.
- package.json imports '#host-tables' resolves under the published condition to host-absent.ts (empty); pack-codex-realtime-voice.ts builds with conditionNames [published, node, import, default]. Types resolve the default, so callers see every name. durationOf, waitUntil and pause throw with the name for a name the build does not carry.
- Mechanism comments reworded (timing.ts header, names.ts, duration-ms.ts); ADR 0083 records the split and the rejected alternatives.
- voice-package.test.ts now reads every name the packed code passes to timing through 'bun --conditions published' (waits through waitUntil), checks a host name throws by name, and runs the packed server start and shutdown against a Codex that exits plus the packed browser client's reconnect backoff.
- Readers of package.json imports learned conditional entries (default target): the oxlint import resolver and tests/system/repository-policy/support/package-sources.ts.
- No caller changes; timing exports unchanged (9).
Verification after merging deepen/module-depth (only backlog tickets came in): build, types, lint:all, format:check pass; test:modules 5348 pass; test:repository 176 pass; test:system 227 pass (voice-package included); full serial browser lane passes; pack:voice builds and the concept check finds nothing; site build passes; check code --fail-shallow-modules: no INTERFACE_WIDE or MODULE_SHALLOW on timing (other modules' known findings and ANCHOR warnings for the removed getters remain; information CODE_PASS_THROUGH on durationMs -> durationOf).
- ADR 0083 is free on deepen/module-depth, but deepen/653-01-scene also adds an ADR 0083; whichever lands second must renumber.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
timing owns the waiting: waitUntil over private wait policies, pause for loops that keep their own decisions, deadline for named deadlines and ages, and one durationMs getter for numbers a stylesheet, timer, physics constant, library or message takes, behind a Clock port. All 142 importers moved; every hand-written poll uses waitUntil or pause with its probe order, final sleep, check placement and abort point kept; the 26 getters and one-key deadlines are gone; createElapsedClock moved to code-intel. Width 37 -> 9, no finding on timing. The name and policy tables are split into a published half (Codex groups and processGroup) and a host half that a build under the published condition leaves out, so the voice package bundles none of Archboard's durations; its packed-consumer test proves every name the packed code calls resolves in that build. ADR 0083 records the getter rule, its exceptions and the split. Deviations accepted by the advisors: git.groupCleanup stays readable for the cleanup grace timer.
<!-- SECTION:FINAL_SUMMARY:END -->
