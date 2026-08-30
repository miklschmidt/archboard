---
id: TASK-143.03
title: 'Build the text, tools, queue, and approvals workbench UI'
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 14:45'
labels: []
dependencies:
  - TASK-140.03
  - TASK-143.01
  - TASK-143.05
  - TASK-143.07
  - TASK-144
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/tailwind-base-ui-adoption-research.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build the agent workbench shown in the approved operator reference on top of the typed app-server session. @assistant-ui/react ExternalStoreRuntime supplies headless conversation, thread, tool, composer, and stopped-run composition. The independently delivered Tailwind 4 and reviewed shadcn/Base UI source foundation from TASK-144 supplies styling and interaction primitives after the TASK-140 shell lands. Archboard owns protocol reduction, thread links, workhorse and coordinator state, queue behavior, approvals, browser lease, and visual language. Diff review and per-hunk patch actions remain deferred.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The exact @assistant-ui/react version is pinned in package.json and bun.lock. Archboard integrates it only through ExternalStoreRuntime and an app-owned adapter that maps the closed Codex browser model into thread, message, content-part, tool, composer, cancellation, and stopped-run state; app-server JSON-RPC remains the sole transport and source of lifecycle truth.
- [ ] #2 The focused pane can start a workhorse thread for the current checkout or create a thread link to a current-epoch thread that the dedicated child proves loaded and controllable. The picker exposes dedicated-home sign-in state, keeps fresh and same-child-reconnected Archboard threads visible, and shows loaded systemError, direct-input false or null, rejoin refusal, persisted notLoaded, ownership unknown, prior-epoch inspect-only, and child-exit invalidation as disabled rows with exact reasons and no input path.
- [ ] #3 The expanded bottom workbench has an explicit layout contract: a compact status and thread-link header, workhorse-first activity timeline, optional coordinator disclosure, queue and approval region, and composer and turn controls. Its collapsed summary keeps connection, workhorse running or idle state, pending approval or queue count, voice state, and Take back control visible without covering the canvas.
- [ ] #4 The linked coordinator disclosure shows its separate thread identity and timeline, configured and effective model, reasoning effort, requested and effective service tier, intervention policy, active voice state, pending callback, and navigation back to the workhorse. Global settings expose gpt-5.6-luna and medium defaults plus Explicit corrections, Coordinator judgment, and Never steer, validate against model/list, and affect only later coordinator decisions.
- [ ] #5 Composer submit starts an idle workhorse turn, an explicit steer action adds input to an active turn when the server permits it, and Stop interrupts the named active turn. Disabled, submitting, queued, steering, awaiting-response, interrupted, completed, and failed states are visibly distinct, preserve draft text where recovery is possible, and never infer a target from recent activity.
- [ ] #6 The timeline has named renderers for user and assistant text, reasoning summary, command execution and output, ordinary and dynamic tool calls, file-change status, web and MCP activity, queue changes, callbacks, completion, interruption, failure, and unknown items. Every renderer preserves canonical ordering, stable identity, inspectable raw detail where useful, and a truthful terminal state.
- [ ] #7 Queue UI exhausts every thread/queue/list page before acting, shows server order, and supports the exact add, edit, cancel, reorder, and thread/queue/start actions permitted by the generated contract. Reorder submits every queued submission ID, preserves non-coordinator and otherwise unowned entries and their relative order, and mutates only coordinator-owned entries. Running, queued, interrupted with preserved queue, blocked by approval, failed, explicitly restarted, completed, and callback-delivered entries cross-link to the originating coordinator request and resulting workhorse turn without duplicating either timeline.
- [ ] #8 Only the browser lease owner renders command and file approvals, tool user input, MCP elicitation, permissions, and legacy approval cards. Each card is bound to child instance, requesting thread, turn and request ID, target identity and current state token, and a canonical effect hash; it shows every generated reason, command, cwd, parsed action, network target, permission, amendment, and offered decision. Present decision arrays are authoritative and omitted or null fields use only the generated legacy fallback. Immediately before dispatch Archboard re-reads and revalidates the target and effect; change, owner loss, server resolution, fabricated choice, or stale identity invalidates the card and requires a fresh request. A valid card responds exactly once.
- [ ] #9 General dynamic-tool approval, bound coordinator operation, app-server approval, and spoken eligibility are separate visual types with separate policy text. Spoken eligibility shows the immutable approval ID and exact stored description, names the normal coordinator thread model as the classifier and model judgment as a security boundary, exposes the accepted uncorrelated-speech race, and offers only one-time accept or decline. A request blocking the coordinator, a second pending request, session grants, and policy amendments are visual-only; every presenting, awaiting-user, resolving, terminal, expired, and invalidated state is visible.
- [ ] #10 Existing board claim reason, doing history, semantic-context delivery state, and Take back control remain available and visually distinct from workhorse turn, coordinator, queue, approval, and voice state so board ownership is never confused with thread execution.
- [ ] #11 The composition follows the approved operator mockup rather than assistant-ui or shadcn defaults: canvas-first proportions, dense Swiss grid, flat one-pixel rules, small radii, semantic cobalt and acid-lime accents, neutral and monospace type roles, restrained motion, and no generic chat bubbles, rounded dashboard cards, gradients, glow, or decorative shadows.
- [ ] #12 Keyboard-only thread selection, coordinator disclosure, settings, composer, queue actions, approvals, stop, collapse, and focus return work with visible focus. Timelines are named focusable logs, streaming and callbacks are batched rather than announced token by token, status is never color-only, and reduced-motion and screen-reader text remain equivalent.
- [ ] #13 Rendered browser coverage proves empty, fresh, same-child reconnect, dedicated-home sign-in and every unavailable or prior-epoch thread state, running and idle workhorse, linked and invalidated coordinator, each intervention and service-tier state, every queue transition, every approval family, coordinator-free spoken resolution, coordinator-blocked visual fallback, the single-pending limit, and every spoken expiry, owner loss, failure, stop, disconnect, one and two panes, desktop, 420 pixels, light, dark, collapsed, and fullscreen through the real application.
- [ ] #14 Production module-graph inspection permits @assistant-ui/react ExternalStoreRuntime and the exact copied source set while excluding AssistantTransport, assistant-cloud usage, assistant-ui syntax highlighting, assistant-ui voice runtime or elements, assistant-ui diff review, AI SDK transports, and generic chat runtimes. The stable inspection, strict types, lint, formatting, accessibility checks, and rendered browser suite run in bun run check.
- [ ] #15 Replacing or closing a thread link is refused while its workhorse has an active turn, pending reverse request, queued coordinator delegation, pending dynamic-tool or spoken approval, active coordinator turn, unsettled dynamic call, buffered callback, voice session, or transcript-tail flush. The workbench names the exact action or terminal event required before rebind and never hides remaining coordinator work merely because voice stopped.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin and smoke-test @assistant-ui/react, then create a named workbench UI module whose public adapter accepts only the closed browser session model from TASK-143.01.
2. Implement the ExternalStoreRuntime mapping for workhorse and coordinator thread metadata, ordered messages and content parts, streamed updates, tools, cancellation, stopped runs, and capability flags. Do not introduce AssistantTransport or another backend protocol.
3. Build the workbench frame from the approved operator-shell composition: compact collapsed summary, expanded status and thread-link header, workhorse timeline, optional coordinator disclosure, queue and approval region, and composer controls.
4. Build the explicit thread picker and thread-link flow for start, attach, disabled ownership states, same-child reconnect, guarded replacement, and child-exit invalidation.
5. Add workhorse and coordinator timeline renderers for every canonical item and terminal state, including an inspectable unknown-item fallback.
6. Add composer submit, explicit steer, stop, draft preservation, pending-state locking, and focus return against the command adapter.
7. Add queue inspection and exact mutation controls with coordinator-request and workhorse-turn cross-links.
8. Add exhaustive app-server and dynamic-tool approval cards behind the browser lease, including generated decision handling, stale response refusal, and spoken-eligibility presentation.
9. Add global coordinator model, effort, service-tier, and intervention settings plus linked coordinator disclosure without moving primary work into the coordinator view.
10. Integrate claim, doing, semantic-context status, and Take back control as separate board-ownership information from the implemented TASK-140 workbench shell.
11. Apply the TASK-144 Tailwind and shadcn/Base UI foundation and reference tokens. Adapt only reviewed interaction-heavy source and remove default chat/dashboard styling.
12. Verify the full reachable-state matrix in the real browser at desktop and 420 pixels, both themes, one and two panes, collapsed and fullscreen; then enforce accessibility and production module-graph boundaries in bun run check.
<!-- SECTION:PLAN:END -->
