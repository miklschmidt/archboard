---
id: TASK-144.20
title: Copy the reduced Base UI button module
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 17:51'
updated_date: '2026-08-31 04:49'
labels: []
dependencies:
  - TASK-144.04
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/button
parent_task_id: TASK-144
priority: high
type: task
ordinal: 221000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Copy and reduce only the pinned Base UI button fixture into one named Archboard deep module. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The local button preserves Base UI button semantics, disabled/ref behavior, keyboard/pointer activation, and a small Archboard-owned API.
- [x] #2 Generated default aesthetics, icon package, cva, demo variants, and unused helpers are removed; semantic tokens and ui-classnames are the sole class path.
- [x] #3 Module tests prove exported API, prop/types, deterministic classes, and pure disabled/state behavior; rendered interaction belongs to TASK-144.11.
- [x] #4 Provenance records the immutable commit, button hash, reduction date, and local ownership.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add src/ui/button/index.tsx with one runtime Button export and type-only ButtonProps derived from @base-ui/react/button, including its polymorphic HTMLElement ref.
2. Compose required primary, secondary, and quiet tones plus control and icon sizes from typed static semantic class maps through the canonical cn entrypoint; preserve Base UI class/style callbacks and leave activation, disabled, render, and ref mechanics vendor-owned.
3. Record the immutable shadcn source, fixture hash, reduction date, Base UI runtime version, and Archboard ownership in src/ui/button/README.md.
4. Prove the exact runtime API, SSR-visible Base UI state, deterministic classes, caller precedence, immutability, negative type contract, and forbidden local mechanics through two focused module owners; run only the authorized capped compiler, build, and policy checks before independent review.

5. Add one exact Tailwind @source directive in src/ui/theme/app.css for authored src/ui TypeScript and TSX, then extend the existing frontend stylesheet-entry owner to build with the production Vite config in a temporary output and require representative Button selectors.

6. Restrict ButtonProps data-* values to DOM-serializable scalars, add valid string/boolean and rejected object/function/symbol type cases, then rerun only the authorized capped source, compiler, build, inventory, shadcn, and stylesheet-entry checks without any boundary-owner retry.

7. Keep the positive authored src/ui Tailwind source, exclude nested tests with one exact negative source directive, require both directives in the production stylesheet-entry owner, and prove Button selectors remain while the test-only duration-150 sentinel is absent; rerun only focused capped owners and the production build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-144.04 finalized at integration HEAD 9d8ecb87926a967c6984fe7b4267d85a04822f2d. This leaf owns src/ui/button and its focused module/policy evidence. It must reduce only the pinned reviewed button fixture, preserve Base UI semantics through an Archboard-owned API, use semantic tokens plus ui-classnames as the sole class path, and remain disjoint from active assistant-ui and app-server epoch lanes.

Implementation commit: 2cbc3ad3bf3262394d82245ad222f6e830aa89a2. Added the reduced Button API, provenance, runtime owner, and JSX-aware compile-contract owner under src/ui/button only.

Capped evidence with MemoryMax=6G and MemorySwapMax=1G:
- button module owners: 7 pass, 54 expectations; MemoryPeak=251.1M, swap=0B
- scoped Oxlint: 0 warnings/errors; MemoryPeak=308.9M, swap=0B
- scoped Oxfmt check: pass; MemoryPeak=326.5M, swap=0B
- root TypeScript: pass; MemoryPeak=1.4G, swap=0B
- frontend TypeScript: pass; MemoryPeak=241.4M, swap=0B
- frontend build: pass; MemoryPeak=1.4G, swap=0B
- test inventory owner: 39 pass; MemoryPeak=40.5M, swap=0B
- shadcn adoption owner: 9 pass; MemoryPeak=24.3M, swap=0B
- staged diff check and path/hash audit: pass; pinned fixture SHA-256 remains 97bfee456444f0495deee6a321933c24267477645b0bf4bfea67c3c62d425a12 and /home/msc/Projects/archboard/src-DlBR1tzg.js remains 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6.

Unable-to-complete evidence: the focused boundaries owner passed its first six cases, then systemd killed it at MemoryPeak=6G with swap peak 1G. The cap was not raised and the owner was not rerun uncapped. Scoped Oxlint, both TypeScript projects, inventory, and shadcn policy passed. Rendered keyboard, pointer, focus, and ref attachment remain TASK-144.11 ownership.

Review remediation implementation commit: 9a150a10f30e470dab9bf6e265027e788c910f1b.

Closed the two complete-range review findings: Tailwind now scans the single authored src/ui TypeScript/TSX source path, the production Vite contract proves min-h-touch-target, size-touch-target, and bg-primary are emitted, and ButtonProps data-* values accept only DOM-serializable scalars with negative object/function/symbol compile cases.

Focused capped remediation evidence with MemoryMax=6G and MemorySwapMax=1G:
- button module/type owners: 7 pass, 54 expectations; MemoryPeak=258.1M, swap=0B
- production stylesheet-entry owner: 3 pass, 10 expectations; MemoryPeak=1.4G, swap=0B
- theme compile owner: 21 pass, 571 expectations; MemoryPeak=64.4M, swap=0B
- scoped Oxlint: 0 warnings/errors; MemoryPeak=312.8M, swap=0B
- scoped Oxfmt check: pass; MemoryPeak=326.4M, swap=0B
- frontend TypeScript: pass; MemoryPeak=232.5M, swap=0B
- root TypeScript: pass; MemoryPeak=1.4G, swap=0B
- production frontend build: pass; MemoryPeak=1.4G, swap=0B
- repository test inventory: pass
- shadcn adoption owner: 9 pass, 43 expectations; MemoryPeak=25.4M, swap=0B
- diff, path, and protected-input hash audit: pass; pinned fixture SHA-256 remains 97bfee456444f0495deee6a321933c24267477645b0bf4bfea67c3c62d425a12 and /home/msc/Projects/archboard/src-DlBR1tzg.js remains 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6.

The boundary owner was not rerun: both authorized attempts had already exhausted the 6G/1G cap, and the parent remediation instruction explicitly prohibited another run. Rendered keyboard, pointer, focus, and ref attachment remain TASK-144.11 ownership. TASK-144.20 remains In Progress and all acceptance criteria remain unchecked for independent rereview.

Second review remediation implementation commit: 0afe990f7c27ce8cb0b0be9c2533174acaba1fd6.

Narrowed Tailwind discovery without losing product classes: the positive src/ui TypeScript/TSX source remains, one exact negative directive excludes nested test owners, and the production contract requires both directives. The built stylesheet keeps .min-h-touch-target, .size-touch-target, and .bg-primary while rejecting the test-only .duration-150 sentinel.

Focused capped evidence with MemoryMax=6G and MemorySwapMax=1G:
- production stylesheet-entry owner: 3 pass, 11 expectations; MemoryPeak=1.4G, swap=0B
- theme compile owner: 21 pass, 571 expectations; MemoryPeak=62.2M, swap=0B
- production frontend build: pass; CSS artifact dist/frontend/assets/index-l9HclMoo.css is 57,848 bytes, reported as 57.84 kB and 9.98 kB gzip; MemoryPeak=1.4G, swap=0B
- byte-exact artifact proof: .min-h-touch-target, .size-touch-target, and .bg-primary present; .duration-150 absent; MemoryPeak=3.5M, swap=0B
- scoped Oxlint: 0 warnings/errors; MemoryPeak=304.3M, swap=0B
- scoped Oxfmt check: pass; MemoryPeak=24.1M, swap=0B
- precommit diff and protected-input audit: pass; pinned fixture SHA-256 remains 97bfee456444f0495deee6a321933c24267477645b0bf4bfea67c3c62d425a12 and /home/msc/Projects/archboard/src-DlBR1tzg.js remains 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6.

The boundary lane was not rerun, as instructed after both authorized attempts exhausted the cap. TASK-144.20 remains In Progress and all acceptance criteria remain unchecked for complete-range rereview.

Root acceptance at integrated HEAD 2daf116: independent reviewer returned REVIEW_CLEAN for exact immutable range f25688065484034539b26d92b6ba10ca8b82bae2..651f5c4bee1c0f8b24bc7ca3ff0a1c394443711f. Root capped focused unit archboard-task14420-focused-2daf116.service passed 31 tests and 636 assertions across the button API/types, production style entry, and semantic theme at 1.4G peak/swap 0. Both TypeScript projects passed in archboard-task14420-types-2daf116.service at 1.5G peak/swap 0. Production build passed in archboard-task14420-build-2daf116.service at 1.4G peak/swap 0; artifact dist/frontend/assets/index-l9HclMoo.css is exactly 57,848 bytes, contains .min-h-touch-target, .size-touch-target, and .bg-primary, and excludes .duration-150. The full boundary owner and a narrowed remaining case each previously reached the fixed 6G memory/1G swap caps; neither was repeated or granted higher limits. Scoped lint/format, inventory, shadcn policy, diff/path/hash audits passed in worker/review. Rendered keyboard, pointer, focus, and ref attachment remain explicitly owned by TASK-144.11.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added one Archboard-owned Base UI Button module with an exact Button/ButtonProps surface, explicit primary/secondary/quiet tones, control/icon sizes, semantic static classes, scalar data attributes, preserved Base UI polymorphic/ref/disabled/event behavior, and immutable source provenance. Extended the canonical Tailwind source seam to scan product src/ui TypeScript while excluding test owners, with production artifact assertions for required selectors and test-only utility absence. Independent review was clean; focused owners, both TypeScript projects, and the production build passed under caps.
<!-- SECTION:FINAL_SUMMARY:END -->
