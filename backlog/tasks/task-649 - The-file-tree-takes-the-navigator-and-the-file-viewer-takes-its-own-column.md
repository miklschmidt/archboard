---
id: TASK-649
title: The file tree takes the navigator, and the file viewer takes its own column
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T00:32:00Z'
updated_date: '2026-11-19T03:43:00Z'
labels:
  - frontend
dependencies:
  - TASK-648
ordinal: 1087000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code browser of TASK-648 sits inside the pane, beside the picture, and a Code key in the pane heading opens it. The person asked for the navigator to become the file tree, switched by a Code / Architecture toggle in the agent dock row where Talk is, with Talk as an icon key like the conversation key. The file viewer becomes its own column beside the navigator, like the conversation, so the pane's canvas with its rounded corners stays untouched. The conversation column, and the new viewer column, draw their line on the left (between the column and the navigator) and no line on the right.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Code / Architecture toggle in the agent dock row switches the navigator between the reading's lists and the file tree of the focused pane; the choice persists in the browser
- [x] #2 The Talk key in the calm dock is an icon key the size of the conversation key, with its name for assistive technology, and still turns into the voice circle
- [x] #3 In Code mode the file viewer is its own resizable column beside the navigator, outside the pane; the pane heading has no Code key and the canvas is unchanged
- [x] #4 The conversation column and the viewer column draw one line on their left edge and none on their right edge; dragging still resizes them
- [x] #5 Opening a file, picking a bound module and the symbol buttons behave as in TASK-648
- [x] #6 DESIGN.md, the frontend guide, the site's hero mock and the canonical architecture model describe the new places
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Own the navigator mode (architecture or code) in a use-navigator-mode hook beside use-agent-panel: kept in localStorage, and Code on load when the address names a file. Pass it to the shell, and through PaneColumn to the focused pane with a viewer slot.
2. Generalize ConversationColumns into one SideColumn and nest the viewer column outside the conversation column. Draw each column's line as a 1px before: on its left edge, give the handles the chrome tone at rest, and give the shut viewer's handle no width so the stage keeps STAGE.width.
3. In code mode the reading portals the code tree into the navigator's destinations and the code view into the viewer slot. Delete CodeKey, CodeBeside, use-code-open and the codeOpen props. The code view's path head becomes the column's 40px chrome row.
4. AgentDock takes a neutral lead slot, drawn last in head while calm and last in under while live. The app passes the Code / Architecture switch there. The Talk key shows only its icon, with its name as label and title.
5. Move ModelSwitch to shell/components as ChoiceSwitch for both switches.
6. Update DESIGN.md, the frontend guide, the site mocks, the proposal and tests; check both themes in the browser.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified in the browser at 1920x1080 in both themes: the Architecture / Code switch at the dock's foot swaps the navigator's lists for the file tree; the code view opens as its own column between the navigator and the conversation; opening edit.ts focuses its two owners and the Edit entry key scrolls to editArchitectureModule; the conversation and code view columns draw one full-height line on their left edge and none against the canvas (the line first sat under the conversation header, fixed by raising it above the header). Checks: types, lint:policy, lint:tests, lint:css, format:check, test:repository, test:modules (5123 pass), the browser lane for shell-layout and voice-box, and archboard check code --state 3rxaeOO6 pass. A pane address keeps its file in Architecture mode, recorded in docs/agents/frontend.md.

The site's hero window mock drops the Code key and shows the dock's new row (a2dd2ec0b); the site build passes. No site mock shows the conversation column.

After review in the browser: the agent's card is gone, so the agent stands on the chrome under a line and the dock's row has the column's width. The worded Architecture/Code switch is 32px tall, like the keys. The status line is as tall as its Stop, Show or Review key (28px), with 4px under it. The unused card tokens (--raised mapping, --elevation-tray) were removed. The file tree paints on the column's tone, so a long name's middle ellipsis covers the letters it hides.

Follow-up in the same branch: reading problems are shell toasts, one per pane (a failed read under a kept picture with Retry and its code, a lost server, an unconfirmed reading), and a failed repository listing is a toast with Retry, also in the start chooser. A toast's close key sits in its corner. The left column keeps 8px to its edges, and the code view wraps long lines and stops 8px before the picture. Reviewed with sol-loop, 3 rounds with gpt-6.2-sol (high): round 1 took 21 of 35 findings, round 2 took 7 of 12, round 3 found a regression from round 2, which was reverted. Declined: browsing other repositories in the tree (scope), Windows paths, symlinks, 1280px layouts (the product targets 1920x1080), and other rare paths.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The file tree now takes the navigator in Code mode, chosen by an Architecture / Code switch at the start of the agent dock's key row, where Talk became a 32px icon key. The open file shows in its own resizable column between the navigator and the conversation, so the pane's canvas is untouched; the old Code key and in-pane panel are gone. One SideColumn component now draws the code view and the conversation, each with a full-height line on its left edge and none against the canvas. The mode is one per window, kept in the browser, and a link with a file starts in Code; Architecture keeps the file in the address, which the frontend guide records. DESIGN.md, the frontend guide, the site's hero mock and proposal 3rxaeOO6 describe the new places. All checks pass, including the shell-layout and voice-box browser tests.
<!-- SECTION:FINAL_SUMMARY:END -->
