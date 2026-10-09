---
id: TASK-383
title: The board tab of the pane sidebar is ordered by how a person reads a board
status: Done
assignee:
  - '@claude'
created_date: '2026-09-30 18:51'
updated_date: '2026-10-01 00:30'
labels:
  - ui
dependencies: []
priority: high
type: enhancement
ordinal: 713000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User direction 2026-09-30: the board details sidebar (the Board tab of the pane sidebar, TASK-249) needs a lot of attention to detail. Its sections (views, walkthroughs, groups, variants, legend, engine) are stacked without a hierarchy that follows what a person comes to the tab for, so the tab does not guide a first read or a return visit. The hierarchy must come from research into the use cases and into how a human reads a board, done before any redesign. docs/design/operator-canvas-shell.md, section "The pane sidebar", is the current visual authority and must be revised with the result.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Before the redesign, a written study names the tasks a person brings to the board tab, the order in which a person reads a board, and which element of the tab serves each task; the task notes link it
- [x] #2 The board tab orders and weights its sections by that study: position, heading, spacing and type role show each section's rank, and nothing on the tab lacks a task it serves
- [x] #3 Every section of the tab shares one alignment grid, one spacing scale and the shell type roles, in the light and the dark theme at 1920×1080
- [x] #4 Rendered captures of the tab before and after, in both themes, on the dogfood vault, replace the sidebar image in docs/design/assets and the pane sidebar section describes the new hierarchy
- [x] #5 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Research first: docs/design/pane-sidebar-hierarchy.md (use cases from the product and the boards, how people read a diagram with cited sources, an inventory of the tab with before captures, and the resulting hierarchy). Commit it before any layout change.
2. Shared sidebar parts: one heading role (body 12 px, 600, muted, sentence case), one row of choices (full name wraps, 16 px text column, fill 8 px beyond it), one region with a rule. Use them in both tabs, so the Selection tab loses its uppercase kicker labels too.
3. Board tab in four regions: (a) variants of a drilled board, the variant's summary, the changes against the variant it is read against with the picture's pins and counts and the marks control; (b) walkthroughs (present glyph, full name, steps, narrate), views (the showing view's summary under it), groups; (c) the legend of what the picture draws: kinds, relationships, emphasis and traffic samples; (d) the layout engine as one row at the foot. Drop the Selected sample, the Legend eyebrow and the empty groups sentence.
4. Tests: update the owners that pinned old copy or layout (legend text, empty groups) to structure; add owners for the summary, the changes key and its counts.
5. Browser check at 1920x1080 in both themes on the dogfood vault and the web shop example; replace docs/design/assets/semantic-pane-sidebar.png and revise the pane sidebar section of operator-canvas-shell.md.
6. bun run check, every lane.
No board proposal: the task changes the look of existing sidebar parts and adds no module, dependency or relationship a board draws.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Study: docs/design/pane-sidebar-hierarchy.md. Main findings: the variant summary is written on 17 of 18 boards and shown nowhere; 34 of 42 views carry a summary nobody sees; the comparison key is the last thing in the tab (below the fold on a draft) although a proposal's reader needs it first; the tab has eight text columns and six equal-weight sections with uppercase kicker headings (eyebrows). Order derived: what it is and changes, how to read it (walkthroughs, views, groups), legend, engine.

Built (commits 10ffd64f, c24cfb0c, 647e0d97):
- Board tab in four regions under rules: (1) drilled board's variants, the variant summary (no heading), Changes for a compared variant (the picture's pin per standing with counts, then the marks control; rows go while marks are off; 'Nothing differs.' when nothing does); (2) Walkthroughs (present mark, full name, step count on a second line, Narrate), Views (summary of the view on screen under it), Groups; (3) Legend of what the picture draws, samples for a heavier line and a streak instead of prose; (4) Layout engine row at the foot.
- Shared parts in SemanticSidebarParts.tsx (region, section, heading, choice list and row). Both tabs: text and tab labels at 16 px, headings 12 px semibold muted sentence case (no uppercase kickers), choices 28 px with the sidebar accent fill the navigator uses, long names wrap. Text lines: 16, 40 and 52 px.
- Removed: Selected sample, Legend eyebrow, 'No groups on this state.' (groups absent like views and walkthroughs), dead STANDING_COLORS.
- Found and fixed: the variant reading used resolveVariant, so a board with no current variant showed nothing of its draft in the tab; it now uses addressedVariant like the render route.
- Renderer exports standingMark so the change key draws the picture's pin.
- Tests: new semantic-board-tab owner (summary, view summary placement, unbuilt board, change counts); copy-pinning assertions replaced by structure; shell-layout browser owner now holds the sidebar heading role (600, 12 px, no transform).
- Follow-ups outside this scope: data-flow messages carry no kind, so the legend keys no message line there; the presented walkthrough's caption still uses an uppercase kicker.

Gate: bun run check passed on 647e0d97 (lint, fmt, both type-checks, build; modules 3735, system 189, repository 8, serial browser 18, no failures). Criteria left unchecked for the parent's review.

Review phase 1 applied (57668689, eae063ac, 54f372c5, c4a116be): S1 a view in which nothing differs keeps the control (new test); S2 spacing on the 4/8/16 scale (rows touch); S3 dogfood before/after in both themes committed and referenced; S4 doc sentence; T1 legend lines at the renderer's widths via lineWidth; T2 SidebarRow for every non-control row; T3 kept VariantReading.views with the reason recorded (the render answer's view is the semantic render and rasterize receipts' shape); T4 one name, comparison; T5 SemanticChanges exported first; T6 kicker comment; B3 chosen row takes the reading tone and the cobalt bar, hover half the tone. Phase 2 (merge main, draw variants with src/ui/variant-lifecycle) is blocked: the permission classifier refused git merge main in this worktree.

Review phase 2 (after the user merged main as 060c6795): 24cd23ed draws a drilled board's variants with src/ui/variant-lifecycle (VariantMark before the name, receding names muted unless on screen, variantOrder with the board's opens; lifecycle in title and accessible name; no Earlier row, reasons in the study); ead10a05 makes the shell doc one document (variants, reading tone and hover in both sections) and re-captures semantic-pane-sidebar.png. Checks: lint, both type-checks, semantic-board-canvas + shell + board-catalog + variant-lifecycle tests (197 pass), serial browser lane (18 pass).

Review (2026-10-01): standards, spec and a boundary review with TASK-384. Fixed: Changes kept its control in a view where nothing drawn differs (was a regression), spacing put on the 4/8/16 scale with the 5 px row padding recorded as the one exception, the dogfood before/after composite committed, legend lines drawn at the picture's widths via lineWidth, one SidebarRow box, one name for the comparison state, the chosen row marked with the navigator's bar and hover at half the reading tone, and the variant list drawn with src/ui/variant-lifecycle (VariantMark, variantRecedes, variantOrder) after main was merged in. Kept: the view summary is read from the board document, because the view schema is also the semantic render and semantic rasterize CLI receipts. Merged into main as 65875177. bun run check on main at 65875177: exit 0; modules 3739, system 189, repository lane, 18 serial browser owners, no failures.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The board tab of the pane sidebar is ordered by how a person reads a board, from the study docs/design/pane-sidebar-hierarchy.md (written before the redesign, 22 sources): what this variant is and what it changes (variants, the variant's summary, the change key), how to read it (walkthroughs, views with their summaries, groups), a legend of only what is drawn, and the layout engine at the foot. Both tabs share one frame: 16 px edge, sentence-case 12 px headings, 28 px rows, the reading tone and bar for the choice on screen, and variant lifecycle marks shared with the navigator. Also fixed: a board with no current variant showed nothing about its draft. Verified by the semantic-board-canvas tests (including semantic-board-tab and semantic-board-levels), the shell-layout browser owner, before and after captures in both themes, three reviews, and bun run check on main.
<!-- SECTION:FINAL_SUMMARY:END -->
