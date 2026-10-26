---
id: TASK-533
title: The shell layout test reads the technical face only once it is loaded
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T03:59:00Z'
updated_date: '2026-10-25T04:14:00Z'
labels:
  - test
  - flaky
  - browser
dependencies: []
priority: medium
ordinal: 929000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/system/browser/shell-layout.test.ts "the desktop shell keeps its visual contract across the canonical render matrix" failed twice in CI on 2026-10-25, on layers of the TASK-526 stack that change nothing in the frontend (PR #6 and PR #8), and passed when run again. Both times the sixth font check, document.fonts.check for 500 10px "Archboard DM Mono", was false. The matrix already awaits document.fonts.load for both DM Mono weights and document.fonts.ready before it probes (tests/system/browser/support/shell-render-matrix.ts), so a plain missing wait is not the cause. A flaky owner teaches people to re-run CI instead of reading a failure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The cause of the false DM Mono 500 check is found and named in the task notes, with evidence
- [x] #2 The test fails when a declared shell face does not load from this server, and does not fail while that face is loading
- [x] #3 The test passes in at least 20 consecutive local runs of the browser owner
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build a loop that runs the browser owner alone and goes red on the false DM Mono 500 check.
2. Trace the status and identity of the DM Mono faces through each step of a matrix cell.
3. Make the probe load each face that it reports, inside its own evaluation, and drop the redundant DM Mono loads from the wait before it.
4. Prove both sides of criterion 2 with injected faults, then run the owner 20 times in a row.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: a change of the emulated media (Emulation.setEmulatedMedia, and the detach that ends it) makes Chrome replace the page's CSS @font-face objects with new ones whose status is unloaded. A face that some text uses loads again at once. No text in the default shell uses DM Mono 500, so its new face stays unloaded until something asks for it. When the replacement lands after the matrix's load wait, document.fonts.check('500 10px "Archboard DM Mono"') is false.

Evidence:
- Under 16 busy CPU loops, 0 of 20 runs of the old owner failed, so load alone does not reproduce it.
- A trace of every cell showed the 500 face back to unloaded, as a new object, after each media change and after each detach, although the cell before loaded it.
- Appending a @font-face rule after the wait replaces the faces the same way. With it, the old probe failed on every run with the CI symptom, [true, true, true, true, true, false].

Fix: the probe now awaits document.fonts.load for each of the six faces, and a face counts only when the load gives back loaded faces. With the same forced replacement the owner passes. With a second, broken 500 face declared (src /missing-533.ttf), it fails with the same false sixth check. The wait before the probe keeps only document.fonts.ready, for the sizes that the probe reads.

Validation: 20 consecutive runs of bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/shell-layout.test.ts passed. Lint and format checks of the changed file pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The shell layout test read whether each shell face was loaded with document.fonts.check. A change of the emulated media replaces the page's CSS font faces with unloaded ones, and the DM Mono 500 face, which no text uses, then stayed unloaded, so the check was sometimes false in CI. The probe now loads each face and counts it only when the load gives back loaded faces. A forced face replacement made the old probe fail on every run and the new one pass. A broken 500 face makes the new probe fail. 20 consecutive local runs passed.
<!-- SECTION:FINAL_SUMMARY:END -->
