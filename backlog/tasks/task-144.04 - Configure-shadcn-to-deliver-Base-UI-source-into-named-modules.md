---
id: TASK-144.04
title: Configure shadcn to deliver Base UI source into named modules
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-31 03:39'
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
- [ ] #1 components.json is byte-equivalent JSON to the reviewed literal: schema URL, style base-nova, rsc false, tsx true, tailwind config empty/css src/ui/theme/app.css/baseColor neutral/cssVariables true/prefix empty, and components/ui/lib/hooks @/ui plus utils @/ui/ui-classnames aliases.
- [ ] #2 iconLibrary is intentionally omitted because the schema has no local-icon value. A non-mutating dry-run may report its default, but package/source adoption is refused; button/dialog fixtures match the immutable commit and exact hashes.
- [ ] #3 The dry-run uses finished Vite/TypeScript/Oxlint aliases, validates literal components.json, compares generated inputs to tracked fixtures, reports default/icon/upstream drift, and never modifies the checkout.
- [ ] #4 Only reviewed named source may be copied; reductions remove icon/default helpers and future updates repeat provenance, hash, dependency, accessibility, aesthetic, and boundary review.
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
<!-- SECTION:NOTES:END -->
