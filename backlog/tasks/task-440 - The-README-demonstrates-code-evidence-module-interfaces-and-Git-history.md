---
id: TASK-440
title: 'The README demonstrates code evidence, module interfaces, and Git history'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 10:05'
updated_date: '2026-10-07 10:21'
labels:
  - readme
  - recordings
dependencies: []
references:
  - TASK-367
  - TASK-368
  - TASK-369
documentation:
  - docs/agents/readme-assets.md
priority: medium
type: docs
ordinal: 723000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add reproducible visual demonstrations for the capabilities shipped by TASK-367, TASK-368, and TASK-369. The README now describes them but has no recordings that show their real CLI and browser workflows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The code evidence demonstration runs real analysis and shows a finding on the board with its source evidence.
- [ ] #2 The module interface demonstration compares two proposals and shows their entry points and hidden parts.
- [ ] #3 The Git history demonstration shows actual commits mapped to parts, parts that change together, and a branch footprint against a proposal.
- [ ] #4 Each demonstration is reproducible through the README harness, has a manifest entry and a still image, and is linked from its README section.
- [ ] #5 The generated recordings are inspected, fit the attachment limit, and the applicable repository gate passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the existing README harness with three scenes over isolated sample source and board data. No canonical architecture board is affected because the harness keeps its existing server, browser, and encoder roles. 2. Film the real CLI and browser workflows and derive visible summaries from their answers. 3. Register source coverage and still images in the asset manifest, then generate and inspect all three recordings. 4. Attach the recordings, update the README and harness guide, run the applicable gate, and commit the completed work.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented three no-Codex producers: code-evidence, module-interfaces, and git-history. A shared synthetic TypeScript checkout has fixed example Git commits and CLI-authored boards. Real analysis finds one resolved missing call. The proposals show 3 entry points/0 hidden parts versus 1 entry point/2 hidden parts. History reports 7 shared commits (87%) for Validate order and Save order, and the branch footprint produces all three categories. Generated and inspected browser keyframes, then pinned inspectors so they do not cover diagrams. Final encoded playback inspection and full gate are in progress. Type checking passes.
<!-- SECTION:NOTES:END -->
