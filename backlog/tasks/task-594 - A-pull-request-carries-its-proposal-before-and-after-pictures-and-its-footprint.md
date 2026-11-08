---
id: TASK-594
title: >-
  A pull request carries its proposal, before and after pictures and its
  footprint
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T12:42:00Z'
updated_date: '2026-11-08T12:32:00Z'
labels: []
dependencies:
  - TASK-591
references:
  - >-
    https://cursor.com/canvas/store-d9868b7b-a3f5-460e-bddf-04ada008b440/eac44d3b-26a6-4e70-abab-be87cdf17052
priority: medium
type: feature
ordinal: 1039000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Leads who review agent pull requests say that plain diffs are the wrong level for an architectural change. Archboard already has proposals, `model compare`, `model footprint --base <ref> --state <proposal>`, `model render` and walkthrough recordings, but a reviewer sees none of them on the pull request (P1 of the market research).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A GitHub Action posts on a sample pull request the proposal summary, the architecture before and after as SVG, the footprint buckets and a link to the map
- [x] #2 A configuration makes changes outside the plan warn or fail, and an override lets a pull request through
- [x] #3 The action uses only existing CLI commands
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
actions/pull-request posts one sticky comment. On relay PR #2 (https://github.com/miklschmidt/archboard-relay-example/pull/2) it shows the proposal named by the archboard-pr marker, its summary, 'relationships: 1 added', the SVGs before and after from the orphan branch archboard-assets, the footprint (planned and changed: Accept parcel; planned but unchanged: Rate card) and links to the full-size map and the vault. out-of-plan warn, fail and off, and the override label, are held by tests/system/actions/pull-request-action.test.ts. The Action runs only model proposals, read, compare, footprint, render, repo add, repo forget and stop. Fixed during proof: model footprint sets changes against a draft only, and the skill adopts on the branch, so the Action now reads the plan of an adopted proposal from the base's Current and the head's state (actions/pull-request/adopted.ts, rule of ADR 0045). A run again at the same head keeps its pictures.

Review fixes: footprint buckets match stable module identities and sort their labels (82cef6704). Refused model reads leave comparison unjudged (e74cf48f5). Footprint reads use the same immutable PR base SHA as the pictures and plan, and expose skipped modules (757872421). An adopted proposal also reads removed bindings from the base vault over the PR range (d76f991fc). Sixteen focused PR Action tests, source types, and focused lint pass. These fixes preserve the existing Action responsibilities, so no new architecture proposal is needed.

Final review validation: all 32 Action tests pass under Node 22.18.0. Both TypeScript projects, focused Action and test lint, and repository formatting pass. The docs site builds with no errors, warnings or hints. Semantic inspection returns no diagnostics. Code inspection exits 0 with existing informational findings and skipped evidence. The embeds check returns no findings. No push or merge occurs in this review.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The pull-request Action puts the plan on a pull request: proposal, pictures before and after, footprint buckets and map link, with out-of-plan warn or fail and an override label. Proof: relay PR #2's comment in CI.
<!-- SECTION:FINAL_SUMMARY:END -->
