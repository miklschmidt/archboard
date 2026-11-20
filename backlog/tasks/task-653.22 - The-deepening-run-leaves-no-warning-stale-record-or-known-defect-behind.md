---
id: TASK-653.22
title: The deepening run leaves no warning, stale record or known defect behind
status: To Do
assignee: []
created_date: '2026-11-20T03:28:00Z'
labels: []
dependencies:
  - TASK-653.17
parent_task_id: TASK-653
ordinal: 1138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The archboard-deepen run (TASK-653) merged its builds with recorded gate exceptions and left small items each build could not settle alone. They are cheaper fixed together after the last build (TASK-653.17) than each in its own ticket. Decisions behind each item: artifacts/archboard-deepen/20261119T144122Z/decisions.md (ignored).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard-painting drops `header_padding`, `ARCHITECTURE_HEADER_PADDING` and `HEADER_SLAB_INSET`; header padding is `pub(crate) const HEADER_PADDING: f64 = 24.0` in crates/archboard-layout/src/constants.rs, the four header calculations keep their exact math, and painting width is 19
- [ ] #2 `LabelPlates` is no longer re-exported (lib.rs and measure/mod.rs), and the EXPOSED_UNUSED warnings on LabelPlates and on SocketSurface in the voice agent are gone
- [ ] #3 The vault draws every relationship the code has: no RELATIONSHIP_UNDRAWN warning on model-contract, model-rules, Shared model projection, Module interface, Legacy board schema, diagnostics, HTTP listener, Registry follow, code-binding, Codex failures to session-api.ts, or Application composition to Socket conversation
- [ ] #4 Runtime control anchors to the code it names, so ANCHOR_MISMATCH against spawn.ts is gone, and the semantic check of the current model reports 0 errors
- [ ] #5 ADR 0086 no longer says server-lifecycle reads the pane keys
- [ ] #6 Workbench keeps one frame-to-text helper
- [ ] #7 The voice panel has a visible container in the light theme and its copy drops the word "workhorse", checked by screenshot in both themes
- [ ] #8 Parity tests cover the traffic view, the dark theme, the Track engine and every drawing in the corpus fixtures
<!-- AC:END -->
