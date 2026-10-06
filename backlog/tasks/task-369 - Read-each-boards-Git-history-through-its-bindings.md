---
id: TASK-369
title: Read each board's Git history through its bindings
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:18'
updated_date: '2026-10-06 14:31'
labels:
  - history
dependencies: []
documentation:
  - docs/design/design-checks.md
priority: medium
type: feature
ordinal: 648000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every part that carries a binding names files, and Git knows when those files changed. Mapping each commit onto the parts whose bound files it changed needs no parser and works in any language, including infrastructure and Nix files. One mapping answers three questions that the engineering skills ask: is the board behind its code (staleness), what did this branch touch against what its proposal said (footprint), and which parts change often or change together (locality: hotspots and change coupling, Tornhill's code-maat).

Measured on 2026-09-29 (docs/design/design-checks.md): Board viewer was 10 commits behind its bound files. Architecture painter and Sequence painter changed together in 6 commits with no relationship between them, and the commit subjects name decisions that both painters carry, which Ousterhout calls information leakage. Two traps showed up in the measurement. A part that drills into its own board and binds a whole directory adds hundreds of commits, so the lens skips it. Sweep commits of hundreds of files make unrelated parts look coupled, so the lens uses code-maat's filters. TASK-257 found 141 commits with no vault update, which staleness would have shown.

The readings are derived on request, never stored in a board (ADR 0015) and never drawn as traffic (ADR 0027). Call the co-change measure change coupling: temporal coupling means three different things in the three books.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `archboard check` says which boards and parts changed in code since the board last described them
- [x] #2 An agent can map a branch onto a board and see which parts it changed, set against the parts its proposal names
- [x] #3 An agent can list the hotspots of a board and the parts that change together with no relationship between them
- [x] #4 Parts that drill into their own board are skipped, and sweep commits do not make parts look coupled
- [x] #5 Nothing the lens derives is stored in a board or drawn as traffic
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The history lens reads Git through bindings on request (ADR 0045). archboard check --code reports how many commits each board and part is behind its code. archboard semantic footprint maps a branch onto a board and splits the parts against its proposal, and archboard-dev reads it at a task's close. archboard semantic locality lists a board's hotspots and change coupling, marking pairs that nothing on the board joins, and the pane inspector shows a picked part's commits and coupled parts. Drill-down parts are skipped, large commits are left out of hotspots and coupling, and nothing is stored or drawn as traffic. Verified per subtask (369.01 to 369.07, each independently reviewed) and by real runs on the dogfood vault: Architecture painter and Sequence painter couple at 44% unjoined on Semantic renderer, and Claims and Panes do not couple on Command interface.
<!-- SECTION:FINAL_SUMMARY:END -->
