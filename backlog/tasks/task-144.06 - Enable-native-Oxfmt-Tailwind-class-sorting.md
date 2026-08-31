---
id: TASK-144.06
title: Enable native Oxfmt Tailwind class sorting
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-31 00:38'
labels: []
dependencies:
  - TASK-144.03
  - TASK-144.05
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - .oxfmtrc.jsonc
parent_task_id: TASK-144
priority: high
type: task
ordinal: 220000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Enable Oxfmt's native Tailwind v4 sorting using the canonical stylesheet and helper function. Keep className native; add no custom sorting rules or copied defaults.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Oxfmt configuration names the canonical stylesheet and functions [cn]; className uses native formatter behavior and is not redundantly configured.
- [ ] #2 Sorting follows installed Oxfmt/Tailwind v4 semantics for static strings and cn calls without formatting dynamic expressions, templates, or data as invented classes.
- [ ] #3 No Prettier plugin, custom comparator, Tailwind-specific Oxlint rule, warning allowance, or upstream default mirror is added.
- [ ] #4 TASK-144.10 owns the fail-format-pass repository fixture; this task owns configuration only.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the installed Oxfmt version, current .oxfmtrc.jsonc, canonical Tailwind stylesheet, and cn entrypoint to confirm the supported native Tailwind v4 configuration keys.

2. Change only .oxfmtrc.jsonc to enable native Tailwind sorting with the canonical stylesheet and functions [cn], leaving className to native behavior and adding no custom rules or fallback tooling.

3. Verify Oxfmt accepts the configuration and preserves dynamic expressions while sorting representative static class strings and cn calls; run format, repository, module, type, lint, and frontend gates without adding the TASK-144.10 enforcement fixture.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.05 finalized at integration HEAD ef4ce5c. Configuration-only leaf: .oxfmtrc.jsonc and task record are owned; TASK-144.10 owns the fail-format-pass repository fixture.

Implemented `.oxfmtrc.jsonc` only. Oxfmt 0.65.0 local `configuration_schema.json` confirms native `sortTailwindcss` keys `stylesheet`, `functions`, and `preserveDuplicates`; native `className` is already built in and was not redundantly configured. Set stylesheet to `src/ui/theme/app.css`, functions to `["cn"]`, and preserveDuplicates to true so the existing cn duplicate-handling fixture remains intact.

Disposable probe evidence (`/tmp/oxfmt-tailwind-probe.tsx`): before static `className` and cn literal were `text-white px-4 hover:bg-blue-600 bg-blue-500 flex p-2`; Oxfmt output was `text-white px-4 hover:bg-blue-600 bg-blue-500 p-2 flex`. Template literal `` `text-white ${tone} px-4` `` and data-backed `data.className`/`data.classes` expressions remained unchanged and were not turned into invented classes. Duplicate probe `cn("flex flex", "items-center items-center")` remained byte-for-byte unchanged with preserveDuplicates.

Validation: `bun run fmt:check` passed; `bun run type-check` passed; `bun run lint` passed; `bun run test:repository` passed (130 tests); `bun run test:modules` passed (1042 tests); `bun run build:frontend` passed. Build retained existing missing `/assets/excalidraw.css` and large-chunk advisories. No TASK-144.10 fixture or protected file was changed.

Remediation after independent review: replaced unsupported `lineWidth` with schema-defined `printWidth` while retaining value 100. Direct disposable width probe with `/tmp/oxfmt-printwidth.jsonc` (`printWidth: 20`) wrapped the long `combine("one", "two", "three", "four", "five")` call, confirming the corrected key is active. Direct Tailwind re-review probe continued to sort static className and cn literals while leaving template and data expressions unchanged.

Remediation validation: `bun run fmt:check`, `bun run type-check`, `bun run lint`, `bun run test:repository` (130 pass, 0 fail), `bun run test:modules` (1042 pass, 0 fail), `bun run build:frontend`, and `git diff --check` all passed.
<!-- SECTION:NOTES:END -->
