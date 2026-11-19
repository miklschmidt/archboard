---
id: TASK-655
title: A stale renderer core says how to rebuild, not Internal server error
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T23:41:00Z'
updated_date: '2026-11-19T23:50:00Z'
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
- [x] #1 When the renderer core is stale, archboard check and every route that draws answer with the error's code and message (the rebuild command), not 'Internal server error'
- [x] #2 archboard check --state X semantics runs only the semantic check, and archboard check semantics --state X accepts --state
- [x] #3 One test at the server's seam drives a stale-core error through a drawing route and reads the code and message; one CLI test covers the two argument orders
- [x] #4 No lint, type or test rule is weakened, and bun run check passes apart from check:model's known findings
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Server: unhandledErrorRoute answers an error whose code starts CORE_BUILD_ with {success:false, code, error: message, diagnostics:[{code, message}]} so the CLI prints the code; every drawing route reaches it through Express 5.
2. CLI: check semantics declares --state (shared with the code check's parameter) and passes it to the semantics check.
3. CLI: the check route gets first-positional child discovery, its option table derived from the check subcommands' own options, so check --state X semantics runs check semantics.
4. Tests first: a server-seam test that drives a coded stale-core error through /api/architecture/render, and a CLI test of both argument orders.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause of the CLI argument bug: `check` routes to its default child `all` whenever its first argument is an option, and the Commander parser allows excess arguments, so `check --state X semantics` ran `check all` and dropped `semantics`. `check semantics` declared no option, so it refused --state. The check route now discovers the first positional after the options its subcommands declare (the existing childDiscovery mechanism, unused until now), and `check semantics` declares --state.
Verified: build, types, lint:all, format:check, test:modules (5383 pass), test:repository (182 pass), test:system (228 pass). End to end with a really stale core (a Rust comment added, then reverted): `archboard model render` printed the rebuild command and CORE_BUILD_STALE. check:model not run; criterion 4 rests on its known findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A renderer core the server cannot load (code CORE_BUILD_*) now answers every route, through the server's last error handler, with {success:false, code, error: the message with the rebuild command, diagnostics:[{code, ...}]}, still status 500; the CLI prints the message and, from the diagnostic, the code. The error is known by its code only. `check semantics` takes --state, and the check route finds a subcommand named after leading options, its option table derived from the subcommands' own options. Tests: a server-seam test drives a coded stale-core refusal through /api/architecture/render; a CLI test covers both argument orders; the refusal test now skips options a subcommand declares. Follow-up risk: a word after leading options that names no check (`check --fix nonesuch`) still runs `check all` silently, because excess arguments are allowed.
<!-- SECTION:FINAL_SUMMARY:END -->
