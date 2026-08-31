---
id: TASK-144.08
title: Migrate opener settings onto the Base UI dialog
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-31 05:47'
labels: []
dependencies:
  - TASK-144.19
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/opener-settings
parent_task_id: TASK-144
priority: high
type: task
ordinal: 222000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate the existing opener settings consumer onto the reviewed Base UI dialog/button and semantic Tailwind contract. Delegation profile: gpt-5.6-sol, high for routine UI implementation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The opener retains the existing settings state owner, save/cancel semantics, validation, labels, and trigger; only presentation/interaction primitives move to the reviewed dialog/button modules.
- [ ] #2 The consumer uses semantic Tailwind classes and named module entrypoints without direct @base-ui or Radix imports, copied portal/focus state, inline style policy, or second modal store.
- [ ] #3 Module tests cover props, state transition requests, and classes only; TASK-144.11 owns rendered focus, Escape, outside-dismissal, portal, accessibility, themes, reduced motion, and touch.
- [ ] #4 Existing opener errors and unsaved values survive dismiss/refocus behavior exactly as specified by its current public contract.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the shell trigger and the existing OpenerSettingsDialog state, loading, validation, test, reset, save, success, failure, and cancel callbacks; adapt only the mounted consumer to the accepted controlled src/ui/dialog request contract.
2. Replace the legacy Modal and native action buttons with the named src/ui/dialog and src/ui/button entrypoints, with Base UI requesting close through the existing onCancel callback and no local modal store, portal, focus, Escape, or outside-dismissal code.
3. Remove the opener stylesheet and translate its presentation to complete static semantic Tailwind utilities while retaining contract selector names only; use the accepted Dialog sizing contract because the semantic theme exposes no opener-width token, and add no local CSS, arbitrary value, inline style, or narrow/mobile path.
4. Add focused src/ui/opener-settings module evidence for public callback props, controlled close/refocus requests, API effects and failures, retained mounted drafts, accepted component composition, action state props, deterministic semantic classes, and forbidden direct primitive or duplicate interaction machinery; do not add rendered assertions owned by TASK-144.11.
5. Run only memory-capped focused module tests, scoped lint/format, both TypeScript checks, focused theme/style-entry/adoption/inventory policy, frontend build and compiled-class inspection; verify the protected artifact hash, commit implementation and Backlog evidence separately, and leave TASK-144.08 In Progress with every criterion unchecked.

6. Review remediation: preserve the legacy safe initial focus by attaching a React ref to the existing Cancel DialogClose and passing that ref through DialogContent.initialFocus, leaving focus movement entirely inside Base UI; correct the retained-draft failure owner to query post-failure executable and argument elements before asserting their current unsaved values and stable row IDs, then rerun the same focused capped gates and record new commits without checking acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved for implementation and independent review at integration HEAD 0ed8963628b1519990536d0d1b42137d9e83be7c. Scope is limited to src/ui/opener-settings and its focused evidence; TASK-144.11 retains rendered interaction ownership.

Implementation began from reserved integration HEAD 182591d252b5520127c004ff4d49a1b9fe652245. Existing state owner is OpenerSettingsDialog, mounted by Shell openerSettingsOpen; the shell trigger and mount contract are outside this leaf. The accepted Dialog is controlled-only and the accepted Button owns action primitives. TASK-144.11 retains rendered focus, Escape, outside dismissal, portal, accessibility, themes, reduced motion, and touch evidence.

Implementation commit: c99c6ceaf53afd67aa05c2f7b4ecb25b776a1bf1.

Migrated only src/ui/opener-settings. The existing OpenerSettingsDialog remains the owner of fetched settings, choice, custom argv draft and row IDs, repository, busy operation, local server error, validation, and all API effects. Shell.tsx and BoardBar remain unchanged. The consumer now composes the accepted controlled Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose, and Button entrypoints. A requested close calls the existing onCancel; no modal store, direct Base UI/Radix import, portal, backdrop, focus, Escape, outside-dismissal, role, timer, listener, or inline-style machinery was added. The 230-line legacy opener stylesheet was removed in favor of complete static semantic Tailwind classes.

Focused module evidence covers the exact callback props, controlled open/refocus/close requests, fresh load, test without persistence, successful and failed test draft retention with stable row IDs, successful and failed save/reset effects and copy, exact component tones/classes, one Dialog owner, and forbidden copied mechanics. Final capped evidence, every command used MemoryMax=6G and MemorySwapMax=1G:
- opener module owner: 4 tests, 70 assertions passed; MemoryPeak=31.7M, swap=0B
- scoped Oxlint: 0 warnings/errors; MemoryPeak=364.3M, swap=0B
- scoped Oxfmt check: pass; MemoryPeak=340.6M, swap=0B
- root TypeScript: pass; MemoryPeak=1.4G, swap=0B
- frontend TypeScript: pass; MemoryPeak=280.7M, swap=0B
- production frontend build: pass; MemoryPeak=1.4G, swap=0B
- focused theme, stylesheet entry, shadcn adoption, and test inventory owners: 72 tests, 694 assertions passed; MemoryPeak=1.5G, swap=0B
- compiled CSS: dist/frontend/assets/index-S6nVke_t.css is exactly 58,230 bytes and contains the semantic checked-choice, touch-target, destructive, status, spacing, and radius utilities; test-only duration-150 is absent
- git diff --check: pass
- protected /home/msc/Projects/archboard/src-DlBR1tzg.js SHA-256 remains 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6

No broad repository, system, module, or browser lane was run. Rendered focus, Escape, outside dismissal, portal placement, accessibility, themes, reduced motion, touch, and final sizing remain TASK-144.11 ownership and residual review risk. TASK-144.08 intentionally remains In Progress with every acceptance criterion unchecked for independent review.

Independent review requested remediation after range 182591d252b5520127c004ff4d49a1b9fe652245..71d5e49dbd07bb0ce0cd04586107c18972b4a17f. Finding 1: the accepted Dialog had no initialFocus prop, so it no longer encoded the legacy safe Cancel target. Finding 2: the failure test asserted a stale pre-rerender executable element and current IDs without current argument values. Both findings are accepted; remediation stays inside src/ui/opener-settings and its focused evidence.

Review remediation commit: 0b9a8b3980585a4beb4114ae50ac248a8852eb9b.

Restored the legacy safe initial-focus intent without adding an interaction owner. OpenerSettingsDialog now owns one stable Cancel ref, passes it to DialogContent.initialFocus, and attaches it to the existing Cancel DialogClose. Base UI remains the only code that moves focus; no imperative focus call, query, listener, effect, timer, or focus state was added. The focused owner asserts that DialogContent.initialFocus and the Cancel ref are the same object.

Corrected the retained-draft failure evidence. The owner now edits the executable and first argument to a distinct unsaved selection, proves the failed test request submitted that selection, rerenders, queries the current executable and argument inputs, and asserts current values plus stable row IDs. It no longer reads the stale pre-failure executable element. The specialized state/API reviewer reported REVIEW_CLEAN for the pre-remediation range, so no unrelated state or API changes were added.

Final capped remediation evidence, every command used MemoryMax=6G and MemorySwapMax=1G:
- opener module owner: 4 tests, 74 assertions passed; MemoryPeak=30M, swap=0B
- scoped Oxlint: 0 warnings/errors; MemoryPeak=365.2M, swap=0B
- scoped Oxfmt check: pass; MemoryPeak=337.6M, swap=0B
- root TypeScript: pass; MemoryPeak=1.5G, swap=0B
- frontend TypeScript: pass; MemoryPeak=273.2M, swap=0B
- production frontend build: pass; MemoryPeak=1.4G, swap=0B
- focused theme, stylesheet entry, shadcn adoption, and test inventory owners: 72 tests, 694 assertions passed; MemoryPeak=1.4G, swap=0B
- compiled CSS remains dist/frontend/assets/index-S6nVke_t.css at exactly 58,230 bytes with required semantic utilities present and test-only duration-150 absent
- git diff --check: pass
- protected artifact SHA-256 remains 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6

No broad repository, system, module, or browser lane was run. TASK-144.11 still owns rendered focus movement, focus return, Escape, outside dismissal, portal placement, accessibility, themes, reduced motion, touch, and final sizing. TASK-144.08 remains In Progress with every criterion unchecked for rereview.
<!-- SECTION:NOTES:END -->
