---
id: TASK-579.10
title: The release is the first install path in the documentation
status: Done
assignee: []
created_date: '2026-11-05T14:59:00Z'
updated_date: '2026-11-05T16:36:00Z'
labels: []
dependencies:
  - TASK-579.09
references:
  - INSTALL.md
  - README.md
  - site/src/components/QuickStart.astro
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: docs
ordinal: 1031000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
INSTALL.md, the README and the site tell every reader to clone and build. After the first publication, a clone is the contributor path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 INSTALL.md, the README and the site quick start show the npm install first and the clone as the contributor path
- [x] #2 `bun run readme:check` and the format checks pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
INSTALL.md (requirements per way, "Install the release" first, clone as contributor path, release address, update and removal), README quick start, the site QuickStart, Hero and Faq, and AGENTS.md now name the npm release. The example vault comes from codeload.github.com, verified by extracting examples/web-shop with the README command. format:check and test:repository pass, and the site builds after site/scripts/paint.ts. `bun run readme:check` lists 16 stale README assets from source changes on this branch; it is outside the gate and needs a recording refresh with GitHub attachments, left as follow-up. AC #1 waits for the first publication: the commands name a package that exists only after the owner publishes it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The npm release is the first install path in INSTALL.md, the README quick start and the site; the clone is the path to change Archboard. The example vault downloads from GitHub. Verified with format:check, test:repository and a site build. Follow-up: 16 README assets are stale from source changes on this branch (outside the gate). The npm commands work only after the first publication.
<!-- SECTION:FINAL_SUMMARY:END -->
