---
id: TASK-529.08
title: Interface width is a recorded rule and a repository check
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:27:00Z'
updated_date: '2026-10-25T01:37:00Z'
labels: []
dependencies: []
parent_task_id: TASK-529
type: task
ordinal: 949000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-500.14 measured subpaths and kept every name callers imported, so nothing stopped interfaces from growing by demand.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An ADR replaces the export-what-callers-import rule with operations a caller needs, measured by what the caller must learn
- [x] #2 docs/agents/boundaries.md states the rule
- [x] #3 A repository-policy check fails when a package exports more names than its recorded ceiling
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ADR 0057 (0056 is taken): an interface is designed from the operations its callers need and measured by what a caller must learn; an outside caller is necessary, not sufficient; caller assembly moves into the package; width is visible and ratcheted. ADR 0055 gets an Amended-by line.
2. docs/agents/boundaries.md: replace the general export-what-callers-import sentence of the api/ bullet with the new rule, and name the check in the intro. Per-package paragraphs stay untouched.
3. tests/system/repository-policy/interface-width.test.ts with interface-width.json beside it: count the exported names of each package's code exports (declarations, export { a as b }, export type, export * resolved), fail above the recorded ceiling, and fail when the ceiling file does not list exactly the packages that exist. Ceilings are today's counts at 11340202f.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ADR 0057 (0056 was taken) records the rule and amends ADR 0055 with an Amended-by paragraph. docs/agents/boundaries.md: the intro names ADR 0057, two new general bullets under Packages state the rule and the ceiling, and the api/ bullet drops the outside-caller-is-enough sentence; per-package paragraphs are untouched. tests/system/repository-policy/interface-width.test.ts counts names with @babel/parser over each code entry of exports (declarations incl. destructuring, export { a as b }, export type, export * as ns, export * followed through resolveSource, export default) and reuses ownersIn for discovery. Ceilings in interface-width-ceilings.json are keyed by package directory id, as LAYERS in package-graph.test.ts is, and equal the counts at 11340202f, which match /tmp/iface/count.ts for every package. With an empty ceiling file the two real-data tests failed and named each package, its count and its ceiling; with the recorded ceilings tests/system/repository-policy passes (152 pass).
<!-- SECTION:NOTES:END -->
