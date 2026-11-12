---
id: TASK-630
title: The release workflow publishes each package to npm without staging
status: Done
assignee:
  - '@claude'
created_date: '2026-11-12T10:54:00Z'
updated_date: '2026-11-12T11:07:00Z'
labels: []
dependencies: []
ordinal: 1073000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-593 made the publish job stage each package with `npm stage publish`, so every release waited for the owner to approve each staged version on npm with 2FA. The owner chose to drop that approval step and publish directly. The owner changes the trusted publisher of each package on npmjs.com so that it allows `npm publish`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The publish job publishes every package with `npm publish`, with provenance, public access and the dist-tag, platform packages before the launchers
- [x] #2 The release guide, ADR 0076, boundaries.md and the architecture model describe direct publication and no longer describe staging
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. release.yml: the publish job runs npm publish in place of npm stage publish, and its name and comments drop staging.
2. docs/agents/releasing.md, ADR 0076 and docs/agents/boundaries.md describe direct publication.
3. Proposal TGDLt5Ea (predecessor mdEX4O4o, model vKEsyHFk, vault .archboard/vault) changes the text of Release workflow (vKEsyHFk#Vaokwo63) and Release (vKEsyHFk#02jxKSM1). Relationships, flows and walkthroughs stay the same.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The publish job runs npm publish on each tarball with --provenance, --access public and the dist-tag, in the same order as before (platform packages first). It keeps npm 12.2.2, which is newer than the 11.5.1 that trusted publishing needs. actionlint passes on release.yml. releasing.md, ADR 0076 and boundaries.md describe direct publication. Proposal TGDLt5Ea changes the text of Release workflow (vKEsyHFk#Vaokwo63) and Release (vKEsyHFk#02jxKSM1); its footprint from 7195d7b052 shows the workflow planned and changed, and the owner authorized its adoption. check semantics reports no diagnostics. Only a real release run proves the flow, and it needs the trusted publisher of each package on npmjs.com to allow npm publish.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The release workflow publishes each package with npm publish in place of npm stage publish, so a release reaches npm after the gate and the smoke test pass, without the owner approving each staged version. The release guide, ADR 0076, boundaries.md and the adopted model state TGDLt5Ea describe direct publication. Risk: the first release fails at the publish job until the owner changes the trusted publisher of each package on npmjs.com to allow publishing.
<!-- SECTION:FINAL_SUMMARY:END -->
