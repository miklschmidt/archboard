---
id: TASK-180
title: Validate the real pipeline proposal in the running viewer
status: Done
assignee: []
created_date: '2026-09-11 18:14'
updated_date: '2026-09-12 04:54'
labels:
  - ready-for-agent
dependencies:
  - TASK-177
  - TASK-178
  - TASK-179
references:
  - TASK-170
documentation:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/design/semantic-boards-implementation.md
priority: high
type: feature
ordinal: 331000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-170

## What to build

Use the architecture of this replacement as a fresh authored example to test whether the schema and renderer improve actual architecture explanation and planning.

## Blocked by

TASK-177, TASK-178, TASK-179

The user pre-approved this breakdown and autonomous implementation on feat/semantic-boards. Follow the accepted design and preserve legacy board files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tracked canonical semantic input explains existing Excalidraw and proposed semantic pipelines using linked levels, both grammars, named views and a leadership walkthrough; generated render artifacts remain reproducible.
- [x] #2 The running app demonstrates competing and chained proposals, safe propagation, a durable conflict through restart, resolution, competing adoption and frozen prior current.
- [x] #3 Direct visual verification confirms typography, hierarchy, removed/changed labels, large-diagram navigation, conflict disclosure and narrative focus; observed defects are fixed.
- [x] #4 Legacy board files remain untouched and no migration is performed; objective verification and remaining limitations are recorded.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The architecture of this replacement is itself a tracked semantic example, and it was used to test whether the model and the renderer actually help somebody explain a system. docs/design/semantic-pipeline/ states two linked boards and one proposal; scripts/build-pipeline-example.ts builds them into a vault through the ordinary write boundary — the same lease, the same coherence checks, one atomic write, one version — and draws one artifact per view per variant. Running it again over a vault it has already built changes nothing, because identities are minted once and never rewritten.

The lifecycle was exercised end to end through the public command line against a running canvas: competing and chained proposals, a safe edit reaching every draft in one version, two incompatible answers leaving one draft holding a disagreement and another blocked behind it, a restart that changed nothing, a settlement that freed what waited, an adoption that moved the designation and froze what it replaced, and a historical state refusing an ordinary edit. docs/design/semantic-pipeline/verification.md records each step, what the answer carried, and what the example does not cover.

Seen, not only asserted, at 1920x1080 in the running app: both grammars, the walkthrough beside the picture with its focus following the beats, the disclosure a stale or blocked state carries, the drill-down, the bound code, and the variant bar. Defects found that way were fixed rather than noted: a blocked state named its ancestor by id, the CLI reported a blocked draft as holding zero disagreements, an inspector button ran out of the pane, and an unbound node was described as planned.

Legacy files are untouched: the verification vault's one .excalidraw.md is byte-identical before and after, and no note was created for any semantic board.
<!-- SECTION:FINAL_SUMMARY:END -->
