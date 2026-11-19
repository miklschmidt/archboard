---
id: TASK-655
title: A stale renderer core says how to rebuild, not Internal server error
status: To Do
assignee: []
created_date: '2026-11-19T23:41:00Z'
labels:
  - ready-for-agent
dependencies: []
ordinal: 1136000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
During the archboard-deepen run, three helpers saw 'Internal server error' from archboard check. The cause was a renderer core built from older Rust sources: the renderer throws CORE_BUILD_STALE with the fix (run bun run build:core), but /api/architecture/render does not catch it, and unhandledErrorRoute (apps/server/src/server/http/handlers/reads/routes/service-routes.ts:100) answers a generic 500, so the message reaches only the log. Separately, `archboard check --state X semantics` runs every check instead of semantics alone, and `archboard check semantics --state X` refuses --state as unknown. Candidate 13 of the deepen run makes CoreBuildError private, so recognize the error by its code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the renderer core is stale, archboard check and every route that draws answer with the error's code and message (the rebuild command), not 'Internal server error'
- [ ] #2 archboard check --state X semantics runs only the semantic check, and archboard check semantics --state X accepts --state
- [ ] #3 One test at the server's seam drives a stale-core error through a drawing route and reads the code and message; one CLI test covers the two argument orders
- [ ] #4 No lint, type or test rule is weakened, and bun run check passes apart from check:model's known findings
<!-- AC:END -->
