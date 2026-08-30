---
id: TASK-140
title: Adopt the operator canvas shell reference
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 02:29'
updated_date: '2026-08-30 14:28'
labels: []
dependencies: []
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - AGENTS.md
  - DESIGN.md
  - bun.lock
  - docs/agents/test-suite.md
  - docs/design/assets/operator-canvas-shell.png
  - docs/design/operator-canvas-shell.md
  - package.json
  - scripts/generate-wordmark.ts
  - src/server/canvas/lib/application.ts
  - src/ui/board-preview/index.ts
  - src/ui/board-preview/tests/board-preview.test.ts
  - src/ui/canvas/CanvasPane.tsx
  - src/ui/canvas/api.ts
  - src/ui/code-target/index.ts
  - src/ui/code-target/tests/link-handler.test.ts
  - src/ui/opener-settings/opener-settings.css
  - src/ui/path-focus/index.ts
  - src/ui/path-focus/tests/projection.test.ts
  - src/ui/selection-inspector/SelectionInspector.tsx
  - src/ui/selection-inspector/index.ts
  - src/ui/selection-inspector/tests/projection.test.ts
  - src/ui/shell/AgentRail.tsx
  - src/ui/shell/AgentWorkbench.tsx
  - src/ui/shell/BoardBar.tsx
  - src/ui/shell/BoardNavigator.tsx
  - src/ui/shell/BoardPreviewCard.tsx
  - src/ui/shell/Icons.tsx
  - src/ui/shell/Shell.tsx
  - src/ui/shell/assets/archboard-wordmark.svg
  - src/ui/shell/assets/fonts/DMMono-Medium-v1.000.ttf
  - src/ui/shell/assets/fonts/DMMono-Regular-v1.000.ttf
  - src/ui/shell/assets/fonts/OFL-DMMono-1.1.txt
  - src/ui/shell/assets/fonts/OFL-Onest-1.1.txt
  - src/ui/shell/assets/fonts/Onest-Medium-v1.000.ttf
  - src/ui/shell/assets/fonts/Onest-wght-v1.000.ttf
  - src/ui/shell/assets/fonts/README.md
  - src/ui/shell/shell.css
  - src/ui/types/index.ts
  - tests/system/boards/board-preview.test.ts
  - tests/system/browser/board-navigator.test.ts
  - tests/system/browser/claim-interaction.test.ts
  - tests/system/browser/connected-path-focus.test.ts
  - tests/system/browser/fullscreen-presentation.test.ts
  - tests/system/browser/human-edit-performance.test.ts
  - tests/system/browser/human-hold-persistence.test.ts
  - tests/system/browser/pane-telemetry-recovery.test.ts
  - tests/system/browser/selection-inspector.test.ts
  - tests/system/browser/shell-layout.test.ts
  - tests/system/browser/support/agent-browser.ts
  - tests/system/browser/support/shell-contract-types.ts
  - tests/system/browser/support/workbench-metrics.ts
  - tests/system/cli/install-source-policy.test.ts
  - tests/system/repository-policy/brand-typography.test.ts
  - tests/system/repository-policy/ci-browser-gate.test.ts
  - tests/system/repository-policy/test-inventory.test.ts
priority: high
type: feature
ordinal: 156000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the neutral and brass visual direction from TASK-111 with the approved operator canvas shell reference. People working with an agent should see more of the board while board identity, pane state, persistence, selection, code binding, and agent activity remain easy to inspect. This parent tracks the visual migration and the product additions that the reference makes concrete.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The shipped shell follows the approved operator canvas shell reference in both light and dark modes while preserving the board, pane, persistence, claim, notice, dialog, and supported desktop behavior delivered by TASK-111
- [x] #2 The lowercase archboard wordmark, flat technical grid, compact shell regions, cobalt selection accent, and lime status accent form one coherent visual system
- [x] #3 The compact board strip, integrated agent workbench, code-binding inspector, connected-path focus, and real lazy board preview are delivered through focused child tasks
- [x] #4 Rendered browser verification covers light and dark supported desktop layouts, one and two panes, fullscreen presentation, pointer and keyboard operation, and Samsung Flip desktop touch targets without hiding an existing reachable state
- [x] #5 Mockup-only branch, telemetry, proposed-diff, prompt-input, and illustrative or synthetic preview details do not enter the product; TASK-140.06 is the separate contract for previews of real current board content
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the finalized TASK-139 fullscreen contract on the exact green a8275ac base while keeping CI remediation and main reconciliation parent-owned.
2. Preserve the TASK-111 desktop behavior matrix while replacing the neutral/brass shell with one flat operator token system, lowercase wordmark, denser header, cobalt selection, lime live status, accessible states, and a canvas-first one-pane, two-pane, and fullscreen composition.
3. Keep the completed TASK-140.02 compact navigator history intact, then use TASK-140.06 to refine its board/variant items and add lazy previews of real current board content through a bounded read-only browser path.
4. Keep focused-pane connection, claim, take-back, current doing, and recent doing data in the collapsible bottom workbench, retaining offline/reconnect and fullscreen boundaries and adding no agent-control or proposed-diff concepts.
5. Keep the right inspector driven by focused-pane selection and a validated portable binding projection; reuse board-and-element code-target activation, settings, and GitHub recovery, and keep derived machine-local targets out of persistence.
6. Keep deterministic canonical-arrow connected-path focus browser-only, including bound labels, cycle termination, broken-endpoint rejection, selection/board/Escape/visible exits, and zero scene or export mutation.
7. Serialize cropped desktop-only regional parity passes for navigator, top shell, workbench, and inspector/focus. Replace only obsolete phone assertions with supported desktop coverage while preserving panes, fullscreen, notices, conflict, scratch, offline/reconnect, claim/take-back, selection/code-target, focus, accessibility, and Samsung Flip desktop touch behavior.
8. Run formatting, lint, both TypeScript projects, focused owners, repository checks, frontend production build, and the complete sequential bun run check lane. Obtain an independent Standards and Spec review of a8275ac230dbba315aa5768335f80fc5dcdf91ca..HEAD, remediate and rereview to clean, then finalize TASK-140.06 and TASK-140 through the Backlog CLI.
9. Stop on a clean merge-ready branch without merging main or pushing; final reconciliation remains parent-owned.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Product scope update (2026-08-30): the user established that Archboard's shell is desktop-only. Active TASK-140 acceptance and planning no longer gate phone, 420px, or narrow reflow. Completed TASK-140.01-.04 history remains unchanged. Desktop pointer, keyboard, and Samsung Flip desktop-sized touch workflows remain required. The user separately approved TASK-140.06 for previews of real current board content, which supersedes only the earlier synthetic/generated-thumbnail non-goal.

Completion evidence (2026-08-30):
- All seven children TASK-140.01 through TASK-140.07 are Done in dependency order. Regional UI ownership was serialized across navigator 01a05206-d4c7-7aa2-a918-ffe58d6e31d2, top shell 01a05206-d466-7943-a023-b875c0a0f537, workbench 01a05206-d65c-7153-8169-b296be17698f, inspector/focus 01a05206-d83b-71c2-b6bf-ce34f0a53a60, and brand typography 01a0524b-3bab-7c43-bf51-e7a476676ebb.
- Rendered 1440x900 desktop light/dark evidence covers one and two panes, fullscreen, navigator preview loading/empty/failure/ready, pointer/keyboard disclosure, 44px Samsung Flip targets, claim/take-back, inspector/code-target recovery, and connected-path entry/exit. Crops remain ephemeral under /tmp.
- Real previews use browser-side Excalidraw exportToSvg over mounted or read-only canonical scene snapshots, bounded in-memory version/theme caching, stale-result discard, and Blob URL display. Owners prove zero note writes, zero feed entries, no board open/focus/claim/client side effects, and no canonical export difference.
- The desktop-only shell rule is durable in AGENTS.md, DESIGN.md, and docs/design/operator-canvas-shell.md. Obsolete phone-only assertions/selectors were replaced only within redesigned shell ownership; no unsupported viewport mode or renewed mobile contract was introduced.
- The lowercase vector wordmark and pinned Onest/DM Mono roles are reproducible, licensed, locally loaded, accessible, and documented. No synthetic thumbnails, branch/telemetry UI, proposed diffs, prompt input, Pause, Send, hidden diff, or second agent client entered the product.
- Final uninterrupted exclusion-free gate: build; lint; formatting; both TypeScript projects; modules 434 tests/3235 assertions; system 284/4197; repository 118/363; all 19 canonical serial-browser owners 20 tests/1067 assertions; deterministic wordmark check; range/worktree diff checks.
- Reviewer thread 01a05286-a361-7683-bf0d-de8e93228936 independently reported Standards and Spec REVIEW_CLEAN for a8275ac230dbba315aa5768335f80fc5dcdf91ca..f648a6088fc27d70a6ed80e2e3bc1b4505ae1a88 after the final causal telemetry-owner remediation. No checks were weakened.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered the complete desktop operator canvas shell over the finalized green base: a compact flat light/dark frame, real board and variant navigation with lazy canonical previews, a focused-pane agent workbench, selected-element and portable code-binding inspection, deterministic browser-only connected-path focus, and reproducible licensed typography with an accessible vector wordmark. Preserved TASK-111 and TASK-139 board, pane, persistence, claim, notice, conflict, fullscreen, and Samsung Flip workflows while keeping mockup-only controls and synthetic content out. Verified through cropped real-browser inspection, all 19 canonical browser owners, the complete exclusion-free local check, protected-base audits, and an independent clean Standards plus Spec review. The branch remains isolated, unpushed, and unmerged for parent-owned reconciliation.
<!-- SECTION:FINAL_SUMMARY:END -->
