---
id: TASK-611
title: A claim shows as a quiet status mark, and the claim card leaves the browser
status: Done
assignee:
  - '@claude'
created_date: '2026-11-08T21:25:00Z'
updated_date: '2026-11-08T22:35:00Z'
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

Review fixes: keep the Claimed badge tied to the selected subjects in mixed selections and flow readings. Correct any remaining reader take-back refusal. Use focused browser and model owners, both-theme inspection, and the site audit. These fixes keep the same owners, interfaces, and relationships, so no architecture proposal is needed.

PR #74 review: reproduce a claim on the retained scope of an unclaimed flow. Make the empty-selection badge follow the flow before the module. Cover open module claims in the existing browser owner and align the reader guidance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Vault: Model access (vKEsyHFk/yejBBUFY#AIp6YN1P) now reads claims and applies live updates, and Pane chrome (vKEsyHFk/UOXNWLhR#kCxSbcFL) holds no claim. Relationships vKEsyHFk/yejBBUFY#6JBVcBmw and vKEsyHFk/yejBBUFY#5U5bpM9T lost the claim from their labels. These edits record implemented architecture, so they needed no proposal. The model package module (ov7pPg21) keeps take-back, because the server route stays.

Verification: lint:all, type-check, site build (astro check) and scripts/check-model.ts pass. bun test --parallel over apps/web/tests/ui/shell and apps/web/tests/ui/architecture-drawing: 505 pass. Browser lane, focused: canonical-model-claims (1), canonical-model-viewer (3), canonical-model-proposals (1) and shell-layout (1) pass. The look was judged with agent-browser screenshots in both themes and under reduced motion. The site audit covered the hero, the claim demo before and after release, and phone width.

Left open: the README take-back clip (README.md:243) and its recipe scripts/readme-assets/take-back.ts still show and click the removed control, so the recipe fails until the clip is filmed again. The refusal messages in packages/model/src/runtime/canonical/edit/operations/claims.ts:117 and :347 still tell agents to ask for a take-back.

Review of 2ceca8bcf..d160f8feb: fixed remaining release refusal guidance, missing badges on mixed selections and flow collections, and a claimed flow marking an unclaimed participant. The claim mark now reuses ActivityLamp inside a still Status Foreground rim on chalk. Existing panel heads and subject classification own these cases. No module or relationship changes. Browser owners claims, viewer, proposals, shell-layout and reader-context pass. Focused unit owners: 15 pass. Backend claim/news owner: 5 pass. Lint and both TypeScript projects pass. Both themes and reduced motion inspected with agent-browser on port 3489. Site paintings and diagrams regenerated, and the site build passes with no Astro warnings. Diagram changes contained only allocated sample identities and were restored. The README clip and recipe remain deferred as requested.

Final review validation: the expanded claims browser owner passes in 3.2 seconds, including a selected flow collection. The final lint and TypeScript runs pass. Architecture semantics pass with no diagnostics. The architecture code pass has no warnings, with existing informational findings and skipped evidence: 82 unknown exposures, nine unbound subjects and one text-only checkout. Site demos include all four walkthrough beats, each grammar, each evidence tab, proposal choices and claim release. Headless Chromium leaves the WebGL hero blank, which limits that visual inspection. The existing frontend build reports large bundle chunks. These evidence limits and the deferred README media remain outside this review. All private browsers and servers stopped. The final simplification pass retained the existing panel head, subject classification and activity lamp owners.

Review of a185b0379..11fadf922: a claim on a retained module scope marked an unclaimed flow. The new browser assertion failed on the original code. The badge now reads the flow identity before the module identity, as the existing panel head does. Model reading (vKEsyHFk/yejBBUFY#n2ONtqdt) keeps its existing ownership and interfaces, so no architecture proposal is needed.

PR #74 review evidence: the new claims assertion failed before the fix and passed after it. All six requested browser owners pass through run-browser-lane.ts. The install, build, lint:all, both TypeScript projects, formatting, site build and architecture semantics pass. Browser inspection covered both themes, empty architecture, missing line and group sections, hidden lines, Show all, the pressed Filter state and keyboard focus. Site paintings and diagrams were regenerated. Only newly allocated subject identities differed in the tracked diagrams, so those files were restored. The site audit covered the window mock, drill-down, all grammar and evidence tabs, proposal choices, claim release and four walkthrough beats. Headless Chromium limits inspection of the WebGL hero. The existing bundle-size warning stays outside this review. Evidence is in /tmp/archboard-review74. The final simplification pass keeps the existing owners and uses one subject identity for the empty-selection badge.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The browser no longer shows the claim card or Take back control. A claim now shows as status: a pulsing Live Lime dot after the claimed model in the repository switcher and on its repository row, a dot on each claimed module, flow and walkthrough row, and a Claimed badge in the right panel head while the selected subject is claimed. Each mark names the purpose on hover and to assistive technology, takes no click or focus, and stands still under reduced motion. The server, the model package and the CLI keep claims, locks and the take-back route. Docs, the site demo and the vault describe the marks. Follow-ups: film the README take-back clip again, and reword the model refusal messages that still mention a take-back.
<!-- SECTION:FINAL_SUMMARY:END -->
