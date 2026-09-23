---
id: TASK-304.05
title: archboard semantic record drives the recording page and writes the file
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-23 10:31'
updated_date: '2026-09-23 10:31'
labels:
  - cli
dependencies:
  - TASK-304.01
  - TASK-304.02
  - TASK-304.03
  - TASK-304.04
parent_task_id: TASK-304
ordinal: 535000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
External agents need one command that turns a board's walkthrough into a video file: pick the walkthrough, run the page in a private headless Chromium on the canvas the CLI talks to, wait for it while reporting progress, write the file, and optionally discard the board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 semantic record <board>[@variant] --out <file.mp4|.webm> [--walkthrough <name|id>] [--theme] [--discard --doing] writes the video and answers with a receipt: file, walkthrough, steps, duration, bytes
- [ ] #2 The walkthrough may be omitted when the variant states exactly one; otherwise the refusal lists them
- [ ] #3 Progress is reported step by step while the recording runs, and an interrupt stops the browser and writes nothing
<!-- AC:END -->
