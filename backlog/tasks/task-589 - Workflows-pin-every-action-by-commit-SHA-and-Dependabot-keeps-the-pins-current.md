---
id: TASK-589
title: >-
  Workflows pin every action by commit SHA, and Dependabot keeps the pins
  current
status: Done
assignee: []
created_date: '2026-11-07T12:08:00Z'
updated_date: '2026-11-07T12:40:00Z'
labels: []
dependencies: []
ordinal: 1036000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A tag can move, so an action named by tag runs whatever the tag points at. Pin every external action to its commit SHA with the version in a comment, make CI fail on an unpinned action, and let Dependabot propose new versions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every external action in .github/workflows is pinned to a full commit SHA with its version in a comment
- [x] #2 CI fails when a workflow names an action without its commit SHA
- [x] #3 Dependabot proposes grouped updates of the pinned actions
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All 13 external actions are pinned to the commit of the newest release under the major tag each workflow used, with the version in a comment. tests/system/repository-policy/workflow-pins.test.ts parses each workflow with Bun.YAML and checks the uses of every job and step, so a quoted key is read too; it failed on main's unpinned ci.yml and on a pin without its version comment, and passes on the pinned files. .github/dependabot.yml (github-actions, weekly, one group, 7-day cooldown, ci(deps) messages) passes check-jsonschema's vendor.dependabot schema. Dependabot does not watch bun, cargo or nix yet: a bun update would fail the bun-nix gate task without a bun.nix update, and a wasm-bindgen update needs a matching wasm-bindgen-cli in nixpkgs.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
PR #63 pins every action in the workflows to its commit SHA, makes CI fail on an unpinned action, and lets Dependabot propose grouped weekly updates of the pins. Follow-up candidate, not started: Dependabot for bun, cargo and nix once bun.nix and the wasm-bindgen pin can follow an update.
<!-- SECTION:FINAL_SUMMARY:END -->
