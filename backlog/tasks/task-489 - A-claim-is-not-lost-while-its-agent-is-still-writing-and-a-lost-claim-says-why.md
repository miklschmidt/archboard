---
id: TASK-489
title: >-
  A claim is not lost while its agent is still writing, and a lost claim says
  why
status: To Do
assignee: []
created_date: '2026-10-17 04:20'
labels:
  - board-store
dependencies: []
priority: high
ordinal: 854000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-10-17 four agents, each claiming a different board of this vault on the server on port 3000, rebuilt stale proposals. Two of them (Agent workbench, Codex workhorse) were refused on their next write with CLAIM_REVOKED, "Somebody took ... back", about 8 minutes into a 2 h claim. Nobody used the take-back control, and the server had not restarted (it started at 01:59 UTC, the agents at 02:10 UTC). The take-back route is the only caller that revokes with a person, and noteClaimRevoked (src/runtime/engine/lib/board-lock-claim-state.ts) also records a revocation with no known taker when a lease renewal is refused. So the likely cause is a refused or missed renewal while several claims ran in one server. The agents stopped half way, as the skill tells them to, and an owner had to be asked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A claimed board stays claimed for its whole duration while its holder writes, with several agents each claiming a different board on one server, shown by a test
- [ ] #2 When a claim does end without a person taking it back, the refusal names the cause (expiry, refused renewal, restart) instead of "Somebody took it back"
<!-- AC:END -->
