---
id: TASK-579.06
title: install-skill links the skills of an installation and writes nothing into it
status: Done
assignee:
  - '@claude'
created_date: '2026-11-05T14:58:00Z'
updated_date: '2026-11-05T15:33:00Z'
labels: []
dependencies:
  - TASK-579.01
references:
  - apps/cli/src/cli/operations/install-skill/install-skill.ts
  - packages/skills/src/runtime/operations/distribution/prepare.ts
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: task
ordinal: 1027000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today `install-skill` generates skill references inside the checkout `skills/` and then links them. A global install can be read-only, and a release has no `docs/` for the INSTALL.md links to point at.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In release mode `install-skill` links or copies the prebuilt skills and writes only into the skills root and the target repository
- [x] #2 The shipped skill references carry the release commit and link to GitHub at the version tag
- [x] #3 The Codex coordinator skill link uses the installation skills directory
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. skill-destination/install-skill take the Installation explicitly; release mode never prepares or writes into the installation (link, or copy made owner-writable). 2. prepareSkillArtifacts gains linkBase + releaseLinkBase(version) for the release build (579.08). 3. Coordinator link already uses installation().skillsDirectory (579.01): verify. 4. Tests: read-only release fixture install (link+copy), release-linked INSTALL.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Install-skill takes the Installation explicitly. In release mode it links the prebuilt skills from installation().skillsDirectory (or copies them for a --dir inside the repository, made owner-writable so a read-only install yields a replaceable copy) and never runs prepareSkillArtifacts, so nothing is written into the installation. prepareSkillArtifacts gained linkBase; releaseLinkBase(version) gives https://github.com/miklschmidt/archboard/blob/v<version> for the release build (TASK-579.08) to pass with revision=<release commit>. The coordinator skill link already used installation().skillsDirectory (TASK-579.01); production-initialization.test.ts covers it. Worktree was created from main; fast-forwarded to fix/core-build-feedback to get 579.01.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
In a release, install-skill links installation().skillsDirectory (or copies it, owner-writable, for a --dir inside the repository) and never prepares artifacts in the installation. prepareSkillArtifacts takes a linkBase, and releaseLinkBase(version) gives https://github.com/miklschmidt/archboard/blob/v<version> for TASK-579.08. The coordinator skill link already used installation().skillsDirectory since TASK-579.01. Verified after merge: apps/cli install-skill tests 6 pass (read-only release fixture) and packages/skills distribution tests 2 pass.
<!-- SECTION:FINAL_SUMMARY:END -->
