---
id: TASK-116
title: Keep binding-derived links out of board notes
status: Done
assignee:
  - '@codex'
created_date: '2026-08-24 12:46'
updated_date: '2026-08-24 13:05'
labels: []
dependencies: []
type: bug
ordinal: 118000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bound architecture elements must persist only their portable code address: repository identity, repo-relative path, branch, and commit. A clickable target is presentation derived from that binding and the current machine context; persisting file URLs makes the vault machine-specific and teaches agents to repeat the mistake.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A bound element written to an Excalidraw note contains its portable customData.archboard.binding and no binding-derived link
- [x] #2 Local file links are derived from the binding and machine-local checkout registry only when elements are presented to a browser or caller
- [x] #3 The presentation boundary can later choose a different target such as GitHub without changing the persisted board schema
- [x] #4 Agent-facing guidance clearly forbids supplying or persisting file URLs for code bindings and distinguishes portable metadata from derived presentation
- [x] #5 Regression checks prove note portability and presentation behavior without weakening unrelated human-authored links
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile ADRs, contributor invariants, and the consumable archboard skill around one contract: portable binding is persisted; code-link target is derived presentation.
2. Add one presentation boundary so bound elements are serialized without derived links and outward browser/API documents receive a target resolved from the local checkout registry.
3. Add focused regression coverage for persisted note contents, derived presentation, and round trips while preserving unrelated links.
4. Sync the tracked skill, run focused checks, then run the required suite proportionate to touched server/browser paths.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a non-mutating presentation boundary. The canonical write path strips link from every bound element before normal note writes, held writes, and snapshots; note rendering repeats the guard after Excalidraw normalization. Outbound API, WebSocket, selection, pane, snapshot, and export reads derive a local file URL from the portable binding and checkout registry. Unbound human-authored links remain ordinary persisted Excalidraw data. Updated ADRs, contributor docs, install guidance, and both tracked Archboard skills; synced derived skill copies.

Validation: bun run type-check passed; test:repos passed with raw-note, derived-read, manual-bound-link, and unbound-web-link assertions; test:one-write and all checks before test:boards passed in the full chain; test:branch, test:side-by-side, test:install, test:parity, test:staleness, test:hot, test:version passed; test:browser, test:typing, and test:live-session passed sequentially in headless Chrome. test:boards passed every assertion except the two pre-existing case-collision checks, which the user explicitly asked to ignore.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Bound elements now persist only customData.archboard.binding. Machine-local code links are derived on outbound read from the checkout registry and stripped at every canonical write/storage boundary, while unrelated human-authored links still round-trip. Agent-facing guidance now states the same contract and explains that absolute paths are input only. Focused, held/snapshot, and real-browser validation passed; only the two user-excluded pre-existing case-collision assertions remain red.
<!-- SECTION:FINAL_SUMMARY:END -->
