---
id: TASK-478
title: A pull request explained with archboard-pr reads as a short /pr body
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-15 15:38'
labels: []
dependencies: []
priority: high
type: enhancement
ordinal: 839000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An audit of 15 pull request descriptions written with archboard-pr (Admin-By-Request/Platform #599 to #615, a stack split from feat/device-trust, explained from the vault in Docs-Architecture-Design) found them incomprehensible to their human reviewers and hard to relate to the architecture of their design PR (#589). Nine causes: two templates nested (the ten-part explainer inside the Summary of the /pr template), so bodies ran 700 to 2,000 words; the agent's own state and process in the body (variants, vaults, footprint refusals, "isolated vault", an `archboard semantic compare` line nobody on Platform can run); pictures on three boards with new narrow views and names that drift from #589, built as a parallel 79-part chain instead of on the 22-part design; every render framed "Planned, nothing on this board is built" because the board has no current variant; compare and footprint output phrased as sentences; a narrated video, chapters and transcript on every PR that repeat the prose; Evidence sections about where tests ran instead of a before and after; six layouts and copied paragraphs across the stack; dense, negative-scope prose. The decided direction: the body is the three sections of /pr (Summary, Evidence, Merge Danger), with the archboard picture and a short narrated walkthrough in the Summary; each PR of a stack is drawn against the PR below it, without the planned frame.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard-pr writes a body with exactly the sections Summary, Evidence and Merge Danger, and its picture and walkthrough sit in the Summary
- [ ] #2 A picture of a stacked PR marks only what that PR adds over the PR below, and carries no planned frame
- [ ] #3 Three PRs of the device trust stack (#599, #607, #610) are re-explained with the new skill into files, without posting, for the user to read
<!-- AC:END -->
