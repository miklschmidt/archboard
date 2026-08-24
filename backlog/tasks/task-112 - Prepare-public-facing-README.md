---
id: TASK-112
title: Prepare public-facing README
status: Done
assignee:
  - '@codex'
created_date: '2026-08-24 10:16'
updated_date: '2026-08-24 10:23'
labels: []
dependencies: []
modified_files:
  - README.md
type: docs
ordinal: 114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the repository README with an accurate, welcoming public entry point before the repository becomes public. Explain what archboard is, how it works, how to install and run it, and set honest expectations about project status and contribution.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 README clearly explains archboard's purpose and agent-human canvas workflow
- [x] #2 README provides verified prerequisites, installation, startup, and basic usage instructions
- [x] #3 README links to the relevant detailed documentation without duplicating or contradicting it
- [x] #4 README contains no private-only claims, secrets, stale upstream branding, or misleading publication promises
- [x] #5 README renders cleanly and repository documentation checks pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite README.md around the public product story: the shared agent–human architecture workflow, its current maturity, and the capabilities that make the read-back loop useful.
2. Replace the stale quick start with verified source-install, vault, build, server, first-board, and read commands; point cross-repository users to INSTALL.md and the bundled skill.
3. State the loopback/injection safety boundary, source-only distribution model, MIT provenance, and link to focused documentation without promising missing community files.
4. Validate Markdown structure and links, run the documentation-relevant checks, inspect the final diff for public-facing language, and record the evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote README.md as a public entry point. Verified commands against CLI help and implementation, distinguished public source from npm publication, stated the loopback security boundary, and kept upstream naming only in provenance. Validation: bun run test:install (33 checks passed); local-link validator (11 links); heading/code-fence validator (9 headings); git diff --check; public-language/path scan found no matches.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reframed README.md for a public repository with a clear product story, honest experimental status, verified source-based setup and first-use commands, cross-repository agent installation, persistence and concurrency behavior, loopback security guidance, documentation links, and upstream/MIT provenance. Verified with the 33-check install-doc suite, local-link and Markdown-structure validators, CLI/source inspection, and git diff --check.
<!-- SECTION:FINAL_SUMMARY:END -->
