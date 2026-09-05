---
id: TASK-150.07
title: Port UI product logic and integrate the rebuilt presentation
status: To Do
assignee: []
created_date: '2026-09-05 01:21'
updated_date: '2026-09-05 13:58'
labels: []
dependencies:
  - TASK-150.05
parent_task_id: TASK-150
priority: high
type: task
ordinal: 299000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Porting archived UI logic before the new presentation exists risks retaining the old UI's state shape and conventions. After TASK-150.05 completes the presentation, copy required product logic from the ignored local legacy/ reference into named src/ui modules, repair it and connect the new UI to real behavior.  The archive is never imported or committed. Browser tests wait for TASK-150.06 after this task reports integration ready; no independent review starts before complete workflow verification is finished.

assistant-ui's runtime provider/view adapter is compatible with the single-runtime requirement: Archboard's private Codex app-server session and product store remain authoritative. Do not introduce Assistant Cloud, an AI SDK backend, another transport, persistence owner or queue merely because a quick-start installs them. Preserve send/steer while running, explicit queue choices, approvals, transcript identity, read-only/recovery states and separate voice coordinator behavior. Reassess the current headless-only/import allowlist and custom composer restrictions against real product contracts and supported upstream components; replace obsolete implementation restrictions with scoped ownership/behavior checks, preserving safety rules. The orchestrating agent decides necessary product-specific adaptations case by case. Existing workarounds are evidence to investigate, not automatically required new code.
Copy and repair only the needed assistant-ui external-store runtime adapter and Archboard product logic here, after the fresh workbench is in place. Connect official workbench components without porting old JSX or adopting a new backend.

Adopt the official LiveKit Agents UI AgentAudioVisualizerWave renderer for the model's voice/audio output only. The user's microphone must not drive the wave. Keep assistant-ui for chat and Archboard's existing Codex voice session and playback authoritative. Reuse pinned upstream renderer/shader source with provenance and license; configure it within the approved theme, using the lime status accent. Adapt only the necessary state/audio-input boundary, with full applicable safety checks. Do not introduce a LiveKit room, server, token endpoint or second voice session. The upstream hook imports LiveKit audio utilities even when volume is supplied, so inspect the actual dependency graph and use a narrowly documented adaptation where needed. This is the explicit custom integration allowance, not permission to rebuild the visualizer or exempt its source broadly from lint.

Current source evidence: src/ui/codex-realtime/lib/media-session.ts setupMeter analyses run.localStream, while model audio arrives through run.remoteStream and plays through run.remoteElement. Therefore the existing microphone level cannot be relabelled or reused as model-output level. In TASK-150.07, measure the existing model playback stream and expose an explicitly named output-level subscription with correct cleanup and playback/lifecycle gating. Avoid duplicate playback, duplicate capture or a second audio transport. Silence, interruption, stop, disconnect and suspended/failed playback must not leave the model wave showing speech. Microphone mute is distinct from model playback and must not incorrectly suppress model-output visualization.

User-approved archive dependency policy: tests and diagnostic probes that depend exclusively on retired UI may join its ignored, uncommitted local legacy/ snapshot. Inventory their imports and record each protected product behavior, whether the old assertion is obsolete or still required, and the task responsible for restoring required coverage. This includes UI-dependent files outside src/ui; directory location does not decide whether code is retired. Independently useful tests, scripts and active product code stay under full strict checks. Do not archive mixed-use code or difficult active code merely to pass checks; resolve its retained contract explicitly. Remove archived owners from active compiler/test inventories coherently and keep an explicit record of deferred coverage. This temporary retirement does not count as passing product verification and does not authorize skipped tests or weakened final gates. Restore required behavior coverage against the rebuilt implementation in TASK-150.07 or TASK-150.06 as appropriate. Any affected browser-test retirement/replacement remains subject to the implementation coordinator's recorded case-by-case approval. Every deferred behavior must be accounted for before final acceptance; obsolete implementation-only assertions may be retired with a recorded reason.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TASK-150.05 is complete before archived UI product-logic porting starts. Required behavior is copied into src/ui, repaired and integrated with the fresh shell, dialogs and workbench; old JSX, selectors, theme bridges and layout-specific state are not copied back.
- [ ] #2 Board/session synchronization, persistence, independent panes, navigation actions, validation, recovery, selection/binding, previews, queue, approvals, private app-server communication and voice/fullscreen lifecycle are connected to real state and actions as applicable. No temporary presentation fixtures, no-op actions or synthetic runtime remain in the completed product.
- [ ] #3 Every copied or changed module passes the existing full applicable strict lint and compiler gates immediately, with meaningful non-browser logic checks. No active-code exemption follows a copied file out of legacy/; no browser test or aggregate command invoking browser tests runs here.
- [ ] #4 The new UI interfaces are checked against actual product contracts. The implementation coordinator resolves required behavior or interface changes case by case, preserving the approved visual direction and accessibility instead of restoring old presentation or inventing a second runtime.
- [ ] #5 Any proposed browser-test replacement, behavioral rewrite, deletion or transfer to another owner has prior case-by-case approval from the orchestrating agent. Browser verification remains pending for TASK-150.06 and is not claimed complete by this task.
- [ ] #6 All required product workflows are implemented and ready for complete workflow verification. The local archive remains ignored and absent from staged/tracked trees and every implementation commit; other checkouts can recover reference source from recorded BASE.
- [ ] #7 The fresh assistant-ui workbench is connected to the existing Codex-owned runtime through a repaired supported adapter. Steering during a run, queue semantics, approvals, read-only/recovery behavior and voice separation remain correct; no duplicate transport, backend, persistence or queue owner is introduced.
- [ ] #8 The wave receives measured model playback level through an explicit output-level contract, never microphone level. Playback failure, suspension, interruption, silence and end-of-session clear or settle its output indication, with cleanup and no duplicate playback/transport. Signal routing passes focused non-browser checks.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
6. Port UI product logic and integrate the rebuilt presentation. TASK-150.07.
Depends on TASK-150.05.
Only now copy required product logic from local legacy/ into named src/ui modules. Fix it there under the already-enforced full applicable lint/type policy. Preserve board/session synchronization, persistence, independent panes, navigation, selection/binding, previews, recovery, queue, approvals, private app-server communication and voice/fullscreen lifecycle as required. Retain useful logic tests and existing authoritative server/shared contracts. No import may point into legacy/, and its contents never enter a commit.
Connect the new presentation to real data and actions. For the workbench, copy and repair the necessary assistant-ui external-store integration after TASK-150.05, using the existing Codex-owned state and transport. Revalidate current custom composer and headless-only restrictions rather than assuming they remain necessary. Remove temporary presentation examples and no-op callbacks from the runtime. Do not copy old JSX, selectors, styling tokens, visual wrappers or layout-specific state. Do not add a second agent runtime or synthetic product state.
Reading actual contracts during design reduces late integration surprises, but implementation integration may expose missing states or mismatched view interfaces. The implementation coordinator decides required corrections case by case, preserving real product capabilities, accessibility and the approved reference rather than restoring the old layout.
Every copied file immediately receives full applicable strict lint/type checks, with only the previously agreed general exceptions. Use focused non-browser checks for product logic. Do not run browser tests yet, and do not rewrite them without the orchestrator's case-by-case approval.
Exit: all required product workflows are implemented and the integrated rebuild is reported ready; strict lint/type and applicable non-browser checks pass. Browser and complete product verification remain pending for TASK-150.06.

Current execution constraints: preserve all completed corrections and the user's test deletions. Do not restore deleted tests or add repository-policy suites, configuration snapshots, dependency/version mirrors, tests of upstream tooling, or tests of test helpers. Use the existing lint/compiler commands and meaningful existing product checks. New strict lint adoption is limited to src/ui; remaining non-UI adoption is TASK-151. UI uses the existing root TypeScript project; do not create src/ui/tsconfig.json. Run analysis sequentially and keep the repository project guard on all lint/fix paths. No callbacks to previous tasks, fixed agent assignments, or extra interim review loops.
<!-- SECTION:PLAN:END -->
