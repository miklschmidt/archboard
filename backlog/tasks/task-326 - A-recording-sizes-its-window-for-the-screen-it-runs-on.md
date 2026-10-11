---
id: TASK-326
title: A recording sizes its window for the screen it runs on
status: Done
assignee: []
created_date: '2026-09-24 01:27'
updated_date: '2026-10-11 14:23'
labels:
  - recording
dependencies: []
priority: medium
type: bug
ordinal: 561000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the gate of 2026-09-24 the walkthrough recording system test failed once and passed on the rerun: "Chromium sized the page to 1920×1024 in a 1920×1223 window on a 2560×1600 screen, not a 1920×1080 viewport on screen; pass --screen-info={WIDTHxHEIGHT} large enough for the window among the extra arguments." The recorder refuses correctly when the page is not 1920×1080, but whether Chromium gives it that size depends on the screen of the moment, so a recording (the TASK-305 pull request script included) can fail at random.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A recording gets a 1920×1080 page whatever screen the machine has, without the caller passing --screen-info
- [x] #2 The recording system test passes repeatedly on a machine whose screen made it fail
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11 audit: the failing path no longer exists. c307fe780 (TASK-304) added fitWindow/keepSize for the tab-capture sharing bar; 5932b7b86 (two-pass recorder, 2026-09-30) deleted tab-capture and fitWindow. The picture is rendered with Page.captureScreenshot (walkthrough-recorder/lib/render.ts) and the window is sized once on about:blank in openWindow (headless-chromium/lib/launch.ts); the recorder passes --screen-info=2560x1600 itself, not its caller. Verified: tests/system/server-state/walkthrough-recording.test.ts passed 3 of 3 runs on this machine; headless-chromium.test.ts 'a window' passed 3 of 3 (agent audit). The original failing screen was not available, so 'a machine whose screen made it fail' is covered by the recorder forcing the screen info.

2026-10-11 review correction: the note above that says the original failing screen was not available is wrong. The recorder was already passing --screen-info={2560x1600} when the failure was seen (added 2026-09-23 in 0b930a5f2/5f9f5e100; failure 2026-09-24), so the screen was synthetic and the same on every machine. The real cause was the tab-capture sharing bar and the fitWindow resize race (c307fe780); 5932b7b86 deleted both and nothing in src/ calls getDisplayMedia now. Evidence for AC2 is the recording system test passing 3 of 3 runs here.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Superseded by 5932b7b86: the failure ran under the recorder's own forced 2560x1600 screen; its cause was the tab-capture sharing bar and the fitWindow resize race (c307fe780), which 5932b7b86 removed. The page is now sized once at 1920x1080. Verified 2026-10-11 with the recording system test (3 of 3 passes) and the headless-chromium window test.
<!-- SECTION:FINAL_SUMMARY:END -->
