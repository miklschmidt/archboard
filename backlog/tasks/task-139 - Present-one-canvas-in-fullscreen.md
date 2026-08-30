---
id: TASK-139
title: Present one canvas in fullscreen
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-29 16:19'
updated_date: '2026-08-30 06:49'
labels: []
dependencies: []
priority: medium
type: feature
ordinal: 155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A person presenting an architecture board needs a distraction-free view of one chosen canvas. The frontend should enter a presentation mode that hides the application shell and every other pane while preserving the live board session and making the selected canvas fill the available display.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A person can enter fullscreen presentation mode for the currently chosen canvas through a clear frontend control.
- [ ] #2 Presentation mode hides the shell, navigation, controls, and every non-selected canvas while the selected canvas fills the available display.
- [ ] #3 At most one canvas is presented at a time; choosing another canvas transfers presentation instead of creating a second fullscreen canvas.
- [ ] #4 Exiting presentation restores the prior shell and pane layout without losing the open boards, live connection, selection, or unsaved held state.
- [ ] #5 Keyboard and visible controls provide an accessible exit, and fullscreen refusal or loss returns to an accurate non-presenting state.
- [ ] #6 Rendered browser coverage proves enter, single-canvas exclusivity, transfer, exit, and state restoration through the user interface.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Proceed from fixed base `421c9e880e3662e000bc3713c3cf15bb67cf85a3`, which already contains the TASK-138 browser-lane and CI work needed by this feature; TASK-139 has no product or implementation dependency on TASK-138. Before editing, re-read the landed serial-browser inventory in `package.json` and `tests/system/browser/support/agent-browser.ts`, plus `docs/agents/test-suite.md`, `tests/system/repository-policy/test-inventory.test.ts`, and `.github/workflows/ci.yml`. The intentional overlap is limited to adding one owner in `package.json`, `tests/system/browser/support/agent-browser.ts`, and the documented count/order in `docs/agents/test-suite.md`; do not edit the workflow or inventory-policy owner. Before final repository and complete checks, compare these five files with current main and stop for parent reconciliation if later TASK-138 work changed their contract.

2. Write red tests in two dedicated owners, each below 500 lines. Add `src/ui/shell/tests/fullscreen-presentation.test.ts` for the browser API coordinator. Add `tests/system/browser/fullscreen-presentation.test.ts` as one observable rendered-workflow owner rather than growing `tests/system/browser/shell-layout.test.ts` or the already pressure-bound `tests/system/browser/human-hold-persistence.test.ts`. Register the new browser owner in the two canonical inventory files `package.json` and `tests/system/browser/support/agent-browser.ts`, and update the exact owner count and order in `docs/agents/test-suite.md`. Do not weaken, split across ad hoc lanes, or bypass the serial adapter.

3. Add `src/ui/shell/fullscreen-presentation.ts` as the sole Fullscreen API and presentation-state owner. Browser truth is exactly `root.isConnected && root.ownerDocument.fullscreenElement === root`, and `fullscreenchange` is listened for on `root.ownerDocument`. A Present click calls `root.requestFullscreen()` synchronously before yielding. The module keeps at most one latest target pane ID plus non-identity lifecycle bookkeeping, replaces that target on dock transfer, and reconciles every request or exit completion against current DOM truth. A stale successful request presents the latest still-valid target or immediately calls an ownership-checked exit when no target remains. Request or exit rejection keeps presentation only when the root still owns fullscreen; browser-driven loss clears it even if `exitFullscreen()` later rejects. A disconnected or removed root clears presentation and requests exit only when that exact root still owns fullscreen. Disposal detaches the owner-document listener, invalidates pending operations, publishes nothing after disposal, and never blindly exits fullscreen, so React StrictMode setup and cleanup are safe.

4. Make the module owner exercise synchronous request dispatch, ordinary entry and same-root transfer, overlapping requests, Escape during pending entry, a stale success after a newer refusal, native loss, entry refusal, exit refusal while the root still owns fullscreen, exit rejection after browser-driven loss, disconnected and removed roots, and StrictMode-style dispose and recreate. The fake owner document will assert listener attachment and detachment, operation invalidation, latest-target reconciliation, and that disposal itself makes no exit call.

5. Update `src/ui/shell/Shell.tsx` only as composition and recovery UI. It gives the module the existing shell root and renders a clear Present action for the focused pane plus a presentation-only segmented dock for transfer and Exit. Dock transfer also updates the existing `focused` pane so the restored chrome names the pane the presenter chose. When an external pane-close request targets the presented pane, Shell first transfers presentation and focus to the surviving mounted pane, then removes the target and requests exit; if exit is refused, the survivor still fills the display instead of leaving a blank shell. Entry failures use the existing visible notice. Failures while fullscreen render a persistent `role="alert"` inside the dock beside still-operable transfer and Exit controls, so a refused exit remains visible and a later Exit or Escape can recover. Entry focuses the dock and exit restores focus to Present.

6. Update `src/ui/canvas/CanvasPane.tsx` only with derived presentation attributes on the same mounted `section`. A non-presented pane is both `aria-hidden="true"` and inert; do not change `useCanvasSession`. Update `src/ui/shell/Icons.tsx` with one code-native fullscreen glyph. Make `src/ui/shell/shell.css` the only visual and layout owner. Every hiding or fill rule is gated by confirmed `.shell.shell-presenting:fullscreen`; pending or refused entry leaves the normal shell visible. Confirmed presentation hides the header, navigator, status bar, activity rail, normal pane bar, notices, dialogs, non-presented pane, and Excalidraw layer controls, while the selected mounted pane occupies the fullscreen viewport and the dock stays visible with 44-pixel targets and focus-visible treatment. No pane key, subtree, Excalidraw API, socket, pending report, selection, or held state is recreated.

7. In `tests/system/browser/fullscreen-presentation.test.ts`, drive the visible UI through native entry, transfer, exit refusal with an on-screen dock alert, later successful Exit, re-entry and real Escape, deterministic entry refusal, and external close of the presented pane. Before entry, capture both pane DOM nodes and the exact `/api/panes` registration: two client IDs, two board IDs, focused pane, selection, and rectangles, plus an actual held-board response. During presentation assert `document.fullscreenElement` is the shell root, exactly one pane fills the viewport, the other is hidden, inert, and reports a zero rectangle, registration count stays two, client and board IDs stay unchanged, selection and held data stay exact, and transfer changes both presentation and the existing focused-pane report. After each exit wait for and assert the same DOM nodes, live registrations, client and board IDs, selection, held data, focused pane, and exact pre-entry rectangles. The external-close case stubs exit refusal and proves the survivor is selected, visible, connected, and recoverable before the eventual exit.

8. Keep every new TS or TSX file and every modified test file below 500 lines. If the dedicated rendered owner approaches that limit, extract setup or polling into one focused support module below 500 lines. Do not add assertions to `tests/system/browser/human-hold-persistence.test.ts`; its current size leaves no safe room. Re-read all touched tests before accepting further scope.

9. Run `bun test src/ui/shell/tests/fullscreen-presentation.test.ts`, `bun run type-check`, `bun run lint`, `bun run fmt:check`, `bun run test:repository`, and `bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/fullscreen-presentation.test.ts`. Reconcile the browser inventory and documentation against current main, then run `bun run check` as the full acceptance gate. Audit exact file sizes, task metadata, ignored or generated residue, the final diff, and detached worktree status before committing.

10. TASK-138 overlap amendment after handoff. Adding the sixteenth canonical browser owner necessarily changes the one exact 15-to-16 package-lane diagnostic in tests/system/repository-policy/test-inventory.test.ts. The production validator message in tests/system/browser/support/agent-browser.ts must derive its expected owner count from BROWSER_TEST_PATHS.length so future owner additions cannot leave a stale literal. This is a narrow serialized integration seam with TASK-138 alongside package.json, the canonical owner list, AGENTS.md, and docs/agents/test-suite.md. The workflow remains protected. Run the focused repository-policy owner after this edit, keep all existing rejection cases intact, and reconcile the complete set against FINALIZED_GREEN main before aggregate validation.

11. Independent review remediation. The coordinator must expose its synchronous latest target pane ID for Shell lifecycle decisions without making that pending target a rendered presentation state. closePane must consult that target directly, so removal during a pending native entry or before a transfer render commits transfers to the mounted survivor and then cancels/exits exactly as the active-close path does. Add a coordinator regression for synchronous target visibility and cancellation before fullscreen arrives. Extend the existing rendered owner, still below 500 lines, by reopening a second pane after the steady-state close proof, deferring the shell's native request, closing the requested focused pane, then completing native entry under a real browser gesture; assert fullscreen is immediately relinquished, exactly one survivor remains visible, and no presentation class/dock targets the removed pane. Re-run the focused coordinator, rendered owner, static gates, line audit, and independent Standards/Spec rereview; aggregate gates remain serialized behind TASK-138 FINALIZED_GREEN.

12. Standards review remediation. Preserve the existing shell notice affordance and make it honest: add a coordinator clearError operation that clears only a non-presenting entry error, then have Shell's existing Dismiss notice action clear both ordinary notice state and that coordinator error. Do not let dismissal exit an active presentation or hide an exit-refusal alert in the fullscreen dock. Extend the coordinator refusal case to prove clearError removes the refusal while remaining non-presenting and Present can subsequently retry. In the rendered owner, click the visible Dismiss control after deterministic entry refusal, wait for the alert to disappear while fullscreen remains false, and then prove Present remains usable by continuing the existing re-entry path. Retain every predecessor assertion and focused gate.

13. After TASK-138 FINALIZED_GREEN, replay the three signed TASK-139 commits onto exact green main 0f2b38a, retain its fail-closed hosted exclusions, update every current owner-count contract plus TASK-142 from 15 to 16, run focused and complete exclusion-free local gates sequentially, then reuse both independent reviewers over the complete rebased range before Backlog finalization and a non-force fast-forward push.

14. Standards complete-range remediation. Preserve ordinary shell notice state across presentation attempts and confirmed fullscreen. Remove the eager ordinary-notice clear from handlePresent. When a non-presenting presentation refusal overlays an ordinary notice, Dismiss clears only the coordinator error so the ordinary notice becomes visible; otherwise Dismiss clears the ordinary notice. Add rendered proof with a persistent actionable notice across successful enter/exit, entry refusal, layered dismissal, and ordinary dismissal. Drive the rendered owner RED/GREEN, rerun focused coordinator/browser/policy/static gates, commit signed, and reuse the same Standards reviewer over the complete green-main range. Keep active exit-refusal dock alerts unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Focused implementation checkpoint: the coordinator owner passes 9 cases / 26 assertions; the rendered native-fullscreen owner passes 1 case / 33 assertions; the focused inventory owner passes 38 cases / 60 assertions; type-check, lint, and formatting are green. The rendered external-close case exposed that the long-lived pane socket retains its initial layout callback. Shell now keeps that callback stable while reading current pane and presentation state from commit-synchronized refs, so closing the presented pane deterministically transfers the live survivor before exit. Complete repository and serial-browser aggregate validation remains withheld until TASK-138 reports FINALIZED_GREEN.

Review remediation evidence: the coordinator TDD RED passed 8 predecessor cases and failed the two new contracts exactly because getTargetPaneId and clearError were absent (2 failures, 25 assertions reached). GREEN now passes 11 cases / 37 assertions, including pending-entry removal, same-root transfer removal, and honest entry-error dismissal. The rendered owner passes 1 case / 37 assertions in a real native-fullscreen browser. It now dismisses and retries entry refusal, holds requestFullscreen pending, externally closes the requested Pane B, completes native entry from a real gesture, and proves clean exit with the original Pane A identity/selection/focus/held board intact and visible. To preserve the line policy, browser helpers moved to one 141-line focused support module; the rendered owner is 400 lines, coordinator owner 284, and coordinator module 173. Type-check, Oxlint, formatting, diff check, and the focused inventory owner (38 cases / 60 assertions) pass. No workflow file changed and no TASK-139 process remains; the one observed /home/msc/Projects/archboard server predates and is outside this checkout.

TASK-138 release reconciliation: fetched exact signed origin/main 0f2b38a and anchored the prior signed review-clean checkpoint at codex/task-139-review-clean. Replayed all three TASK-139 commits with signing enabled. The only textual conflict was AGENTS.md; resolution retains TASK-138 hosted exclusions and TASK-141/TASK-142 ownership while updating the complete local lane to 16 owners. The workflow remains byte-identical to origin/main. Current reconciliation also updates the two stale test-suite owner counts, the repository-policy test title, and TASK-142 AC4/AC5 so its existing all-browser restoration scope includes the new fullscreen owner.

Post-TASK-138 focused acceptance on rebased HEAD: coordinator 11 tests / 37 assertions; rendered fullscreen owner 1 / 37 through native Fullscreen API; inventory plus CI browser policy 81 tests / 164 assertions; type-check, Oxlint, formatting, and diff checks green. The complete exclusion-free serial lane passed all 16 owners in canonical order with 762 assertions. bun run test then passed 411 module tests / 3,181 assertions, 281 serialized system tests / 4,163 assertions, 115 repository-policy tests / 319 assertions, and all 16 browser owners / 762 assertions. The first bun run check reached its browser lane but arrow-binding-differential timed out at its unchanged 1,500 ms held-report boundary after 35 assertions; both prior complete lanes had passed it. The failed lane cleaned all owned processes and roots. The unchanged owner immediately passed focused with all 65 assertions, then one complete exclusion-free bun run check retry passed lint, formatting, both TypeScript projects, 411 modules / 3,181, 281 system / 4,163, 115 repository / 319, and all 16 browser owners / 762. No wait, assertion, timeout, owner, product code, or test code changed for the retry.

Line and scope audit after reconciliation: new fullscreen-presentation.ts 173 lines, its module owner 284, rendered owner 400, and rendered support 141; all are below 500. Modified agent-browser support is 429, CI policy owner 495, and inventory owner 499. The fullscreen owner appears exactly once in package.json and once in BROWSER_TEST_PATHS. .github/workflows/ci.yml is byte-identical to green main, the CI-only all-browser sentinel remains fail-closed, TASK-141 remains untouched, and TASK-142 now owns restoring all 16 hosted owners. TASK-140 and b7be932 remain outside this lineage.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-30 00:17
---
Independent Spec review on signed HEAD f8b52af found one P2: pane removal during pending native entry/transfer can leave the coordinator targeting an unmounted pane and blank the fullscreen canvas. Accepted for remediation under plan item 11.
---

created: 2026-08-30 00:18
---
Parent reconciliation accepted the Standards P2: the entry-refusal alert is coordinator-owned, while the visible Dismiss button currently clears only Shell notice state and makes a false promise. Remediation recorded in plan item 12.
---

author: @codex
created: 2026-08-30 06:45
---
Complete-range Standards review on exact signed HEAD 37249e8cb4606c0309a46b47d1e60a6e24eae210 found one valid notice-ownership issue: presentation entry and refusal dismissal currently clear an unrelated ordinary actionable notice. Accepted for the narrow plan item 14 remediation; Spec remains REVIEW_CLEAN.
---

author: @codex
created: 2026-08-30 06:49
---
Focused notice-ownership TDD at exact pre-remediation HEAD 37249e8: the expanded rendered owner failed after native fullscreen entry because the persistent actionable notice had been erased (received null text/action after 20 assertions). After removing the eager Shell notice clear and making dismissal select the visible owner, the same owner passed 1/1 with 42 assertions. Coordinator passed 11/11 with 37 assertions; inventory and CI policy passed 81/81 with 164 assertions; type-check, lint, fmt:check, and git diff --check passed. New browser owner/support files are 426/170 lines. Ordinary notice state now survives successful enter/exit and entry refusal; dismissing the refusal reveals it, and its own dismissal still removes it. Active exit-refusal behavior is unchanged.
---
<!-- COMMENTS:END -->
