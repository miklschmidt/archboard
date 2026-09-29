---
id: TASK-370
title: >-
  A second recording on one Archboard server speaks a coordinator answer instead
  of its first step
status: To Do
assignee: []
created_date: '2026-09-29 02:22'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 656000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Re-recording the README videos on 2026-09-29 (Codex 0.158.0, voice prompt at 632f20e0): three recordings each ran as the first recording on a fresh scratch Archboard server and narrated every step. The newcomer walkthrough ("Inventory service", "How stock is reserved"), recorded right after the pull-request walkthrough on the same server (port 3397, default state directory, so the shared Codex sign-in), spoke at step 1: "I couldn't tell what you wanted me to do, so I have no board changes or pending voice work. And that's the tour." It never explained step 1; the recording then moved on and narrated steps 2 to 6 correctly. The same walkthrough recorded as the first recording on a new server (port 3421) narrated step 1 correctly. The sentence reads like a coordinator answer to a handoff whose text it could not interpret, spoken in place of the step; what carried over from the previous recording on that server (the coordinator thread, a pending handoff, or the running transcript) is unknown. The broken take is kept in the session scratchpad as rec2/newcomer.mp4 only until that directory is cleaned.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Two recordings in a row on one Archboard server each narrate every step of their own walkthrough, starting with step 1, and speak nothing from the earlier session
- [ ] #2 The task records what reached the voice model before step 1 in the second recording, and a test reproduces it
<!-- AC:END -->
