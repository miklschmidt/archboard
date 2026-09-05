---
id: TASK-150.01.02.03
title: Repair strict system-test and script contracts
status: To Do
assignee: []
created_date: '2026-09-05 04:35'
updated_date: '2026-09-05 13:58'
labels: []
dependencies: []
references:
  - TASK-150
  - docs/agents/test-suite.md
  - docs/agents/strict-analysis.md
parent_task_id: TASK-150.01.02
priority: high
type: task
ordinal: 302000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deferred to TASK-151. Preserve all committed and uncommitted corrections in this historical repair scope. Remaining non-UI strict-rule adoption is outside TASK-150 and does not block the UI rebuild.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Existing corrections remain intact.
- [ ] #2 Remaining non-UI adoption is owned by TASK-151; this historical leaf does not block TASK-150 UI construction.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Do not resume this repair leaf during TASK-150. TASK-151 owns any later non-UI adoption after its scope is agreed. Preserve current changes and user-deleted tests. Historical evidence remains for context only.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Checkpoint 2026-09-05 at HEAD f9abd7cb95a228887d729c4258b8cdd3dedae019: fresh serialized root compiler reduced owned diagnostics to one ApplyReceiptView/Zod exact-optional mismatch; repaired it as document?: ElementIdView[] | undefined without a cast or runtime schema change and requested primary revalidation. Earlier 13 owned compiler failures were repaired by omitting absent RequestInit/pane/process options and accurately typing parsed fixture/result shapes.

Scoped type-aware lint inventory covers 191 exact owned files and currently reports 6,849 diagnostics, down from 6,936. Sixteen files pass complete scoped lint individually; run-browser-lane has its 502-to-499 physical-line repair and max-lines now passes while its remaining lint debt is pending. Focused non-browser validation passes: package-limits/spoken-approval/variant-eval 4 cases, install-targets 8 cases, lock-source-policy 1 case, scratch-board 4 cases; sync-skills direct execution passes. server-rendering-failure is lint-clean but its focused owner stops at the missing derived dist/frontend prerequisite before reaching the intended missing-Chromium assertion; no assertion was changed. No browser execution occurred. No suppressions, config/package/generator/probe/policy changes, staging or commits. Remaining applicable lint is substantial and task stays In Progress.

Continuation checkpoint after HEAD cf58ce07020a4d76e0deaaf2206ba7d7b786c698: primary committed six exact frozen manifests. New committed lint-clean scope includes 25 files total across commits 2c1e8989, c594b0be, f7edede4, 5adb288e, 563a62d0 and cf58ce07. Additional focused non-browser evidence: launcher lifecycle 28 pass; package read-only 10 pass; package text/exits plus install source policy 7 pass; local-bind/resource-cleanup 11 pass; canvas startup signal 2 pass; TERM escalation 1 pass; forced cleanup 3 pass.

Latest exact owned lint inventory at the current shared tree: 6,743 diagnostics across 191 files, down from 6,936 at leaf start. Browser fixtures/support received only behavior-preserving export/type/await-result repairs and no browser execution. The server-rendering failure owner remains phase-deferred to TASK-150.06 because retired dist/frontend prevents reaching its intended missing-Chromium assertion. Crash-replacement focused execution also failed before the changed census boundary because its Codex fixture does not answer the newer bounded --version proof; this is not passing evidence and no assertion was changed. Initial exact-optional compiler repair paths remain uncommitted while their full lint work continues. Task stays In Progress.

Compiler correction checkpoint: the first structural health-responder callback attempt remained incompatible with createServer overloads. Replaced it with Node's authoritative RequestListener and one statement-level prefer-readonly-parameter-types suppression documenting the required mutable IncomingMessage/ServerResponse signature. Serialized compiler confirmation /tmp/task-150-root-cross-worker-4.log is clean; primary committed health responder plus conversion owner at 06ba49e4. This exact demonstrated false-positive exception requires final-review assessment. Opener settings probe committed at 57b70511. Coordinator settings layout support is lint-clean and frozen as the ninth exact manifest; no selectors, assertions, action ordering or screenshot paths changed and no browser execution occurred.

Approved local exception 2026-09-05: tests/system/process-contracts/fixtures/health-responder.ts, statement assigning respondToHealth as Node RequestListener, rule typescript/prefer-readonly-parameter-types only. Owning contract: the HTTP fixture must use Node's authoritative listener and mutate ServerResponse to write status/headers/body. Rejected alternative: handwritten readonly HealthRequest/HealthResponse lookalike; serialized root compiler logs /tmp/task-150-root-cross-worker-2.log and -3.log prove createServer TS2769 overload failure. Accepted implementation is compiler-clean in /tmp/task-150-root-cross-worker-4.log and local-bind passes 3 focused cases including foreign health, late held-board stop refusal and fresh startup. Coordinator approved this exact required-mutable-response false positive only; it is not precedent for other mutable parameters or suppressions.

Crash-replacement fixture repair: replacementCensusSource copied fake-codex-production.ts into a separate temporary directory, after which prepareProductionFixture resolved its top-level fake-codex-production-data.ts import relative to that temporary source. The missing module aborted startup before the fixture's existing --version branch. The owned test now replaces that import with the canonical original fixture-data path before copying. Production version verification is unchanged. The complete owner passes scoped type-aware lint and its focused non-browser process test passes 1 case/10 assertions, proving crash revocation, exact prior-group cleanup, two-spawn census and replacement readiness. Submitted as the tenth frozen manifest; no browser execution.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-09-05 04:37
---
Worker started from released ownership baseline f9cee0b09d6630693412abb31d9763e8e4ae9a86; current shared-checkout HEAD eaad7c73413dc948e4239421269e381e186d2651. Scope and validation constraints accepted; no commit, browser execution, config/package/generator/probe/policy changes.
---

author: @codex
created: 2026-09-05 04:44
---
Coherent checkpoint sent to coordinator and primary commit owner with exact paths and evidence. Formal Done is not claimed: applicable owned lint remains, and the corrected final compiler diagnostic awaits the primary serial refresh.
---

author: @codex
created: 2026-09-05 04:51
---
Six serialized exact path manifests were verified, frozen, and committed by the primary lane; no worker staging or commit. Continuing remaining applicable lint without exclusions or broad unsafe fixer.
---

author: @codex
created: 2026-09-05 04:55
---
Latest exact manifests continue through primary-only commits. Leaf remains In Progress; applicable lint repair continues and no acceptance boxes are checked.
---

author: @codex
created: 2026-09-05 04:56
---
Coordinator approved the exact respondToHealth RequestListener exception after evidence review; future required-semantic exceptions still require individual coordinator decision before freeze/commit.
---

author: @codex
created: 2026-09-05 04:58
---
Concrete fake Codex --version fixture contract bug is repaired and passing without weakening production verification.
---

author: codex
created: 2026-09-05 05:06
---
Repair checkpoint: primary committed import process-contract manifest ec4d4a17 and browser voice/fixed-point fixture manifest 1e8f0afc. New frozen CLI refusal manifest: tests/system/cli/package-io-refusals.test.ts plus tests/system/cli/support/package-result.ts. Scoped type-aware oxlint passes; focused public CLI suite passes 7 tests / 58 assertions. Change moves result decoding and its two local schemas behind one support boundary, reducing test dependencies to policy limit while preserving behavior. No suppressions. Browser lane not executed.
---
<!-- COMMENTS:END -->
