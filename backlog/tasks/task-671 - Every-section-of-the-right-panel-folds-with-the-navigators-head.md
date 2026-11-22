---
id: TASK-671
title: Every section of the right panel folds, with the navigator's head
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T16:27:00Z'
updated_date: '2026-11-22T16:40:00Z'
labels:
  - frontend
  - ui
dependencies: []
ordinal: 1088000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner asked: flows and walkthroughs should be collapsed by default in the right panel, and all of its sections should be collapsible with the chevron at the right of the head, as in the navigator. A selected module's panel runs long (Interface, Implementation, lines, Flows, Walkthroughs, Code and evidence, history, legend), so a reader scrolls past lists they rarely need. The navigator already folds its sections with a head that is one button and a chevron at its end; the panel should use that same head, not a second one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every section of the right panel that holds something under its head has a head that is a keyboard-operable button with aria-expanded, and the fold chevron stands at the right end of the head, its ink on the edge where the rows' words and numbers end
- [x] #2 Flows and Walkthroughs start folded, Flows stays open while it holds the flow on screen, and every other section starts open
- [x] #3 A click or Enter on a head folds or unfolds its section, and a key in the head, such as Open in About or a trace toggle, keeps working without folding the section
- [x] #4 The navigator and the right panel draw their section heads with one shared component
- [x] #5 A browser test covers the folded default and the toggle; DESIGN.md says the panel's sections fold
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract the navigator's section head into shell/components/SectionHead.tsx, with useSectionFold in shell/hooks; the button stretches over the head so a key in the head sits before the chevron without nesting in the button.
2. ModelColumn.Section, ModelPanel.Section and the Against section use it. The panel's sections keep their fold in local state while the subject stays.
3. ContextList folds Flows (unless it holds the flow on screen) and Walkthroughs.
4. Shift the chevron so its ink, not its box, ends on the rows' edge, open or folded.
5. reader-context browser test checks the folded default and unfolds from the heads; DESIGN.md and the site mock updated.
6. Look in both themes; types, lint, format, browser owners.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence: agent-browser on examples/web-shop with Checkout API selected, both themes: heads report Interface/Implementation/Sends to/Receives from/Code and evidence/Legend/Relationships/Groups expanded=true and Flows/Walkthroughs expanded=false. Enter on the Flows head unfolded it; pressing Trace onward left Sends to expanded. Chevron ink right edge measured at 1584px for open and folded heads, equal to the count text's right edge; navigator 268px, equal to its facts edge. Screenshots in artifacts/task-671 (ignored).
Checks: bunx vp run types, lint:all, format:check pass. Browser owners pass through run-browser-lane --focus: reader-context, reader-column, canonical-model-comparison, canonical-model-selection, canonical-model-planning, reader-expand, canonical-model-modes.
Not folded: an Against section with no moved field has nothing under its head, so it keeps a plain label; the legacy 'Nobody has decided this yet' block (SidebarSection) keeps its own style.
Site audit: the hero mock's panel heads (Interface, Legend, Relationships, Groups) gained the chevron on the rows' edge; the mock navigator head now pads like its rows. site/scripts/paint.ts failed in this worktree because the shared refs/heads/archboard-history was written by a newer branch in a format main cannot read; the paintings were made from a clean clone instead.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every section of the right panel now folds from its head, as the navigator's sections do, and both columns draw that head with one shared SectionHead (shell/components) plus useSectionFold (shell/hooks). Flows and Walkthroughs start folded, except that Flows stays open while it holds the flow on screen; the rest start open. Keys in a head (Open in About, Trace onward/back, Show all, the standing chip) stand before the chevron and keep their own click. The chevron's ink ends exactly on the edge where the rows' numbers end, open or folded, which also fixed the same few-pixel inset in the navigator. DESIGN.md and the site's mock shell follow. Verified in both themes with agent-browser and through the browser owners; types, lint and format pass. Risk: a panel section's fold resets when the subject changes, by design.
<!-- SECTION:FINAL_SUMMARY:END -->
