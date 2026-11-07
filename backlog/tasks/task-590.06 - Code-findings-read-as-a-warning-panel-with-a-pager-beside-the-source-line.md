---
id: TASK-590.06
title: Code findings read as a warning panel with a pager beside the source line
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T12:47:00Z'
updated_date: '2026-11-07T16:28:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: enhancement
ordinal: 1049000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner likes the site content selector and warnings display: large tabs with an icon, a label and a gloss, and a warning card with a solid chip, the route, the explanation and the strength of the evidence beside the source with its line marked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The code findings show one finding at a time with a pager, a solid changed chip and the route
- [x] #2 The source excerpt shows line numbers and marks the line of the evidence
- [x] #3 A content selector of icon, label and gloss tabs chooses between the code evidence views
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Server half (route of source lines), by the implementation agent of 2026-11-07: 1. Add CodeSourceLinesSchema beside CodeEvidenceSchema in packages/code-intel/src/shared/protocol/code-check.ts and export it from @archboard/code-intel/code-check. 2. Mount GET /api/code/source-lines in apps/server beside the code-findings route: settings-read origin guard, requireVault, a query schema, checkout work. 3. Answer only a place that evidence of the vault's remembered findings names; resolve it through @archboard/code-binding/resolution; refuse Terraform state, variable files, .terraform, env files and Kubernetes Secret manifests, and files Git ignores; cap the bytes read and the length of each line. 4. Amend ADR 0046 with a dated exception. 5. One server-state owner: the window, an unnamed place, a path that leaves the checkout through a symbolic link, the origin guard.

1. Tab 1 of the Measures dialog (TASK-590.11), Where the map and the code disagree, shows the remembered findings of the reading on screen one at a time with a pager (1 of N). Paging selects each finding's subject on the picture.
2. The card: a solid changed chip that names the finding (the tint chip for information), the route between the two modules from the evidence or the relationship, the check's words, the strength of the evidence (resolved by analysis or matched by name only) and the time of the pass.
3. Beside the card, the source excerpt from GET /api/code/source-lines through a TanStack query with a zod schema, with line numbers and the evidence line marked. A 404 or a failure shows a quiet source unavailable state. The route belongs to another agent, so a unit test stubs fetch.
4. DESIGN.md warning card part. Screenshots in both themes with findings seeded through a network route.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-07: the owner approved a server route that returns the source lines around a finding's evidence. ADR 0046 says a finding never quotes other text of a file, because a file can hold a secret and the server has no authentication, so the route waits for the owner's answer on that rule. The owner asked where the content selector goes; the proposal is the head of the Measures dialog (TASK-590.11).

2026-11-07, server half (route of source lines), branch t3/bf99bfc1: GET /api/code/source-lines?vault=&repo=&path=&line= answers 200 { success: true, repo, path, line, first, lines } with the evidence line and up to 3 lines on each side, parsed by CodeSourceLinesSchema of @archboard/code-intel/code-check (the schema strips success). Refusals follow the server's shape { success: false, code, error }: 404 EVIDENCE_NOT_REMEMBERED (no remembered finding names the place), 404 SOURCE_UNAVAILABLE (file, checkout or line gone), 404 SOURCE_REFUSED (outside the checkout, ignored by Git, Terraform state or variables, .terraform, env file, Kubernetes Secret, over 1 MiB), 400 INVALID_REQUEST (repo, path or line missing or malformed), 400 or 404 from requireVault, 403 CROSS_ORIGIN_REFUSED from the settings-read origin guard. Lines over 240 characters are cut and end with an ellipsis. Code: apps/server/src/server/http/handlers/code-checks/operations/source-lines.ts, mounted in routes/code-check-route.ts. Test: tests/system/server-state/source-lines.test.ts. ADR 0046 has the amendment of 2026-11-07; CONTEXT.md names Source excerpt. Model: new part Source excerpt (vKEsyHFk#nbkmjsU3) under Code checks on request (vKEsyHFk/HBlhIeSD#KovkhwZi), with Code check route -> Source excerpt (vKEsyHFk#WNmQf72c) and Source excerpt -> Git process commands (vKEsyHFk#NHiOFhOn), edited on the current state as implemented architecture. Open for the coordinator: (1) code-intel now exports 12 names over its interface-width ceiling of 11, so tests/system/repository-policy/interface-width.test.ts fails until the owner decides; (2) docs/readme/architecture-dark.svg and architecture-light.svg are outdated after the model edit, so check:model warns EMBED_OUTDATED until archboard check embeds --fix runs after the merge; (3) the code-intel paragraph of docs/agents/boundaries.md does not name the new schema.

2026-11-07, branch feat/measures-findings-dialog:
- The first view of the Measures dialog shows the findings one at a time, warnings first, with a pager. A step selects the subject of its finding on the picture. The card has a solid changed chip (the tint chip for information), the route, the check's words, the strength of each piece of evidence and the time of the pass.
- The source excerpt reads GET /api/code/source-lines through sourceLinesQuery, a TanStack query with a strict zod schema. It numbers the lines and marks the evidence line. A 404 or a failure says Source unavailable.
- model-code-evidence.test.tsx proves the pager and the subjects it selects, the marked evidence line and the request address against a stubbed fetch, and the unavailable state for 404 and 500. The browser owner pages through two findings and checks the selected module.
- Criterion 2 is left open for the coordinator: the route was not in this worktree, so no excerpt was read from a real server. The screenshots used a network route with seeded lines.

2026-11-07, coordinator: the excerpt read the real route on the integrated branch. The web client now parses the answer with CodeSourceLinesSchema of @archboard/code-intel/code-check, because the strict local schema refused the route's success field. On a scratch server, a code pass of this repository remembered 195 findings; the Measures dialog's second finding showed lines 225 to 231 of crates/archboard-flows/src/sequence/layout.rs with line 228 marked, the same lines the file holds. The route refused package.json:1 with EVIDENCE_NOT_REMEMBERED. The same pass found a stale anchor (Replay stage -> Voice orb named OrbHost), fixed in the model.
<!-- SECTION:NOTES:END -->
