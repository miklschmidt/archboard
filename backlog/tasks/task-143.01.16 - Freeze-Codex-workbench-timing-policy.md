---
id: TASK-143.01.16
title: Freeze Codex workbench timing policy
status: To Do
assignee: []
created_date: '2026-08-30 16:25'
labels: []
dependencies: []
references:
  - src/shared/timing/timing.ts
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/shared/timing/timing.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 246000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own every new Codex workbench duration in the existing shared timing module. The task records what each bound pulls against so later workers consume names instead of inventing local timers. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Named constants cover process restart backoff, request settlement, browser command lease, approval expiry, spoken-gate expiry, semantic freshness, TERM-to-KILL escalation, realtime start/stop/recovery, and composed shutdown; no consumer defines a numeric duration locally.
- [ ] #2 Each constant documents the reachable race it bounds, the opposing timeout or user expectation it pulls against, and whether expiry yields refusal, retry eligibility, or outcome_unknown.
- [ ] #3 Module tests prove ordering and coupling invariants, including approval shorter than its browser lease, spoken eligibility no longer than approval, graceful shutdown before forced kill, and semantic freshness shorter than voice session recovery.
- [ ] #4 Legacy injection timing names are removed only by the later serialized retirement task, after every replacement consumer imports this policy.
<!-- AC:END -->
