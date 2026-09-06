---
id: TASK-150.05
title: Build the fresh text and voice workbench
status: Done
assignee:
  - '@claude'
created_date: '2026-09-05 00:08'
updated_date: '2026-09-05 15:26'
labels: []
dependencies:
  - TASK-150.03
references:
  - TASK-150
parent_task_id: TASK-150
priority: high
type: task
ordinal: 295000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The text and voice workbench repeats controls and styling while its product-specific timeline and authority contracts must remain intact. Recompose its visible controls with the shared shadcn system without adding a second runtime or synthetic chat state.  Do not start an independent reviewer loop until every TASK-150 implementation child reports complete.

Runs after TASK-150.03. Build presentation and typed inputs/action callbacks from actual product contracts. Archived runtime implementations are copied, repaired and connected only in TASK-150.07 after this task. Do not copy old WorkbenchFrame, composer or control JSX, CSS tokens or layout-specific state. Legacy reference files remain untracked and cannot be imported.

Browser-test execution is deferred to TASK-150.06 after all rebuild tasks report ready. Do not run browser suites, individual browser tests, browser smoke tests or aggregate commands that invoke them in this task. Continue strict lint/type checks and appropriate non-browser checks. Existing browser tests must not dictate the new UI. Any proposed browser-test replacement, behavioral/interaction rewrite, deletion or transfer to another test owner requires prior case-by-case approval by the implementation coordinator, with the protected product contract and replacement evidence recorded. This is not a worker self-approval or an interim independent review.

Retain assistant-ui as the explicit foundation for the new workbench. Use fresh official assistant-ui chat component source and primitives, its Base UI registry flavor, the approved shadcn theme and shared controls, rather than porting Archboard's old workbench JSX or rebuilding available chat components. Configure the style-aware @assistant-ui registry https://r.assistant-ui.com/styles/{style}/{name}.json with base-nova; verify source compatibility with the pinned @assistant-ui/react version and keep reproducible source provenance. Use shared shadcn dependencies and Remix icons without installing a parallel application control/theme system. Install only chat components needed by actual workflows.

assistant-ui's runtime provider/view adapter is compatible with the single-runtime requirement: Archboard's private Codex app-server session and product store remain authoritative. Do not introduce Assistant Cloud, an AI SDK backend, another transport, persistence owner or queue merely because a quick-start installs them. Preserve send/steer while running, explicit queue choices, approvals, transcript identity, read-only/recovery states and separate voice coordinator behavior. Reassess the current headless-only/import allowlist and custom composer restrictions against real product contracts and supported upstream components; replace obsolete implementation restrictions with scoped ownership/behavior checks, preserving safety rules. The orchestrating agent decides necessary product-specific adaptations case by case. Existing workarounds are evidence to investigate, not automatically required new code.
This stage builds fresh assistant-ui presentation and the necessary typed integration interface. Do not port archived runtime adapters early; that remains TASK-150.07. Browser tests still wait for TASK-150.06.

Adopt the official LiveKit Agents UI AgentAudioVisualizerWave renderer for the model's voice/audio output only. The user's microphone must not drive the wave. Keep assistant-ui for chat and Archboard's existing Codex voice session and playback authoritative. Reuse pinned upstream renderer/shader source with provenance and license; configure it within the approved theme, using the lime status accent. Adapt only the necessary state/audio-input boundary, with full applicable safety checks. Do not introduce a LiveKit room, server, token endpoint or second voice session. The upstream hook imports LiveKit audio utilities even when volume is supplied, so inspect the actual dependency graph and use a narrowly documented adaptation where needed. This is the explicit custom integration allowance, not permission to rebuild the visualizer or exempt its source broadly from lint.

Build the wave presentation in TASK-150.05 with typed model-output level and lifecycle inputs; connect actual audio only in TASK-150.07. Distinguish status animation from audio-driven speech: listening/thinking must not suggest that model audio is playing. Keep readable status and static reduced-motion/renderer-unavailable presentation. Stop the animation when its view/session is inactive, and preserve mute/stop actions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Chat thread, message/content and composer presentation uses fresh official assistant-ui components and supported primitives where product contracts require composition. Supporting queue, approval, account and voice controls use the shared shadcn Base UI family, coherent theme and Remix icons; no old workbench presentation is ported.
- [x] #2 Message, approval, queue, captured-context, transcript and lifecycle presentation uses interfaces grounded in actual product contracts. No archived product implementation is ported here, and no second runtime or synthetic product state is introduced.
- [x] #3 The presentation represents the one private app-server session, explicit thread link, separate workhorse/coordinator, authority and recovery, with mute/stop controls available in collapsed and fullscreen compositions. Real runtime connection and lifecycle wiring belong to TASK-150.07.
- [x] #4 Composer, queue, approvals, disconnect/recovery, context/transcript, mute and fullscreen-stop presentation passes strict and appropriate non-browser checks. The presentation is ready for TASK-150.07 porting/integration, without claiming end-to-end operation. Browser execution waits for TASK-150.06 after integration is reported ready.
- [x] #5 Fresh workbench, transcript, queue, approval and voice presentation has no old stylesheet families, copied presentation wrappers, duplicate controls or feature-flagged legacy view.
- [x] #6 Known steer/queue and voice ownership constraints are represented in the integration contract. Any departure from suitable official assistant-ui component behavior is justified by an actual product requirement and decided by the orchestrating agent, not inherited automatically from old headless-only rules or workarounds.
- [x] #7 Voice presentation uses the official LiveKit wave renderer with typed model-output inputs, approved theme and accessible static/status presentation. It does not use microphone amplitude or introduce a LiveKit session; the narrow integration adaptation is documented and actual media wiring waits for TASK-150.07.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Worker (2026-09-05): src/ui/workbench-thread holds official assistant-ui base-nova thread source (Remix icons, cn package, root-file layout, provenance README; attachments/suggestions removed as non-product); src/ui/workbench composes the product workbench over the shared codex-browser-model types (readiness/recovery, explicit thread link, separate coordinator, official Composer with Archboard send/steer/queue/stop intent controls, queue, approvals incl. dynamic and spoken, captured context with exact-bytes copy action, transcript, header controls reachable collapsed/fullscreen); src/ui/voice-wave adopts the LiveKit Agents UI wave renderer + shader (Apache-2.0, provenance) with a narrow model-output-level adapter hook, no livekit/motion deps, no microphone path; src/ui/voice-controls provides accessible start/mute/unmute/stop/restart. Coordinator decision: assistant-ui lint ownership is now by module (workbench-thread, workbench-runtime) with the transport/cloud/thread-list/queue/tool/voice prohibitions retained; @assistant-ui/react-markdown allowed from workbench-thread only.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Checkpoint 1e60b178: workbench-thread (official assistant-ui base-nova files, README provenance, override entries), workbench (typed WorkbenchView/WorkbenchActions over BrowserSnapshot; projections tested), voice-wave (LiveKit wave renderer + shader, Apache-2.0 LICENSE-NOTICE, model-output-level adapter, reduced-motion/WebGL fallbacks), voice-controls. Scoped UI lint exit 0; 27 focused tests pass confined. Coordinator decisions: @assistant-ui/react-markdown 0.14.14 + remark-gfm added for the official text renderer; one-line bun patch on @radix-ui/react-select 2.3.7 (onPlaced exact-optional spelling) instead of relaxing skipLibCheck; three documented statement-level suppressions in official files (no-autofocus on the edit composer; two exhaustive-deps mount-once effects in the shader host). The CLI's apply would have overwritten shared components, so registry payloads were placed by URL with digests recorded. tw-shimmer and the markdown dot.css are not loaded (documented).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Official assistant-ui base-nova thread/composer source in workbench-thread, product workbench composition over the shared browser model (session, thread link, coordinator, send/steer/queue-instead/stop intent, queue, approvals incl. dynamic/spoken, captured context, transcript, collapsed/fullscreen header controls), LiveKit wave renderer with a model-output-only adapter, and accessible voice controls (commit 1e60b178). assistant-ui lint ownership replaced per-member allowlists with module ownership plus retained safety prohibitions. Verified by scoped strict lint and 27 pure-helper tests; runtime wiring in TASK-150.07, rendered proof in TASK-150.06.
<!-- SECTION:FINAL_SUMMARY:END -->
