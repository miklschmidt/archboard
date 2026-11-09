---
id: TASK-615
title: >-
  The pull-request Action posts its architecture report as text, without
  pictures
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-09T00:11:00Z'
updated_date: '2026-11-09T00:19:00Z'
labels: []
dependencies: []
priority: high
ordinal: 1064000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Action drew before and after pictures and pushed them to an archboard-assets branch, so every run needed contents: write and left a growing branch in the team's repository. GitHub's comment attachments cannot replace that branch: the upload endpoint refuses GITHUB_TOKEN and GitHub App installation tokens and accepts only a person's token. The report's proposal, footprint and out-of-plan sections carry the review without pictures. TASK-594 added the pictures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The comment carries the proposal, footprint, out-of-plan and vault link sections and no picture, picture note or map link
- [x] #2 The Action has no assets-branch input, pushes no branch and needs only contents: read and pull-requests: write
- [x] #3 The pull requests guide, actions/README.md, the Actions page and the repository's architecture workflow describe the text report and its permissions
- [x] #4 The Action's system tests cover the text comment and no test covers pictures
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Review follow-up: correct the remaining picture promises in README.md and skills/archboard-pr/SKILL.md. Make sure that the Action, its tests and module description match TASK-615. Run the requested Nix validation commands. These documentation corrections need no proposal because the implemented architecture stays the same.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed pictures.ts, assets.ts, rawUrl, the assets-branch input and env, fromFork, changedIds and the report's before/after/same/picturesNote/mapUrl. github.ts keeps its head check (now private) so the comment write still refuses when a later push moved the pull request on. Tests: tests/system/actions (40 pass) cover the text comment, the vault link, no model render call, no non-comment API write, and the stale-head refusals. Gate evidence: vp run lint:all, types, format:check, check:model, test:repository pass; site bun run build and its link check pass. Redrew docs/readme/architecture-*.svg because the Pull-request Action module text in the vault changed. Left the Use Chrome for model rendering step in architecture.yml: the check Action's embeds check still renders.

Review finding: README.md still promised pictures from the pull-request Action. Corrected it to describe the proposal, vault link and footprint as text.
<!-- SECTION:NOTES:END -->
