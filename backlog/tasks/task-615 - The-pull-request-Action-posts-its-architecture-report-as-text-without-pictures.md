---
id: TASK-615
title: >-
  The pull-request Action posts its architecture report as text, without
  pictures
status: Done
assignee:
  - '@claude'
created_date: '2026-11-09T00:11:00Z'
updated_date: '2026-11-09T01:03:00Z'
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

Review finding: the shipped archboard-pr skill still promised pictures from the Action. Corrected the marker guidance to describe its text comment.

Review validation passed inside nix develop: bun test tests/system/actions (40 tests), bunx vp run lint:all, bunx vp run types, bunx vp run format:check, and bunx vp run check:model. The site build passed with no diagnostics and 17 pages with working internal links. The skill-links owner passed (3 tests). The first model read hit an existing Codex state lock. Reading through the temporary server of check:model succeeded. Source inspection found that the module text matches the Action and that the remaining production helpers have callers. The model gate accepted the redrawn SVG embeds. No code change or further simplification was needed.

Proof on the relay example after the rebase onto a10b738: the pull-request workflow passed on both pull requests and posted the text report. Pull request #1 lists Accept parcel under the modules changed with no proposal. Pull request #2 names the proposal Intake quotes the surcharge, Changes: relationships: 1 added, Accept parcel planned and changed, Rate card planned but unchanged. The archboard-assets branches and the unused app variable and secret were removed from both repositories.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The pull-request Action posts its architecture report as text: the proposal, a link to the vault at the head, the footprint and the plan check. It draws no pictures and pushes no archboard-assets branch, so the job needs only contents: read and pull-requests: write. GitHub's comment attachments could not replace the branch, because the upload refuses GITHUB_TOKEN and app installation tokens. The guide, the Actions reference, actions/README.md, the README and the archboard-pr skill describe the text report. Breaking: the assets-branch input is gone, and a workflow that still passes it gets an unknown-input warning.
<!-- SECTION:FINAL_SUMMARY:END -->
