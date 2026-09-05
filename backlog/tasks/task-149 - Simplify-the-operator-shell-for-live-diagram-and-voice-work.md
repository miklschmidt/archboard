---
id: TASK-149
title: Simplify the operator shell for live diagram and voice work
status: Done
assignee:
  - '@codex'
created_date: '2026-09-04 22:09'
updated_date: '2026-09-05 00:38'
labels: []
dependencies: []
references:
  - docs/design/assets/operator-sidebar-reference.png
priority: high
ordinal: 288000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Before the real voice acceptance smoke, the user found decorative sidebar groups, navigation that reorders boards, and an agent drawer fragmented into many small panels. Restore the reference hierarchy so the person can follow live diagram work and speak about their selection without managing a dashboard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Board and variant navigation has stable ordering across navigation and writes, with compact meaningful rows.
- [x] #2 The agent drawer presents one clear conversation and composer with persistent voice controls; necessary configuration is available in an accessible settings modal and empty administrative panels are absent.
- [x] #3 Claims and current agent activity remain clear, board updates remain live, and agent work does not steal the user viewport.
- [x] #4 Rendered desktop light and dark, split panes, fullscreen voice controls and relevant automated checks verify the result.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the current shell and existing state contracts. 2. Remove decorative navigation and use stable name ordering. 3. Replace the workbench grid with a focused drawer and settings disclosure while retaining actionable approvals, queue, voice and claim state. 4. Verify rendered workflows and run the normal gate.

5. Refine sidebar row rhythm, grouping, header alignment and active/hover/focus states from rendered review; verify long names and variants at1080p in both themes. Commit the follow-up and rebase/rebuild the existing smoke worktree again.

6. Refine the top bar into board identity, operational status and lock sections; remove element counts/Live board copy and verify header status and claims through rendered workflows.

7. Refine the Agent drawer from the user screenshot: remove repeated status chrome and empty voice evidence panels, provide one clear connection action, and verify linked conversation plus active voice states.

8. Redesign Agent settings as a concise connection flow: start an agent or choose an existing conversation, separate account settings, and replace internal prerequisite prose with one actionable unavailable reason.

9. Repair the command authority bootstrap exposed by settings review at the shared transport boundary, preserving one-shot command identity and explicit selection; verify create and subsequent text actions without private browser lease setup.

Simplify the signed-out account flow, make ChatGPT first and default, widen Agent settings, and verify provider selection and reachable account actions through the rendered dialog before rebuilding the smoke worktree.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Inspection found navigator sorting by focused and on-screen board priority, and focused variant priority, rather than modified time. Replace with deterministic board name ordering and Current-first variant ordering. Existing board synchronization already separates element updates from explicit camera commands; preserve that contract. Browser regression assertions added for stable order and a claimed write reaching the rendered scene without changing viewport.

User confirmed 1920x1080 as the primary desktop design and acceptance target, replacing 1440x900. User also authorized rebasing the clean detached smoke worktree at /home/msc/.codex/worktrees/9ce9/archboard onto the verified UI commit, preserving its three smoke-procedure commits.

User requested wider navigation for long board names. Use a 280px sidebar and two-line names at the 1080p target; browser navigator fixture now includes a long architecture name. Flip is 4K hardware but 4K optimization is explicitly deferred.

User requested removal of the bottom status bar because it duplicates the top bar. Remove its rendering, dead styles, and grid row; browser workflow checks read the existing top-bar metadata and enforce absence of the footer.

Verified the final 1920x1080 UI in light/dark, split and fullscreen. Full normal serial browser inventory passes, including stable ordering/two-line long names, live claimed writes without camera motion, visible compact take-back errors, Settings Escape/focus return, controlled text and voice. Lint, formatting, type-check, 2513 module tests, 327 system tests and 123 repository tests passed; stale rendered assumptions from removed UI were corrected and the full browser lane rerun clean. The pre-existing untracked src-DlBR1tzg.js artifact was temporarily preserved outside the checkout for lint/format checks and restored byte-for-byte; no lint/type rules were weakened. Independent Astra review is clean. The existing composer fixture correction from the smoke worktree was cherry-picked as 7f30e5a4.

User review found the sidebar still visually unpolished. Reopened for a second visual pass on row spacing, grouping, active-board presentation, and navigation header alignment. Existing stable ordering, 280px width and two-line names remain requirements. Initial UI commit9e9b43ca was rebased into the clean smoke worktree, which currently serves its rebuilt frontend at3000; integrate the follow-up polish there too.

User also requested a top bar closer to the reference: separate board identity, status and claim/lock sections. Remove element count and the ambiguous Live board label. Preserve actionable persistence/conflict recovery and explicit lock visibility.

User reopened Agent drawer visual quality as part of TASK-149. Screenshot shows repeated voice status, open empty transcript/context grid, a separate connection/activity row, and a non-actionable connection prompt. UI worker owns this next pass after sidebar/header; parent owns rendered workflow checks.

User screenshot of Agent settings rejects the current modal as cluttered and technical. Moving existing panels into a modal was insufficient; the connection flow itself must be simplified. Preserve explicit thread selection and authority contracts while removing duplicate explanations and implementation vocabulary.

Rendered settings investigation confirmed a production bootstrap gap: UI commands require a command lease, but only voice Start acquires one and voice itself requires an executable thread link. Browser helper manually claimed through React internals, masking the failure. Correct the shared command authority path and remove that test-only setup so actual Start agent and subsequent commands work through visible controls.

User also flagged custom CSS and repeated components. Current shell.css is1607 lines and Shell.tsx1948; drawer does use shared Base UI Button/Dialog with Tailwind and components.json base-nova, but shell controls still duplicate styles. Consolidate touched controls/layout around existing primitives and delete obsolete CSS as part of this polish, without adding generic wrapper layers.

User explicitly calls out repeated raw button implementations, including sidebar. Replace touched sidebar and top-bar buttons with shared Button primitive, preserving accessible labels and distinct navigation state while deleting duplicated base interaction styling.

User identifies the sidebar study screenshot /tmp/codex-clipboard-981e6d46-2555-4540-8ffe-ad02f24817f8.png as the desired result and rejects fidelity of current render. Preserve its hierarchy, readable text and control scale, group disclosure, spacing, selection treatment, and Scratch placement at280px/1080p; compare actual screenshots rather than declaring CSS direction sufficient.

Direct DOM inspection exposed a shared Tailwind class-merge bug: vanilla twMerge retains custom p-panel/gap-region alongside overriding p-0/gap-0, so Agent DialogContent computes22px padding plus padded header despite requestingzero. UI worker will teach shared class merge canonical theme tokens and verify rendered spacing, replacing local override hacks.

User rejects Agent settings modal as not resembling configured shadcn dialog. Use actual configured shadcn/Base UI dialog composition and styling rather than custom nested surface/frame; preserve modal accessibility, focus and concise connection flow.

Saved the user-endorsed sidebar study as canonical visual input docs/design/assets/operator-sidebar-reference.png so future work can compare against the exact accepted design instead of reconstructing the conversation.

Final rendered QA found two additional shared causes: the cleared Tailwind theme omitted zero spacing, so m-0/p-0/min-h-0 generated no CSS; and executable links with no timeline were falsely projected as inspect-only. Restore explicit zero spacing and correct empty-history readiness with regressions. Remove idle timeline headers, unavailable empty queue and redundant ready announcements. The controlled production fixture also lacked canonical empty timeline/queue read responses; those are now provided.

Final follow-up verification: lint, formatting, both TypeScript projects, 2532 module tests, 327 system tests, 124 repository tests and the complete normal browser inventory pass. Browser owners were resumed after correcting outdated style selectors, shared-button typography expectations and an early focus observation; all owners have passing final evidence. Exact 1920x1080 settings and connected-drawer captures show compact spacing and an unclipped composer. Shared zero utilities and semantic class merging are covered; queue failure retains a compact Retry queue action. Independent Astra code review and final visual review are clear. No lint/type rules were weakened. This is the completed targeted cleanup; TASK-150 separately plans full legacy CSS removal and strict-lint restoration.

User screenshot exposed unreadable expanded Coordinator details: nested columns squeeze values to a few characters and repeat unavailable recovery prose per field. Reopened to simplify unavailable state and verify expanded available and unavailable settings at the actual dialog width.

Expanded Coordinator details repaired after user screenshot: deleted repeated unavailable fields and nested section columns, retained published and partial facts in full-width rows, constrained dialog height with fixed header. The rendered regression failed before the fix with a 25.59px value column; final 1920x1080 unavailable dark and populated light captures pass readability, overflow and viewport checks. Focused shell-layout and production text browser owners pass, 22 coordinator/frame module tests pass, lint, formatting, both TypeScript projects and 124 repository checks pass. Independent Astra review found no actionable issues.

User also reports most dialog text is barely readable. Increase settings typography for body copy, labels and title at normal desktop scale; verify computed rendered sizes instead of relying on token names.

Inspection against the official base-nova registry confirms local Dialog and Button replace shadcn typography with forced custom 12px body, 14px title and 13px controls, while theme reset removes standard Tailwind tokens. User rejects preserving these styles. Remove the proposed scoped font workaround; use standard shadcn typography for touched settings components and retain the separate full-migration strict-lint prerequisite.

Account follow-up complete: 640px dialog, ChatGPT first/default, state-specific account actions, full-width credential fields and no generic unsupported-method help dump. Removed forced legacy typography from shared Dialog/Button and tiny settings copy; restored standard Tailwind text-sm and text-base tokens rather than a local font override. Removed the legacy chip font override exposed by the broader control check. Rendered 1920x1080 checks verify first/default ChatGPT, provider switching, no idle Cancel/Sign out, 14px account copy, width and overflow. Shell, navigation, opener settings, text workbench, fullscreen and controlled voice browser owners pass. 90 focused tests plus chip test, lint/format/both TypeScript projects and 124 repository checks pass; independent Astra review clear. Full native-component and legacy-style migration remains TASK-150 with strict lint restoration first.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Polished stable 280px navigation, separated header status and ownership, replaced shell controls with shared Button and application icons with Remix, and simplified Agent settings and the conversation drawer. Fixed missing Tailwind zero utilities, semantic class merging, command authority preparation and false inspect-only empty history. Verified all normal check components and rendered desktop text/voice, focus, claims and camera behavior. Full legacy CSS replacement remains the separate user-requested UI rework.
<!-- SECTION:FINAL_SUMMARY:END -->
