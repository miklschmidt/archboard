---
id: TASK-619
title: The pull-request Action can write its report to a file instead of commenting
status: Done
assignee:
  - '@claude'
created_date: 2026-11-09 01:35
updated_date: '2026-11-09T05:26:00Z'
labels:
  - actions
dependencies: []
ordinal: 1062000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The pull-request Action (TASK-615) always posts its report as a pull request comment. A team that wants the report elsewhere, such as the job summary, a check run, or its own comment tooling, cannot get the text without the comment. An input that names a file lets the team take the report and post it as it likes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A report-file input names a file. When it is set, the Action writes the full markdown report there and posts or edits no comment
- [x] #2 The Action names the written file in a report output (an input and an output cannot share a name in the Actions reference)
- [x] #3 The file holds the same markdown body, comment marker included, that the Action would post
- [x] #4 Without the input, the Action behaves as before
- [x] #5 The out-of-plan judgement and its annotations work the same with and without the input
- [x] #6 The action README and the Actions documentation describe the input and show the job summary as an example
- [x] #7 A system test runs the Action with the input and finds the report in the file and no comment write
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. context.ts reads a report-file input (ARCHBOARD_INPUT_REPORT_FILE), resolved against the workspace.
2. run.ts: one publish function. With the input, it writes the report Markdown (the body pullRequestComment or noVaultComment returns, marker included) to that file, names its absolute path in the report output, and skips the job summary and every comment call. Annotations and the exit status stay as they are. Without the input it writes the job summary and posts the comment as before.
3. action.yml: the report-file input, the report output, the step id and the env line. Update the description and the github-token permission note.
4. Docs: actions/README.md and the pull-requests guide show the job summary step. The Actions reference page renders the input and output from action.yml.
5. System test in tests/system/actions/pull-request-action.test.ts: one run without and one with the input in fail mode. The file equals the posted body, the step makes no comment request and writes no job summary, the output names the file, and the exit status and annotations match.
6. Gate: format:check, lint:all, types, test:system, test:repository, check:model, and the site build with its guide and link checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: the output is named report, not report-file. site/scripts/reference.ts refuses an Action whose input and output share a name, because both rows would take the anchor pull-request-report-file on the reference page. The check Action already names the path of its saved answer report, so the pull-request Action follows it.

Decision: with report-file set, the Action also writes no job summary. Without the input it writes the report to the job summary and posts the comment. With the input the file takes the report in place of both, so a workflow that copies the file into the job summary, as the docs show, does not get it twice.

The file holds the exact Markdown body that the comment would carry, marker included, with no added newline. A relative path starts from the workspace, and missing directories are created. The same publish function covers the head-without-vault report, so that path also writes the file and touches no comment.

run.ts: one publish function replaces postComment and the two summary-then-post sequences.

Evidence. tests/system/actions/pull-request-action.test.ts, test "a report file takes the comment's text, no comment is touched, and the plan check is the same": it runs the entry in fail mode without and then with report-file. The file equals the body of the comment that the first run posted (AC 1, 3). GITHUB_OUTPUT holds report=<absolute path> (AC 2). The second run sends no request to a comments endpoint, leaves the comments as they were and writes no job summary (AC 1, 7). Both runs exit 1 and print the same annotation lines (AC 5). A mutation that removes the early return of publish makes this test fail. The 17 other tests of the entry pass unchanged (AC 4). Docs: actions/README.md and site/src/content/docs/pull-requests.mdx show a job summary step; the reference page renders the pull-request-report-file and pull-request-report rows from action.yml (AC 6).

Gate inside nix develop: vp run format:check passed; vp run lint:all passed (9/9); vp run types passed; vp run test:system 281 pass, 0 fail; vp run test:repository 170 pass, 0 fail; vp run check:model passed with no findings; the site build passed: scripts 8 pass, 7 guides agree with the CLI and the Actions, astro check 0 errors, every internal link of 17 pages resolves. A fresh worktree needs bun site/scripts/paint.ts before the site build.

Left as it is: the model's Pull-request Action module text describes the default comment and its permissions, which still hold. It does not mention the report file. bun install changed bun.lock (a package version left behind by the 0.3.0 release); that change is not part of this work and is not committed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The pull-request Action has a report-file input. With it set, the Action writes the Markdown that it would post, hidden marker included, to that file, and names the file's absolute path in its report output. It posts and edits no comment and writes no job summary, so the job needs only contents: read. The plan check annotates and fails the step exactly as without the input. Without the input nothing changes. The output is named report, not report-file, because the Actions reference refuses an input and an output with the same name, and the check Action already names its report path that way. A later step can put the file where the team wants it: actions/README.md and the pull requests guide show a job summary step with always(), so the report also lands when the plan check fails the step. A system test proves the file, the output, the absence of comment requests and job summary, and the same exit status and annotations. Gate: format, lint, types, test:system, test:repository, check:model and the site build pass.
<!-- SECTION:FINAL_SUMMARY:END -->
