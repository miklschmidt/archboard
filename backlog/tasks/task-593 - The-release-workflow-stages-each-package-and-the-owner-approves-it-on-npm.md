---
id: TASK-593
title: The release workflow stages each package, and the owner approves it on npm
status: In Progress
assignee: []
created_date: '2026-11-07T12:42:00Z'
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
- [ ] #1 The publish job stages every package with npm stage publish, with provenance and the dist-tag
- [ ] #2 The release guide, ADR 0076 and the architecture model describe staging and the owner's approval on npm
<!-- AC:END -->
