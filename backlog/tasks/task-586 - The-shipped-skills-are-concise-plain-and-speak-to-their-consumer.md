---
id: TASK-586
title: The shipped skills are concise, plain and speak to their consumer
status: Done
assignee:
  - '@codex'
created_date: '2026-11-06T19:12:00Z'
updated_date: '2026-11-06T19:42:00Z'
labels: []
dependencies: []
ordinal: 1033000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agents and readers need concise instructions without duplicate rules or internal implementation detail.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All shipped skill prose preserves consumer behavior in plain English
- [x] #2 Required validation runs and results are recorded
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Read every shipped reference and preserve a rule inventory. Rewrite the references and remove repeated guidance through explicit pointers. Compare consumer commands and contradictions with CLI help or source. Regenerate artifacts, run the three required gates, record evidence, and commit the completed task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
No architecture proposal is needed: these edits change documentation placement and wording, not model behavior. Repository tests pass 163 cases and formatting passes. Full validation is still running. The complete reference rewrite and sentence audit remain unfinished.

The full gate failed: check:model exited 1 with model findings, and lint:core exited 137. The initial system and solo runs overlapped setup and failed on missing core/frontend artifacts. Both lanes now run again after the build. No skill evaluations ran. This is a partial checkpoint, not completion.

The catalogue must remain in SKILL.md: the suite loader requires it there. The citation test also relies on the Archboard heading. Both contracts are restored. After the build, system passed 234 tests and solo passed 15. Browser stopped on canonical-preview-navigation with a navigation timeout. The module lane passed 4907 tests with one citation failure before restoring the heading.

Resumed in docs/concise-shipped-skills at c9ea84aab. Scope is consumer prose only. No architecture proposal is needed because model behavior and repository structure stay accurate. Baseline: 17 authored Markdown files, 2825 lines. Required gates are test:repository, format:check, and test:modules. No full gate or skill evaluation will run.

Rewrote all 17 authored skill files. Shared recovery rules now live in canonical-models.md; flow summaries and source-backed authoring live in authoring.md; PR references route to consumer recipes. Preserved the catalogue and citation headings. The old footprint text said that the command changes no exit status. CLI help establishes exit 2 for unavailable base/head refs; the revised text distinguishes informational findings from read failures. Artifact generation passed. Required gates are next.

The consumer reference rewrite and preservation audit are complete. All original diagnostic codes and CLI flags remain. The source-evidence catalogue and both citation headings remain. The first two runs of the required gates passed: 163 repository tests, formatting, and 4908 module tests with one platform-specific skip. Final wording and paragraph refinements are under the same gates now. The completion report records every file count and duplicate-rule destination.

PR guidance now points to consumer recipes for claims, checkpoints, comparison, reconciliation, lifecycle, and narration. Posting and artifact inspection keep their PR-specific steps. Final authored-file validation passed: artifact generation, test:repository (163 passed), format:check, and test:modules (4908 passed, one macOS-only skip, zero failures). Logs are /tmp/task586-generation.log, /tmp/task586-test-repository.log, /tmp/task586-format-check.log, and /tmp/task586-test-modules.log.

AC1 evidence: read and rewrote all 17 authored files, compared every reference section with its retained rule location, preserved all diagnostic codes and CLI flags, and kept the catalogue and citation contracts. The final prose audit found no paragraph above six sentences. The three longest prose sentences contain 20, 20, and 19 words, with code excluded. The final simplification pass removed repeated consumer recipes from development and PR guidance. AC2 evidence: generation and all three requested gates passed after the final skill edits. No full gate, browser lane, evaluation run, or grade command ran. No architecture proposal was needed. The complete report is /tmp/task586-completion-report.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rewrote all shipped skill prose for agents and readers. Centralized repeated rules and removed internal exposition while preserving consumer commands, fields, diagnostics, and guarantees. Corrected the footprint exit-status guidance from CLI help. Artifact generation, 163 repository tests, formatting, and 4908 module tests passed. One macOS-only test skipped. No product behavior changed. The completion report records file counts, rule destinations, source evidence, commits, and logs.
<!-- SECTION:FINAL_SUMMARY:END -->
