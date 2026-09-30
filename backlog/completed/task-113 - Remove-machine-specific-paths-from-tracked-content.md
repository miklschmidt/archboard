---
id: TASK-113
title: Remove machine-specific paths from tracked content
status: Done
assignee:
  - '@codex'
created_date: '2026-08-24 11:04'
updated_date: '2026-08-24 11:07'
labels: []
dependencies: []
modified_files:
  - DESIGN.md
  - TESTING.md
  - >-
    backlog/tasks/task-034 -
    A-bound-label-keeps-stale-coordinates-when-its-container-moves.md
  - >-
    backlog/tasks/task-088 -
    An-arrows-start-ref-goes-stale-when-a-human-re-binds-it-and-the-server-drags-the-arrow-back.md
type: docs
ordinal: 115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sanitize tracked documentation and Backlog records before public release by replacing developer-machine absolute paths with portable examples while preserving technical meaning, provenance, and deliberate compatibility identifiers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tracked authored documentation contains no developer-specific absolute home paths
- [x] #2 Backlog records containing developer-machine paths are updated through the Backlog CLI, not edited directly
- [x] #3 Replacement examples remain technically accurate and internally consistent
- [x] #4 A tracked-file scan and relevant documentation checks pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace developer checkout paths in DESIGN.md and TESTING.md with portable /path/to examples, keeping verified commit references and command semantics intact; normalize the linked build example to bun run build.
2. Sanitize the two historical task-note occurrences through backlog task edit, preserving each note except for the identifying path.
3. Re-scan all tracked text for Unix, macOS, Windows, and file-URI home-path patterns; run documentation checks and inspect the complete diff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Sanitized four authored-document paths in DESIGN.md and TESTING.md with portable /path/to/archboard examples, retained the verified Codex commit, updated the public build command to bun run build, and renamed the stale whiteboard status message. Replaced two historical implementation-note paths in TASK-034 and TASK-088 through backlog task edit. Validation: fail-closed developer-path scan clean; stale checkout/file-URI scan clean; only intentional /home/you placeholders remain in INSTALL.md; bun run test:install passed 33 checks; README/DESIGN/TESTING headings, fences, and 11 local links passed; git diff --check passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed every developer-specific home path found in the current working tree: four public-document occurrences became portable examples, and two historical task-note occurrences were sanitized through the Backlog CLI. Also corrected the linked build command and stale whiteboard status text. Verified with clean Unix/macOS/Windows and stale-checkout scans, the 33-check install-doc suite, Markdown structure/local-link validation, and git diff --check.
<!-- SECTION:FINAL_SUMMARY:END -->
