---
id: TASK-440
title: 'The README demonstrates code evidence, module interfaces, and Git history'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 10:05'
updated_date: '2026-10-07 10:51'
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
- [x] #1 The code evidence demonstration runs real analysis and shows a finding on the board with its source evidence.
- [x] #2 The module interface demonstration compares two proposals and shows their entry points and hidden parts.
- [x] #3 The Git history demonstration shows actual commits mapped to parts, parts that change together, and a branch footprint against a proposal.
- [x] #4 Each demonstration is reproducible through the README harness, has a manifest entry and a still image, and is linked from its README section.
- [x] #5 The generated recordings are inspected, fit the attachment limit, and the applicable repository gate passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the existing README harness with three scenes over isolated sample source and board data. No canonical architecture board is affected because the harness keeps its existing server, browser, and encoder roles. 2. Film the real CLI and browser workflows and derive visible summaries from their answers. 3. Register source coverage and still images in the asset manifest, then generate and inspect all three recordings. 4. Attach the recordings, update the README and harness guide, run the applicable gate, and commit the completed work.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented three no-Codex producers: code-evidence, module-interfaces, and git-history. A shared synthetic TypeScript checkout has fixed example Git commits and CLI-authored boards. Real analysis finds one resolved missing call. The proposals show 3 entry points/0 hidden parts versus 1 entry point/2 hidden parts. History reports 7 shared commits (87%) for Validate order and Save order, and the branch footprint produces all three categories. Generated and inspected browser keyframes, then pinned inspectors so they do not cover diagrams. Final encoded playback inspection and full gate are in progress. Type checking passes.

Encoded playback was inspected in Chromium after generation. All three lossless WebP attachments are 1440 pixels wide: code-evidence 24.199 seconds / 1,520,370 bytes, module-interfaces 25.866 seconds / 1,421,830 bytes, git-history 22.133 seconds / 1,686,752 bytes. Uploaded the three recordings with gh attach and linked each beside its README section. Added a gallery row with the generated stills. The existing README manifest contract owner passes 11 tests. readme:check reports all three new assets current; the same nine older recordings remain stale as previously tracked. Implementation checkpoint: 8ada6fbee. Simplification pass kept one sample fixture, one producer factory, and the existing browser/server/encoder pipeline.

The full bun run check gate passed: 4,647 tests, zero failures. Modules 4,403, system 196, repository 24, serial browser 24. Log: /tmp/task440-check.log. The user requested a push after all assets are refreshed, so the required pre-push review now covers this implementation. Any review fixes will be recorded with fresh asset hashes before closure.

Pre-push review fixed one fixture isolation defect in ec5c29e68. Inherited Git controls could direct the generated commits into another repository. A disposable before/after reproduction wrote nine commits outside the fixture before the fix and zero afterward. The fixture still has the same deterministic HEAD. Registration and schema boundary review found no defects. The three demo recordings will regenerate after the fix.

Regenerated all three demonstrations after the fixture isolation fix. Final WebP sizes are 1,587,912 bytes for code evidence, 1,422,224 for module interfaces, and 1,698,870 for Git history. Parent inspected their encoded playback and replaced all three attachment links with fresh uploads. README review narrowed the claims about missing evidence, unused exports, and mapped module interfaces in 424f3e854. The final manifest reports all sixteen assets current.
<!-- SECTION:NOTES:END -->
