---
id: TASK-144.12
title: Require the Archboard aesthetic guide for UI agents
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:38'
updated_date: '2026-08-31 02:29'
labels: []
dependencies:
  - TASK-144.09
references:
  - docs/design/archboard-ui-aesthetics.md
modified_files:
  - AGENTS.md
parent_task_id: TASK-144
priority: high
type: task
ordinal: 234000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the durable agent-facing link from `AGENTS.md` to the Archboard UI aesthetic guide. The link tells future UI workers when the guide is mandatory without copying framework defaults or visual rules into a second source.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AGENTS.md requires every UI-design or UI-implementation worker to read docs/design/archboard-ui-aesthetics.md before changing rendered Archboard UI.
- [x] #2 The instruction names the TASK-140 reference/mockup and the guide as visual authority while keeping code boundaries and verification in their existing documents.
- [x] #3 This leaf changes only the durable link; TASK-144.16 owns automated enforcement and neither task duplicates Tailwind, shadcn, Base UI, Oxfmt, or Oxlint defaults.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the new aesthetic guide, TASK-140 authority references, and the existing AGENTS.md documentation map. 2. Add the smallest durable instruction that makes the guide mandatory for rendered UI design and implementation without duplicating framework, boundary, or verification rules. 3. Add stable repository-policy enforcement only if TASK-144.12 itself already owns it; otherwise leave automated enforcement to TASK-144.16. 4. Run focused formatting, link, diff, and repository-policy checks and submit the exact range for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.09 completed and released this dependency-ready leaf at integration HEAD 73b849a. The lane owns AGENTS.md only and is path-disjoint from all active implementation and review lanes.

Implemented in commit a624b84. Added the durable AGENTS.md rule requiring UI-design and UI-implementation workers to read docs/design/archboard-ui-aesthetics.md before changing rendered UI; named the TASK-140 operator canvas shell reference and light/dark mockup plus the guide as visual authority; preserved existing code-boundary and verification ownership; left automated enforcement to TASK-144.16. Focused validation: git diff --check; bunx oxfmt --check AGENTS.md; referenced authority files present.

Root integration and finalization evidence (2026-08-31):
- Independent complete-range review returned REVIEW_CLEAN at exact worker HEAD e0643d0c10d86bf70915d652b6d04bce8581008f.
- Integrated the review-clean range as fe570c6 and d316b13 on the orchestration branch.
- Scope is exactly AGENTS.md plus this task record. AGENTS.md now requires every UI-design or UI-implementation worker to read docs/design/archboard-ui-aesthetics.md before changing rendered Archboard UI, names the TASK-140 operator canvas shell reference/light-dark mockup and the guide as visual authority, and leaves detailed framework, boundary, and verification rules in their existing owners.
- Focused validation passed: bunx oxfmt --check AGENTS.md; git diff --check; all named local guide, reference, mockup, and boundary paths resolve.
- No automated enforcement was added; TASK-144.16 retains that ownership. No rendered or executable code changed, so module, system, and browser execution do not apply to this link-only leaf.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the durable root-agent instruction that makes the Archboard aesthetic guide mandatory before rendered UI work, names the TASK-140 reference and guide as visual authority, and preserves automated enforcement for TASK-144.16.
<!-- SECTION:FINAL_SUMMARY:END -->
