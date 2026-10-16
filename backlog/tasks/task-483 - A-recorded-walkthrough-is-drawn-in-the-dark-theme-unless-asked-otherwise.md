---
id: TASK-483
title: A recorded walkthrough is drawn in the dark theme unless asked otherwise
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-16 01:30'
updated_date: '2026-10-16 01:31'
labels: []
dependencies: []
priority: medium
ordinal: 847000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user read the 18 new pull request bodies of the device trust stack (Platform #589 to #615) and wants their walkthroughs in the dark theme. `archboard semantic record` draws in the light theme unless `--theme dark` is passed, so every recording an agent makes without the option comes out light, and the archboard-pr walkthrough reference says so. The README recordings already pass `--theme dark`. `semantic replay` keeps the theme of the talk unless `--theme` names one, so a kept talk can be drawn again in the other palette without a new voice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard semantic record` without `--theme` draws its video in the dark theme, and `--theme light` still draws it light
- [ ] #2 The help of `semantic record` names dark as the default
- [ ] #3 The archboard and archboard-pr skills name `--theme light` as the option for the other palette of a recording, and say that a recording is dark by default
- [ ] #4 The 16 walkthroughs of the device trust stack bodies are drawn again in the dark theme from their kept talks, with no new narration
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Boards: none affected. No board draws the default theme of a recording.
2. src/cli/commands/semantic-record.ts: one default theme, dark, for the input schema and the option metadata.
3. Skills: the archboard-pr walkthrough reference and the archboard walkthrough recipe name dark as the default and `--theme light` as the other palette.
4. Consumer skill steps: evaluation inputs (none name the theme), `bun run generate:skill-artifacts`, the skill-evaluation and install-target tests, `bun run check`.
5. Draw the 16 device trust walkthroughs again with `semantic replay --theme dark` from their kept talks, and keep the light videos beside them.
<!-- SECTION:PLAN:END -->
