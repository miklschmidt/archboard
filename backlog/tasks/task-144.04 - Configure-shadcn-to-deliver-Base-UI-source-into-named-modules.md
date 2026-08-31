---
id: TASK-144.04
title: Configure shadcn to deliver Base UI source into named modules
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-31 04:02'
labels: []
dependencies:
  - TASK-144.05
  - TASK-144.15
  - TASK-144.17
  - TASK-144.18
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - components.json
  - docs/design/vendor/shadcn-base/button.tsx
  - docs/design/vendor/shadcn-base/dialog.tsx
parent_task_id: TASK-144
priority: high
type: task
ordinal: 218000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Configure shadcn base-nova for Base UI source delivery after every resolver/helper is proven. Pin reviewed upstream source at commit b4a618b97e35f5dadf3a00d51f410c84a2567d4d and track exact source fixtures; mutable main is provenance only. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 components.json is byte-equivalent JSON to the reviewed literal: schema URL, style base-nova, rsc false, tsx true, tailwind config empty/css src/ui/theme/app.css/baseColor neutral/cssVariables true/prefix empty, and components/ui/lib/hooks @/ui plus utils @/ui/ui-classnames aliases.
- [x] #2 iconLibrary is intentionally omitted because the schema has no local-icon value. A non-mutating dry-run may report its default, but package/source adoption is refused; button/dialog fixtures match the immutable commit and exact hashes.
- [x] #3 The dry-run uses finished Vite/TypeScript/Oxlint aliases, validates literal components.json, compares generated inputs to tracked fixtures, reports default/icon/upstream drift, and never modifies the checkout.
- [x] #4 Only reviewed named source may be copied; reductions remove icon/default helpers and future updates repeat provenance, hash, dependency, accessibility, aesthetic, and boundary review.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the reviewed base-nova components literal, pinned upstream commit, existing aliases, and vendor fixture provenance. 2. Write only the exact components.json and immutable button/dialog source fixtures, intentionally omitting iconLibrary. 3. Add a non-mutating dry-run owner that validates literal config, alias agreement, fixture bytes/hashes, default/icon/upstream drift, and checkout cleanliness without package/source adoption. 4. Run focused config/provenance/dry-run/type/lint/format/inventory/diff checks; leave broad lanes to root caps.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.18 finalized at integration HEAD 4cbceec. This ready leaf owns components.json, the two pinned vendor fixtures, and its narrow dry-run evidence; it is disjoint from active shell-token remediation and assistant-ui dependency work.

Implemented in 32cfcd6 from fixed BASE 299286acb43b5a4e9ace716b5886d1a271a3b17a0. Scope is components.json, exact non-compiled vendor reading fixtures, one focused repository-policy owner, and the narrow formatter ignore required to preserve upstream bytes; package/lock, src product code, Vite/TypeScript/Oxlint config, scripts, CI, and browser owners are untouched.

Evidence: components.json SHA-256 b5d8f37341a1f185337f79c5ef8447e914d280bc0670a635fadeac023c7f0a8c; Button fixture SHA-256 97bfee456444f0495deee6a321933c24267477645b0bf4bfea67c3c62d425a12; Dialog fixture SHA-256 85f9a33d1a8c495b0faecd066dae1581b8feb5d27f912ecf65f814386f6da3a9; provenance is full immutable shadcn-ui/ui commit b4a618b97e35f5dadf3a00d51f410c84a2567d4d. The offline owner initially passed 6 tests / 28 expectations; implementation and focused evidence are in 32cfcd6.

Correction: the earlier evidence note mistakenly wrote the fixed BASE with an extra trailing 0 (`...17a0`). The actual full fixed BASE is 299286acb43b5a4e9ace716b5886d1a271a3b17a. This metadata correction does not change implementation bytes.

Remediation implemented in c8fd582 on the same fixed BASE: replaced the hard-coded plan with a reusable local shadcn probe boundary that snapshots status, git diff --binary HEAD, and relevant tree hashes; invokes only pinned local shadcn info plus add button/dialog --dry-run/--view when explicitly run; parses destinations, imports, generated source, and defaults; compares against reviewed fixtures/provenance; and classifies config/default/icon/upstream/package-source drift, unsafe write attempts, network inability, and mutation. The standard owner uses captured outputs and a local runner double, remains offline/deterministic, and rejects unsafe commands before the runner.

Focused remediation evidence: 7 tests / 34 expectations; bunx oxlint tests/system/repository-policy/shadcn-base-adoption.test.ts; bunx oxfmt --check components.json tests/system/repository-policy/shadcn-base-adoption.test.ts; bunx tsc --noEmit --pretty false -p tsconfig.json — all passed. Acceptance criteria intentionally remain unchecked; TASK-144.04 remains In Progress.

Live probe evidence (separate from standard enforcement): from clean remediation HEAD d68a0e9, ARCHBOARD_SHADCN_LIVE=1 bun test tests/system/repository-policy/shadcn-base-adoption.test.ts invoked only pinned local shadcn 4.19.0 via info --json and add button dialog --dry-run --yes --view. It parsed destinations src/ui/button.tsx and src/ui/dialog.tsx; imports @base-ui/react/button, @base-ui/react/dialog, @/ui/button, @/ui/ui-classnames/index, class-variance-authority, lucide-react, and react; defaults base/base, iconLibrary/lucide, font/geist; and correctly classified package/source adoption attempt plus upstream drift. No cleanup or rollback ran. cleanBeforeAfter=true with empty status before/after, identical empty git diff --binary HEAD SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855, and identical relevant tree hashes. Capture: /tmp/archboard-task14404-live-remediation.json (SHA-256 21305af646dfc018f3b23ec0512991ee612a10e8d8b2b723d26b479e580258d0). Standard repository enforcement remains offline/deterministic and uses captured output/runner-double tests only.

Rereview remediation implemented in fc4d399 on fixed BASE 299286acb43b5a4e9ace716b5886d1a271a3b17a. The reusable probe support moved to tests/system/repository-policy/support/shadcn-base-probe.ts, leaving the owner at 256 lines and support at 361 lines. Live mode now fails closed for dirty-before, exact before/after snapshot mismatch, dry-run mutation, network unable-to-verify, config drift, default/icon drift, unsafe command, and generated destination/action drift; expected mutable registry package/source and upstream drift remain diagnostic.

The --view parser now records every proposed file/action header before extracting only reviewed button/dialog create source. Captured hostile tests cover a third create, unexpected update, unsafe overwrite, changed second snapshot, nonempty initial status, and failed runner. Standard owner remains offline/deterministic with 9 tests / 40 expectations.

Final focused evidence from clean fc4d399: bun test tests/system/repository-policy/shadcn-base-adoption.test.ts (9 pass / 40 expectations); focused Oxlint; focused Oxfmt; root TypeScript; git diff --check — all passed. Clean live evidence: ARCHBOARD_SHADCN_LIVE=1 bun test tests/system/repository-policy/shadcn-base-adoption.test.ts exited 0 with fatal=[]; status empty before/after; exact empty binary HEAD diff SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855; relevant tree hashes unchanged; capture /tmp/archboard-task14404-live-fail-closed.json SHA-256 55d9552b52bd17fbcfc0deeac68ac41f4aafd9bbc9b7edfebb2b7d9a545b8dd4. Package/lock, product source, Vite/TypeScript/Oxlint config, scripts, CI, and browser owners remain untouched. Acceptance criteria remain unchecked and TASK-144.04 remains In Progress.

Final category-separation remediation implemented in 901c331 on fixed BASE 299286acb43b5a4e9ace716b5886d1a271a3b17a. Generated mutable registry imports/styles are classified as nonfatal registry package/source drift; generated source mismatch is nonfatal registry upstream drift. Checkout package.json/bun.lock and product-source findings are injected/read separately and classified as fatal checkout package/source adoption. Reviewed fixture hash/provenance mismatch is classified as fatal pinned fixture/provenance drift. fatalProbeRefusals includes checkout and pinned categories but not registry diagnostics.

Focused hostile coverage remains offline/deterministic: 9 tests / 43 expectations, including injected checkout adoption, pure pinned-fatal classification, third create, unexpected update, mutation, dirty-before, failed runner, and unsafe overwrite. Focused Oxlint, Oxfmt, root TypeScript, and git diff --check pass.

Clean live probe from 901c331: ARCHBOARD_SHADCN_LIVE=1 bun test tests/system/repository-policy/shadcn-base-adoption.test.ts exited 0 with fatal=[]; only info --json and add button dialog --dry-run --yes --view ran against local shadcn 4.19.0; parsed exactly button/dialog create actions; reported registry package/source drift plus registry upstream drift; no cleanup or rollback; empty status and identical binary/tree snapshots before/after. Capture /tmp/archboard-task14404-live-category-separation.json SHA-256 b80c0b57704c5d0f24782eaf6df1090d400b3718895f309f3625168da503770f. Task remains In Progress and ACs remain unchecked.

Root acceptance at integrated HEAD e6927eb: independent reviewer returned REVIEW_CLEAN for the complete immutable range 299286acb43b5a4e9ace716b5886d1a271a3b17a..500b7f167ef5a69497d5782dc257fa0b76d7fcca. Root capped validation passed: full lint in archboard-task14404-lint-e6927eb.service at 1.6G peak and swap 0; repository-wide format in archboard-task14404-fmt-e6927eb.service at 1.4G peak and swap 0; both TypeScript projects in archboard-task14404-types-e6927eb.service at 1.4G peak and swap 0; focused shadcn policy 9 tests/43 assertions in archboard-task14404-focused-e6927eb.service at 23.8M peak and swap 0; frontend build in archboard-task14404-build-e6927eb.service at 1.4G peak and swap 0. The complete repository-policy lane had already reached its fixed 12G memory and 2G swap caps in archboard-task14414-repository-0d2ee03.service and was not rerun or granted a higher cap; the focused owner plus inventory passed during independent review. Final changed-path audit shows no package/lock/product source/config/script/CI/browser changes, and the checkout is clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pinned the exact base-nova shadcn configuration and immutable Base UI button/dialog source inputs without adopting generated packages or product source. Added an offline deterministic policy and explicit local live probe that inventories every proposed action, proves checkout non-mutation, distinguishes mutable registry diagnostics from fatal checkout or pinned-input drift, and fails closed on unsafe outcomes. Independent review was clean; full lint, format, both TypeScript projects, the focused policy, and frontend build passed under caps.
<!-- SECTION:FINAL_SUMMARY:END -->
