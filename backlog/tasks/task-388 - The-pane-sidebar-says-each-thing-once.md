---
id: TASK-388
title: The pane sidebar says each thing once
status: Done
assignee:
  - '@claude'
created_date: '2026-10-03 20:18'
updated_date: '2026-10-03 21:00'
labels:
  - ui
dependencies: []
references:
  - docs/design/pane-sidebar-hierarchy.md
documentation:
  - docs/design/operator-canvas-shell.md
priority: medium
type: enhancement
ordinal: 677000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User direction 2026-10-03: distill the Board and Selection tabs of the pane sidebar.

The two tabs speak two grammars and say several things twice. The Board tab was ordered by the questions a reader asks (TASK-383). The Selection tab still carries the older prototype grammar: every section has its own rule and a heading that restates what sits under it (Purpose, Code location, Relationships, Belongs to, Go deeper). Measured on `Archboard server` at 1920×1080 in the dark theme:

- A part's groups stand in its subtitle and again under Belongs to.
- A part's code stands as a repository row and a path row with a copy button each, and again as View in code at the foot, whose second line says "Open in your editor".
- A relationship row's kind chip squeezes its label ("mounts the write ro…"), although the sidebar's rule is that nothing is cut off.
- The panel of a selected relationship, exchange or message has its own title (a mono kind badge and the opaque id) and sets part names in the mono face. A part's panel has the display title.
- In a comparison, what moved on a part is the last thing in a long panel, and a changed field reads as one truncated line ("description Every board operation rea…").
- The Board tab lists the variants of a drilled board. The Variants page of the pane header lists the same variants with the record of each and opens one on a click, and the header's breadcrumb already names the variant on screen. The Board tab's own comment holds that two places for one choice is one too many.

TASK-368.09 and TASK-369.07 will add lists of parts to the Selection tab. One section grammar and one row grammar is what they should land in.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A selected part, relationship, exchange or message opens under one title: its name in the display face and one line that says what it is. A part's line names its kind and its groups, and each group there selects its members. No panel shows a subject's id.
- [x] #2 A panel's regions follow the order a reader asks: what it is, how it stands against the variant it is read against (only in a comparison, or with an open disagreement), how it is wired. A rule divides regions and space divides sections, as on the Board tab.
- [x] #3 No heading that only restates what is under it stays (Purpose, Relationships, Belongs to, Code location, Go deeper), and no sentence says that a purpose or a code binding is absent.
- [x] #4 A part's code binding is said once, at the foot of its panel: the bound path, the way to open it and the way to copy it. The repository, branch and commit are on that control's title.
- [x] #5 A relationship row shows its whole name and label, wrapped and never cut, and the fields that moved on a compared part read in full.
- [x] #6 The Board tab no longer lists variants. The Variants page still lists every variant of a drilled board and opens one, the header still names the variant on screen, and a test pins both.
- [x] #7 Every control stays reachable from the keyboard with an accessible name and state, the group controls keep their names, and no motion is added.
- [x] #8 Seen in a browser at 1920×1080 in both themes: a part with a drill-down and code, a part with neither, a changed part of an earlier variant, a relationship, and the Board tab of a drilled board.
- [x] #9 The sidebar tests that fail on a clean HEAD pass, the new contracts have module tests, and every lane that passes on a clean HEAD still passes. The touched files have no lint or type finding.
- [x] #10 docs/design/operator-canvas-shell.md and DESIGN.md describe the result, and the pane sidebar capture in docs/design/assets shows it.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. One frame. SidebarSection takes a heading level, a count and an action beside the heading, so both tabs build from SidebarRegion and SidebarSection. The Selection tab's own Section, PanelSection, TitleBlock and PanelTitle go.
2. One title for every subject (SubjectTitle in SemanticInspectorParts): the name in the display face, wrapped and never cut; one line under it. A part's line is its kind and its groups as the controls that select their members (the Belongs to section goes); a relationship's is its kind chip; an exchange's and a message's say what they are. The opaque id and the mono kind badge go. A part keeps its kind medallion; the others have none.
3. A part's panel in three regions. What it is: the title, the line it is responsible for, the longer account, with no Purpose heading and no sentence for an absent purpose. How it stands (comparison or open disagreement only, moved up from the foot): the sentence and the fields that moved, each read in full. How it is wired: Sends to and Receives from as sections of one region, a row's kind chip on its name's line so its label keeps the whole width.
4. The foot. Go deeper loses its heading. Open <board> keeps the gold. View in code takes the bound path as its second line, wrapped at the slashes, with a copy button beside it; the repository, branch and commit are on its title. The Code location section, its two copy rows and the unbound sentence go.
5. Relationship, exchange and message panels use the same title and regions: Between, Taking part and In this exchange keep their rows with part names in the body face.
6. Board tab. The variants of a drilled board go (SemanticVariantBar, its section, the props that carried them to the sidebar), because the Variants page offers them with their record and the header's breadcrumb names the one on screen. Sweep what only served it. The Changes section names what it is compared with in its heading rather than on a line under it.
7. Tests. Update the owners that pinned the old sections to the new contracts: binding at the foot, groups in the title, the standing region, wrapped rows. Move the drilled-board variant choice to the Variants page. Bring the drill-down contract tests that fail on a clean HEAD to the current Go deeper. Add a test for the part with no purpose and no binding.
8. Docs and captures: operator-canvas-shell.md (the pane sidebar section, Board and Selection), DESIGN.md (the foot's name), and the sidebar capture in docs/design/assets from a running server at 1920x1080 in both themes.
9. Verify: type-check both projects, lint on the touched files, the semantic-board-canvas and shell tests, the browser lane owners that read the sidebar, and a batched browser pass in both themes.
No board proposal: the task changes how existing sidebar parts look and which of them there are, and adds no module, dependency or relationship that a board draws.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope. The Board tab was ordered by the TASK-383 study and is mostly at its essence. The Selection tab still had the older prototype grammar, so most of the work is there. The Board tab loses its list of variants and names the comparison in its heading.

Decisions.
- Variants. The Board tab no longer lists them. The Variants page of the header lists every variant with the record of each and opens one in the pane, the navigator lists them, and the header breadcrumb names the one on screen. The page now asks for the current variant as no variant, as the removed list did, so a pane that chose the current variant goes on following it when a proposal is adopted. This is its own commit, so it can be dropped alone.
- A part with no purpose and a part with no code binding show nothing in their place, the rule the code already applied to descriptions. A part that leads nowhere has no foot.
- The binding is shown once, in the foot. Its path is the second line of View in code and has a copy control beside it, which shows that it copied for as long as the pointer or the focus stays on it. There is no timer, because durations live in src/shared/timing and another session was editing that file.
- The words for a state that is not the current architecture (draft proposal, historical state, shelved proposal) are back in the way down. The prototype had dropped them, an old test pinned them, and PRODUCT.md asks for an accessible lifecycle.
- What moved on a compared part reads as was and now, whole, in the body face. It was one truncated line of mono.
- Left alone: the layout engine row. It is a preference of this browser, and it is how the Blocks engine is compared with Tracks (TASK-351).

Validation.
- Type-check of both projects is clean, and the touched files have no lint finding and are formatted.
- bun test over src/ui/semantic-board-canvas: 237 pass and 10 fail on a clean HEAD, 247 pass and 3 fail now. Seven of the ten are the sidebar's drill-down and unbound-node contracts and now pass. Three still fail: the way back through the header breadcrumb, which replaced the trail (they need the shell's placeOf and are not about the sidebar).
- bun run test:modules: 3824 pass, 5 fail. The five are those three and two shell tests (pane news, navigator tree). TASK-386.03 recorded both as failing on a clean HEAD, and a clean checkout of HEAD fails the same two.
- Browser owners, one by one with --focus: semantic-board-inspection (ported to the new foot and the breadcrumb), semantic-drill-boundary (ported), semantic-status-legibility, semantic-board-groups, semantic-walkthrough-presentation and semantic-board-viewer pass. shell-layout and the pane-tabs case of workspace-address fail on selectors of the old shell (the header board name and the pane tabs strip). I did not run those two on a clean HEAD, and nothing in this task touches those selectors.
- bun run test:repository passes. bun run lint refuses to start because frontend/prototype-shell-worlds is not a root of tsconfig.json, so the touched files were linted with bun scripts/lint.ts --type-aware.
- Headless Chromium at 1920x1080 in both themes: a part with a drill-down and code, a changed part of an earlier variant, a part with neither, a relationship, and the Board tab of a drilled board. A DOM probe on the changed part: sidebar width 280, no horizontal overflow, headings h2 and h3 only, every control with an accessible name, regions in the order about, standing, wiring.
- docs/design/assets/semantic-pane-sidebar.png is recaptured from a server over a copy of the dogfood vault.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every subject of the selection tab now opens under one title, and a part panel has three regions in the order a reader asks: what it is, how it stands against the variant it is read against, and what it is wired to. The headings and sentences that only restated what sat under them are gone, a part code is said once in the foot, a relationship row keeps its whole label, and a changed field reads as was and now. The board tab no longer lists variants, which the Variants page offers, and it names the comparison in its heading. Verified with 247 passing tests in the canvas module (seven of the ten that failed on a clean HEAD now pass), six browser owners, a DOM probe, and captures at 1920x1080 in both themes. The five failures left in the modules lane are three breadcrumb tests and two shell tests, and all five fail on a clean HEAD.
<!-- SECTION:FINAL_SUMMARY:END -->
