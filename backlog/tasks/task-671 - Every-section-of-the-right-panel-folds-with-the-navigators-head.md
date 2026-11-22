---
id: TASK-671
title: Every section of the right panel folds, with the navigator's head
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-22T16:27:00Z'
updated_date: '2026-11-22T16:27:00Z'
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
- [ ] #1 Every section of the right panel has a head that is a keyboard-operable button with aria-expanded, and the fold chevron stands at the right end of the head
- [ ] #2 Flows and Walkthroughs start folded; every other section starts open
- [ ] #3 A click or Enter on a head folds or unfolds its section, and a key in the head, such as Open in About or a trace toggle, keeps working without folding the section
- [ ] #4 The navigator and the right panel draw their section heads with one shared component
- [ ] #5 A browser test covers the folded default and the toggle; DESIGN.md says the panel's sections fold
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract the navigator's section head (button, SectionLabel, summary, chevron at the end) into shell/components/SectionHead.tsx; the button stretches over the head so an action in the head (Open in About, trace toggles, a standing chip) sits before the chevron without nesting in the button.
2. ModelColumn.Section uses it unchanged in look.
3. ModelPanel.Section uses it, holds its fold in local state, and takes a folded default; ContextList passes it for Flows and Walkthroughs. The Against section (StandingBlock) uses it too.
4. Update browser tests that click panel flow/walkthrough rows to unfold first; add a test for the folded default and toggle.
5. DESIGN.md right panel paragraph; site mock audit.
6. Look in both themes with agent-browser; types, lint, format.
<!-- SECTION:PLAN:END -->
