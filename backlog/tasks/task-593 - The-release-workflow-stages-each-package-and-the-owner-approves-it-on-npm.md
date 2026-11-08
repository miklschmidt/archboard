---
id: TASK-593
title: The release workflow stages each package, and the owner approves it on npm
status: Done
assignee: []
created_date: '2026-11-07T12:42:00Z'
updated_date: '2026-11-07T12:51:00Z'
labels: []
dependencies: []
ordinal: 1036000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
npm publish made a version public as soon as the publish job ran. Stage each package with npm stage publish, so a version is public only after the owner approves it on npm with 2FA, and let the trusted publishers allow only staging.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The publish job stages every package with npm stage publish, with provenance and the dist-tag
- [x] #2 The release guide, ADR 0076 and the architecture model describe staging and the owner's approval on npm
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The publish job runs npm stage publish on each tarball with --provenance, --access public and the dist-tag, after installing npm 12.2.2 (staging needs 11.15.0 or later). npm stage publish --dry-run on a real tarball with npm 12.2.2 accepted the path and every flag. docs/agents/releasing.md, ADR 0076 and boundaries.md describe staging and the owner's 2FA approval; the adopted proposal jn5AErWE changes the text of the Release workflow and Release modules. Only a real release run proves the whole flow.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
PR #64 makes the release workflow stage each package with npm stage publish, so nothing is public on npm until the owner approves it with 2FA. The trusted publishers allow only staging, and the GitHub environment npm no longer needs a reviewer. Unproven until the first release: the staged run end to end and provenance after approval.
<!-- SECTION:FINAL_SUMMARY:END -->
