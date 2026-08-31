---
id: TASK-144.11
title: Verify the migrated opener dialog in the browser
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-08-31 11:50'
labels: []
dependencies:
  - TASK-144.08
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - src/ui/button/index.tsx
  - src/ui/button/tests/button.test.ts
  - src/ui/dialog/index.tsx
  - src/ui/dialog/tests/dialog.test.ts
  - src/ui/opener-settings/lib/OpenerSettingsDialog.tsx
  - src/ui/opener-settings/tests/opener-settings.test.ts
  - src/ui/shell/Shell.tsx
  - src/ui/shell/shell.css
  - src/ui/theme/app.css
  - src/ui/theme/tests/theme-compile.test.ts
  - tests/system/browser/code-target-activation.test.ts
  - tests/system/browser/opener-settings.test.ts
  - tests/system/browser/selection-inspector.test.ts
  - tests/system/browser/support/opener-settings-interaction.ts
  - tests/system/browser/support/opener-settings-probe.ts
  - tests/system/browser/support/opener-settings.ts
parent_task_id: TASK-144
priority: high
type: task
ordinal: 233000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the existing opener browser owner after migration. Delegation profile: gpt-5.6-sol, high because this is rendered interaction and accessibility verification.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The browser owner proves trigger naming, initial focus, focus trap, Tab order, Escape dismissal, outside dismissal policy, portal placement, focus return, labels/descriptions, validation announcement, disabled/save/cancel behavior, and no background interaction.
- [x] #2 It verifies light/dark/high-contrast, reduced motion, keyboard, screen-reader accessibility tree, 44px Flip targets, and unchanged opener persistence at the supported viewport.
- [x] #3 No unexpected browser/server logs, duplicate dialog roots, focus leaks, or direct Radix/shadcn runtime behavior are tolerated.
- [x] #4 The canonical existing browser inventory remains one owner; this task does not create a second opener test or register unrelated workbench tests.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep tests/system/browser/opener-settings.test.ts as the single canonical owner and move only reusable probes into support modules so every file satisfies the 500-line policy.
2. Keep Cancel enabled and initially focused only while the initial settings read is pending, while preserving disabled dismissal controls for test, save, and reset work.
3. Restore shared semantic control presentation through the low-precedence theme layer and explicit solid focus-visible outlines for buttons, dialogs, and opener inputs.
4. Exercise gated load cancellation, late-response rejection, focus containment and return, Tab order, Escape/outside/Cancel dismissal, portal/background blocking, validation, pending Test/Save, failure recovery, reset, persistence, accessibility, visual modes, fit, targets, and clean logs at desktop and Flip viewports.
5. Repair only invalidated semantic opener selectors in existing downstream owners, without adding opener behavior to either owner.
6. Make shared dialog themes inherit across the default Base UI body portal, pin exact light/dark semantic colors, and prove late-load and covered-trigger guards with non-vacuous browser oracles.
7. Validate focused modules, the canonical browser owner, downstream owners, inventory, types, formatting, and lint under sequential capped services; after two clean independent reviews, map accepted evidence to every criterion and finalize the task as Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-144.08 finalized at integration HEAD 5aced519ba8553b7692a360a26b34a205f388620. This leaf owns the canonical existing opener browser owner and rendered migration evidence. A narrowly necessary selector update in an existing browser owner may be proposed only if direct migration fallout would otherwise leave the typed serial lane red; no second opener owner or unrelated workbench coverage is permitted.

Rendered reproduction before remediation (capped focused owner): with the initial GET condition-gated, one named Base UI dialog and its loading description rendered, but Cancel was disabled; initialFocus could not resolve to it and document.activeElement remained the background Opener settings trigger (focusInside=false). Parent approved the narrow loading-only Cancel remediation after this callback. The browser owner must now prove Cancel owns focus during the pending GET and cancellation prevents the late response from applying.

The scoped rendered axe audit found Save at 3.27:1 (#18181b on #155eef). Root cause: app.css imports legacy shell.css before Tailwind emits layered utilities; shell.css has an unlayered button color inheritance rule, and unlayered declarations outrank text-primary-foreground in the utilities layer. The theme token and composed Button class are correct. Parent approved the smallest shared fix: use the important semantic primary-foreground utility for the primary Button tone, leaving the broad legacy inheritance rule untouched.

The attempted important text utility on Button was rejected before browser execution because the Button unit owner showed tailwind-merge removed the important control-size utility. The accepted fix leaves Button composition unchanged and places the legacy global button color inheritance into the already-declared low-precedence theme layer, so the later utilities layer can apply semantic foreground colors.

The rendered keyboard probe found a second shared production defect after contrast was repaired: Save received focus with outline-width 2px but outline-style none. Tailwind outline-none set the shared outline-style variable to none, while focus-visible:outline-2 changed only its width. The accepted repair adds focus-visible:outline-solid to the shared Button, Dialog popup, and opener inputs, with exact module contracts and a rendered visible-focus assertion across light, dark, reduced-motion, and forced-colors modes.
Final focused evidence: opener modules 16 passed with 208 expectations; canonical opener browser owner 1 passed with 156 expectations; selection-inspector owner 1 passed with 66 expectations; code-target-activation owner 1 passed with 78 expectations; repository inventory 39 passed with 69 expectations; TypeScript, targeted Oxfmt, and targeted Oxlint passed. Final services used 0B swap; type-check peaked at 1.4G and the final opener browser owner at 590.7M.
The opener owner now remains one canonical inventory entry, with reusable probes in tests/system/browser/support/opener-settings.ts. The browser lane cleanup left no active archboard-task14411 transient unit. The protected /home/msc/Projects/archboard/src-DlBR1tzg.js remains untracked in its source checkout and was not touched.
Implementation commits: 2c41ef25 loading-only Cancel focus repair; 8c0252d9 semantic contrast and visible-focus repair; 6883fcc6 canonical browser verification and downstream semantic-selector repairs. TASK-144.11 intentionally remains In Progress with acceptance criteria unchecked for parent review.

Final acceptance mapping (2026-08-31): AC1 is proven by the canonical rendered browser owner covering trigger naming, initial and trapped focus, Tab order, Escape/outside/Cancel behavior, body portal placement, focus return, accessible labels and descriptions, validation announcements, pending/disabled controls, and blocked background interaction. AC2 is proven by exact computed light/dark semantic surface, foreground, border, and backdrop assertions; forced-colors and reduced-motion modes; axe/accessibility-tree checks; visible keyboard focus; 44px targets at the supported desktop/Flip viewport; and successful reset/save persistence workflows. AC3 is proven by clean browser/server logs, one dialog root, focus containment/return, Base UI public-module contracts, late-load cancellation with a live-guard mutation that fails on a stale alert, and two independent clean final reviews. AC4 is proven by the repository inventory and downstream selection-inspector/code-target owners: opener-settings.test.ts remains the single registered opener owner, with probes only extracted to support modules. Final validation accepted: theme 21/571, dialog 6/79, opener 4/77, focused browser 1/169, TypeScript, targeted Oxfmt/Oxlint, downstream browser owners and inventory; all capped services used 0B swap.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed the canonical opener-dialog browser migration owner and the production repairs it exposed: cancellable loading focus, semantic contrast/focus styles, portal-safe root theme ownership, full-viewport backdrop geometry, and guarded late-load cleanup. Verified every acceptance criterion through rendered browser behavior, exact light/dark semantics, accessibility/focus/persistence workflows, module/theme/static checks, inventory/downstream owners, mutation evidence, and two independent clean reviews.
<!-- SECTION:FINAL_SUMMARY:END -->
