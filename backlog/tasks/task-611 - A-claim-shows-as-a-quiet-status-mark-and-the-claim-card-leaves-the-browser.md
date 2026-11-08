---
id: TASK-611
title: A claim shows as a quiet status mark, and the claim card leaves the browser
status: Done
assignee:
  - '@claude'
created_date: '2026-11-08T21:25:00Z'
updated_date: '2026-11-08T21:54:00Z'
labels:
  - frontend
dependencies: []
ordinal: 1064000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The claim card dates from when a person could draw on the canvas. Take back control lets a reader end an agent claim, but the browser has nothing for a reader to edit, so the action does nothing useful for them. The owner wants claims shown as status only: a pulsing mark in the navigation and a badge on the selected subject when it is claimed. The server keeps claims, locks and its take-back route, and the CLI keeps its claim commands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A claimed model shows a pulsing mark in the repository switcher and on its row of the repository list
- [x] #2 A claimed module, flow or walkthrough row in the left column shows a pulsing mark
- [x] #3 The right panel head shows a Claimed badge only while the selected subject is claimed
- [x] #4 Each mark has an accessible name with the agent purpose, takes no focus and no click, and stops pulsing under reduced motion
- [x] #5 The marks leave when the claim ends
- [x] #6 The browser shows no claim card and no take-back control
- [x] #7 PRODUCT.md, DESIGN.md, README.md, the site, the agent docs and the vault describe claims as status marks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Delete ModelClaims.tsx, the take-back client, the About clearance hook and ABOUT_CLAIMS, the claim frames of the pane context, and the unused notice slot of the pane chrome.
2. Give the activity lamp an accessible name for a claim, with the purpose on hover, and reuse it as the one claim mark.
3. Mark the claimed model in the repository switcher and on its repository row, from the activity that the shell already holds.
4. Derive the claimed subjects of a current reading once in the reader, from the claims query, for the state that the reading shows. Mark module, flow and walkthrough rows from it.
5. Show a Claimed badge in the right panel head while a selected subject is claimed.
6. Rework the claims browser owner and the claim parts of the viewer and proposals owners. Run them focused.
7. Update PRODUCT.md, DESIGN.md, README.md, CONTEXT.md, frontend.md, test-suite.md, the site and the vault. Judge both themes with screenshots and audit the site.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Vault: Model access (vKEsyHFk/yejBBUFY#AIp6YN1P) now reads claims and applies live updates, and Pane chrome (vKEsyHFk/UOXNWLhR#kCxSbcFL) holds no claim. Relationships vKEsyHFk/yejBBUFY#6JBVcBmw and vKEsyHFk/yejBBUFY#5U5bpM9T lost the claim from their labels. These edits record implemented architecture, so they needed no proposal. The model package module (ov7pPg21) keeps take-back, because the server route stays.

Verification: lint:all, type-check, site build (astro check) and scripts/check-model.ts pass. bun test --parallel over apps/web/tests/ui/shell and apps/web/tests/ui/architecture-drawing: 505 pass. Browser lane, focused: canonical-model-claims (1), canonical-model-viewer (3), canonical-model-proposals (1) and shell-layout (1) pass. The look was judged with agent-browser screenshots in both themes and under reduced motion. The site audit covered the hero, the claim demo before and after release, and phone width.

Left open: the README take-back clip (README.md:243) and its recipe scripts/readme-assets/take-back.ts still show and click the removed control, so the recipe fails until the clip is filmed again. The refusal messages in packages/model/src/runtime/canonical/edit/operations/claims.ts:117 and :347 still tell agents to ask for a take-back.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The browser no longer shows the claim card or Take back control. A claim now shows as status: a pulsing Live Lime dot after the claimed model in the repository switcher and on its repository row, a dot on each claimed module, flow and walkthrough row, and a Claimed badge in the right panel head while the selected subject is claimed. Each mark names the purpose on hover and to assistive technology, takes no click or focus, and stands still under reduced motion. The server, the model package and the CLI keep claims, locks and the take-back route. Docs, the site demo and the vault describe the marks. Follow-ups: film the README take-back clip again, and reword the model refusal messages that still mention a take-back.
<!-- SECTION:FINAL_SUMMARY:END -->
