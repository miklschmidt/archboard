---
id: TASK-326
title: A recording sizes its window for the screen it runs on
status: To Do
assignee: []
created_date: '2026-09-24 01:27'
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
- [ ] #1 A recording gets a 1920×1080 page whatever screen the machine has, without the caller passing --screen-info
- [ ] #2 The recording system test passes repeatedly on a machine whose screen made it fail
<!-- AC:END -->
