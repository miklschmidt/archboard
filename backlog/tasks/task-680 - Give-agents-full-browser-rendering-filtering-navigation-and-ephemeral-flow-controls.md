---
id: TASK-680
title: >-
  Give agents full browser rendering, filtering, navigation, and ephemeral flow
  controls
status: Done
assignee: []
created_date: '2026-11-25T19:36:00Z'
updated_date: '2026-11-25T20:00:00Z'
labels:
  - cli
  - server
  - frontend
  - agents
dependencies: []
priority: high
ordinal: 1170000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend browser show and pane reporting so voice and coding agents can control every rendering, filtering, display-setting, navigation, and temporary-flow capability in the connected browser without mutating .archboard/vault, and teach the coordinator, workhorse, and archboard skill how to use them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Positive and directional filters (--only-kind, --only-effect, --hide-effect, --to, --from) plus module-name resolution work in browser show and accurately narrow the rendered diagram
- [x] #2 Browser display settings (--layout blocks|lanes, --theme light|dark|system, --dim-on-hover on|off) apply live without resetting current navigation and work even without a vault
- [x] #3 Remaining navigation controls (--no-compare, --ref, --file, --file-repo, --page diagram|about, --select, --group, --keep) work in browser show and pane reports reflect current display settings and reading state
- [x] #4 Ephemeral unsaved flows (--flow-input or reading.ephemeralFlow) render as flowchart or sequence diagrams in the browser pane without writing to .archboard/vault
- [x] #5 Coordinator, workhorse, consumer skill references, and site CLI reference document the full browser control surface and pass tests, lint, type-check, site build, and visual browser verification in both themes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extended browser pane controls across schemas, server routing, CLI, web UI, and agent instructions: positive/directional filters (--only-kind, --only-effect, --hide-effect, --to, --from) with module-name resolution; vaultless in-place browser settings (browser settings and browser show --layout/--theme/--dim-on-hover via pane_settings); navigation controls (--keep, --select, --group, --no-compare, --ref, --file, --file-repo, --page diagram|about); and session-only temporary flowcharts/sequences (--flow-input / reading.ephemeralFlow) with synthetic participant support and interactive Sequence/Flowchart toggling without touching .archboard/vault. Verified with unit/contract tests, type-check, lint, frontend build, skill evals, site build, archboard checks (0 shallow modules), and live Chromium verification in both dark and light themes.
<!-- SECTION:FINAL_SUMMARY:END -->
