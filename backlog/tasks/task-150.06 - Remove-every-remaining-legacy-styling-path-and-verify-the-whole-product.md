---
id: TASK-150.06
title: Complete workflow verification and final legacy cleanup
status: To Do
assignee:
  - '@codex'
created_date: '2026-09-05 00:09'
updated_date: '2026-09-05 01:41'
labels: []
dependencies:
  - TASK-150.07
references:
  - TASK-150
parent_task_id: TASK-150
priority: high
type: task
ordinal: 296000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After component migration, any surviving legacy stylesheet, selector or compatibility path would leave maintainers and agents with two systems and make the replacement incomplete. Remove the old application styling system and prove the complete product through one serial validation owner. All grunt cleanup and verification must run in visible gpt-6-astra tasks with low reasoning. Do not start an independent reviewer loop until every TASK-150 implementation child reports complete; only then may the parent start the single end-to-end Astra review.

The application shell is desktop-only, with 1920×1080 as its explicit design and rendered-acceptance target. Mobile/phone layouts, mobile navigation, mobile breakpoints and mobile test gates are out of scope. Do not introduce them during this rework.

Verify the legacy/ archive never entered an implementation commit or active import/build graph. Once reference use is complete, remove the unchanged reproducible local archive and its temporary lint/TypeScript exclusions. Keep the ignore rule and enforcement against tracked or staged archive contents. Full bun run check must now pass, including all previously pending rendered workflows.

Browser tests run only in TASK-150.06, complete workflow verification, after TASK-150.01 through TASK-150.05, TASK-150.07 and their execution leaves report the rebuild and integration ready. Do not run browser suites, selected browser owners, browser smoke tests or aggregate commands that invoke them during quarantine, code repair, foundation or UI implementation. Strict lint/type checks, builds where applicable and focused non-browser logic tests continue throughout. Visual inspection for design does not authorize early browser workflow tests. Earlier task completion means implemented and ready for complete workflow verification, not browser-verified.

Existing browser tests are evidence about possible product contracts, not authority for the new UI's markup, selectors, layout, timing or component structure. The orchestrating Astra agent must decide and approve each proposed browser-test replacement, behavioral/interaction rewrite, deletion or transfer to a cheaper test owner before a worker makes that change. For each affected test, record the protected workflow/regression, the obsolete or harmful assumption, the proposed replacement and why its observable assertions still protect the required behavior and accessibility. A failing test alone is not grounds to change either the UI or the test: determine which violates the agreed contract. Reject production changes introduced solely to satisfy old selectors, DOM structure, test hooks, arbitrary waits or harness shortcuts. Workers may investigate and propose changes, but may not self-approve replacements, skip failing tests, reduce coverage or rubber-stamp the existing test suite. Preserve real behavior and recovery obligations. Record the orchestrator's decision with the affected test in Backlog notes; no new approval framework or user approval is required. These case-by-case decisions are orchestration, not an independent review loop; independent review still waits until all implementation work and complete workflow verification report complete. Browser harness replacement/concurrency redesign remains deferred.

In TASK-150.06, verify that model playback drives the wave and microphone-only input does not. Cover silence, interruption/stop, disconnect, playback suspension/recovery and reduced motion; verify the wave alongside canvas interaction and visible voice controls in light/dark desktop layouts. Use the existing media boundary for the cheapest signal-routing regression and final rendered verification for visible behavior. Any affected old microphone-meter browser test must receive the orchestrating Astra agent's case-by-case replacement decision. No browser execution moves earlier.

User-approved archive dependency policy: tests and diagnostic probes that depend exclusively on retired UI may join its ignored, uncommitted local legacy/ snapshot. Inventory their imports and record each protected product behavior, whether the old assertion is obsolete or still required, and the task responsible for restoring required coverage. This includes UI-dependent files outside src/ui; directory location does not decide whether code is retired. Independently useful tests, scripts and active product code stay under full strict checks. Do not archive mixed-use code or difficult active code merely to pass checks; resolve its retained contract explicitly. Remove archived owners from active compiler/test inventories coherently and keep an explicit record of deferred coverage. This temporary retirement does not count as passing product verification and does not authorize skipped tests or weakened final gates. Restore required behavior coverage against the rebuilt implementation in TASK-150.07 or TASK-150.06 as appropriate. Any affected browser-test retirement/replacement remains subject to the orchestrating Astra agent's recorded case-by-case approval. Every deferred behavior must be accounted for before final acceptance; obsolete implementation-only assertions may be retired with a recorded reason.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/ui/shell/shell.css and its import are deleted, and no renamed or parallel application stylesheet retains old selectors, token bridges, theme aliases, compatibility wrappers, duplicate controls or icons, or legacy-only class-merge behavior. No legacy/ content is present in any implementation commit; the local archive and temporary analysis exemptions are removed after use.
- [ ] #2 Board preview geometry, connected-path overlays, product state projections, canvas mounting and fullscreen coordination remain as explicit product code composed with Tailwind and shared controls; any vendor-selector adapter contains only proven Excalidraw sizing or fullscreen rules.
- [ ] #3 Cheap enforcement rejects shell.css, legacy app CSS imports, old selector families and duplicate application icon sources by inspecting source, compiled CSS and actual consumers rather than filenames alone.
- [ ] #4 After TASK-150.01 through TASK-150.05, TASK-150.07 and their execution leaves report the rebuild and integration ready, formatting, strict lint/types, affected contracts and complete bun run check pass. Browser tests run in this complete workflow verification phase only, through the existing serial lane. Diagnose and fix real product defects; do not use skips or new hosted exceptions to pass.
- [ ] #5 Rendered evidence covers light and dark, one and two panes, fullscreen, plus reachable loading, success, empty, partial, failure and recovery states without an artificial state matrix.
- [ ] #6 Keyboard use, names, roles, announcements, focus, contrast, Escape, portal stacking, reduced motion, forced colors and accessible control targets are verified honestly, and drawing, text editing, pan, zoom, selection, library, metadata, binding and note persistence remain intact.
- [ ] #7 Every TASK-150 implementation child reports complete with evidence and reproducible screenshots or build output remain ignored, leaving the parent ready to fix BASE..TARGET for its one independent Astra medium review.
- [ ] #8 Before any browser-test replacement, behavioral/interaction rewrite, deletion or transfer to another test owner, the orchestrating Astra agent explicitly approves that individual proposal. Backlog notes identify the protected product behavior, bad or obsolete test assumption, replacement assertions and rationale. Workers do not self-approve and the UI is not distorted to satisfy legacy selectors, markup, timing or harness practices.
- [ ] #9 Final verification proves model audio drives the wave while microphone-only input does not, and verifies lifecycle clearing, playback recovery, reduced motion and usable controls. Any replacement of old microphone-meter browser assertions is approved case by case by the orchestrating agent.
- [ ] #10 Every behavior deferred with archived UI-dependent tests/probes is reconciled: required coverage runs against the rebuilt implementation, and obsolete implementation-only assertions have a recorded retirement reason. No unresolved deferred coverage or temporary inventory omission survives final acceptance.
<!-- AC:END -->
