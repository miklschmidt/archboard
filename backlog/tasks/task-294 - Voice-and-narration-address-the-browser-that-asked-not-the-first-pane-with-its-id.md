---
id: TASK-294
title: >-
  Voice and narration address the browser that asked, not the first pane with
  its id
status: Done
assignee:
  - '@claude'
created_date: '2026-09-22 00:22'
updated_date: '2026-09-22 00:35'
labels:
  - bug
  - voice
dependencies: []
ordinal: 514000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two browsers can hold the same canvas at once (2026-09-22: Chrome and the ChatGPT desktop app, each presenting pane A). The server resolves a pane by its shell id with the first registration that matches, so after a canvas restart in which the other browser reconnected first, pressing Narrate looked for the walkthrough on that browser's board and refused with 'The pane is not showing a board that states that walkthrough', which the UI reports as 'Realtime negotiation was unavailable or failed'. Every request already carries the exact client id of the pane it came from (the command context's browserId is the pane's client id), and a voice session is started from one browser. Lookups by shell id: walkthrough-narration paneShowing, pane-presentation paneFor, canvas-codex-host operationPane, codex-semantic-input contextPane. The voice and narration path is the one that failed; the workhorse-context lookups are the same class and are listed so a follow-up can judge them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Starting narration from a browser whose pane id another connected browser also presents narrates the board that browser is showing.
- [x] #2 present_step and a by-hand step or leave are resolved against the browser the voice session was started from; the other browser's pane of the same id is neither moved nor heard.
- [x] #3 A regression covers two live registrations sharing one pane id, and fails on the by-id lookup.
- [x] #4 The canvas log names the client when a pane is registered or shown, and warns when a second live browser registers a pane id another live browser holds.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. walkthrough-narration: bind the voice session's browser (client id) at every voice start; resolve the narrated pane, present_step and by-hand changes through that client id; a change from another browser's pane of the same id is not narration news. 2. pane-presentation: present() addresses a pane by client id (panes.get), never the first shell id match. 3. present-walkthrough-step: PresentedPane carries the client id and present() is asked with it. 4. codex-workbench-realtime-actions: pass the command's browserId (the pane's client id) into narration. 5. pane-show-route / pane-routes: log the client id, warn when a second live browser registers a pane id another live browser holds. 6. Unit tests updated; one vault-backed regression with two registrations sharing pane id A, proving the fix by failing on the by-id lookup. 7. Lanes touched: module, system, browser.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis from the running canvas (read-only): /api/voice/start-trace showed one attempt at 2026-09-22T00:09:33Z, pane A, narration true, preconditions all ready, failed at 2 ms with 'The pane is not showing a board that states that walkthrough.' /api/panes listed two registrations with paneId A: A-5idljx (Chrome, iis ingress migration, whose walkthrough was chosen) and A-3cufid (a socket owned by the ChatGPT desktop app's Electron network service, registered first after the restart, showing auditlog timestamp integrity). paneShowing('A') took the first match. The Codex log holds no thread/realtime/start for the attempt: it never got that far. Fix: the voice start binds the pane id to the command's browserId (the pane's client id); narration, present_step and by-hand changes resolve through that binding; the presentation port and the present route take a client id; the show route logs the client id and registration warns when a second browser holds a pane id.

Verified: focused owners (walkthrough-narration-two-browsers, pane-presentation, present-walkthrough-step, realtime actions) pass; bun run lint, fmt and type-check clean; module lane 3453 pass, system lane 169 pass, browser lane 19 pass (the narration owner first caught the present route answering 400 for an unnamed pane; it now keeps the 409 no_pane contract with the resolver's words). AC1 and AC2 are proven by the regression, which registers the other browser's pane A first; AC4 by the show-route line and the registration warning, which no test locks down (wording). Not exercised with real voice: the user's session on the running canvas will be the proof.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A voice session now binds the shell pane id to the client id of the pane in the browser it was started from; narration, present_step and by-hand changes resolve through that binding, the presentation port and the present route address a pane by client id, and two browsers holding one pane id are logged. Cause: the ChatGPT desktop app held a pane A beside Chrome's and registered first after a restart. Verified by a two-browser regression plus the module, system and browser lanes.
<!-- SECTION:FINAL_SUMMARY:END -->
