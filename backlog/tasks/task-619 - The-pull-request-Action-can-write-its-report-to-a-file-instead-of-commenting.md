---
id: TASK-619
title: The pull-request Action can write its report to a file instead of commenting
status: To Do
assignee: []
created_date: '2026-11-09 01:35'
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
- [ ] #1 A report-file input names a file. When it is set, the Action writes the full markdown report there and posts or edits no comment
- [ ] #2 The Action names the written file in a report-file output
- [ ] #3 The file holds the same markdown body, comment marker included, that the Action would post
- [ ] #4 Without the input, the Action behaves as before
- [ ] #5 The out-of-plan judgement and its annotations work the same with and without the input
- [ ] #6 The action README and the Actions documentation describe the input and show the job summary as an example
- [ ] #7 A system test runs the Action with the input and finds the report in the file and no comment write
<!-- AC:END -->
