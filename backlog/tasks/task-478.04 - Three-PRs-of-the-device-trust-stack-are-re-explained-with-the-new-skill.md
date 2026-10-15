---
id: TASK-478.04
title: Three PRs of the device trust stack are re-explained with the new skill
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-15 15:39'
labels: []
dependencies:
  - TASK-478.01
  - TASK-478.02
  - TASK-478.03
parent_task_id: TASK-478
priority: medium
type: task
ordinal: 843000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The new archboard-pr has to be judged on the bodies it writes, and the device trust stack (Admin-By-Request/Platform #599 to #615) is where the old one failed. #599 (certificate authorities), #607 (gateway) and #610 (native callers) cover three different areas. Their boards live in /home/msc/Work/Docs-Architecture-Design/architecture-design: the stack built a parallel chain on "Device Trust Control Plane" (5 parts growing to 79) beside the 22-part "Managed PostgreSQL design" that #589 names, so the trial first rebuilds what these three PRs touch as drill-downs of that design. Nothing reaches the Platform pull requests: posting is the user's decision after reading.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On a new branch of Docs-Architecture-Design, committed and not pushed, the parts that #599, #607 and #610 build are drawn on the design that #589 names or on drill-down boards of its parts, each PR's proposal branched from the proposal of the PR below
- [ ] #2 Three bodies with their pictures and walkthroughs are written to files following the new skill, and nothing is posted to Platform
- [ ] #3 The task notes list, per body, every problem of the audit that still appears, with a follow-up task for each one that the skill or archboard has to fix
<!-- AC:END -->
