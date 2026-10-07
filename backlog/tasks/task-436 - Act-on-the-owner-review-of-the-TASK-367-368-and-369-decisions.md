---
id: TASK-436
title: 'Act on the owner review of the TASK-367, 368 and 369 decisions'
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 00:35'
updated_date: '2026-10-07 01:38'
labels: []
dependencies: []
priority: medium
ordinal: 694000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-10-07 the owner reviewed the decisions and defects of TASK-367, TASK-368, TASK-369 and TASK-433 on a review page, and marked each Keep, Change, Make a task or Leave. TASK-433 already made every language server except TypeScript a configured server. Each subtask here is one Change or Make a task mark. Kept as built: the files a configured server writes into build output, Roslyn not supported, and the code check rules for uses as values, reverse relationships, server questions, ENTRY_POINT_UNEXPOSED, Kubernetes addresses, remote Terraform module arguments, count toggles and which code a declaration runs, the container definition, the history terms, Behind for the whole board, and hidden parts below the first entry points. Left as is: the stale README assets. The defect that spoken approval never switches on is TASK-317.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every subtask is Done
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Implement the existing child tasks in independent scopes: language-server completion and output (.01, .02, .11), request origin (.09), history contracts (.13, .14), CLI cleanup (.12, .16), code facts (.07, .15), Nix imports (.06), module interfaces (.05, .08), canonical boards (.03, .04), and warning navigation (.10).
2. Each scope records child plans and commits separately. The architecture owner creates child proposals for actual changes to drawn meaning before implementation, while internal behavior changes state that no board is affected.
3. Integrate the commits, reconcile shared contracts and documents, count and correct or track the requested new warnings, and inspect the implemented workflows.
4. Run the complete gate once after integration, read each proposal against code and task footprints, adopt proposals, and finalize every child before the parent.
Affected boards include Archboard server, Command dispatch, Board viewer and the boards named by .03 and .04. Child task plans name exact proposals.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All sixteen children are Done with objective evidence for every acceptance criterion. Canonical board proposals are adopted and claims are released. The complete gate passes with 4,597 tests, including the serial browser lane. The refreshed server runs sixteen boards, and the final semantic/code pass reports zero diagnostics and zero warnings. A route simplification regression exposed by the board edits received a reduced regression and a geometry fix. The simplification pass reused existing timing, camera, binding, decoder and definition contracts. Known measured limits remain explicit: no Swift toolchain for live Swift timings, zero newly supported relationships across sixteen Nix flakes, and the server board remains above its one-second layout target. The owner explicitly left stale README assets unchanged. Final log: /tmp/archboard-task436-final-check-2.log. Delivery pass: /tmp/archboard-task436-delivery-code.json.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and finalized all sixteen owner decisions. Analysis waits for completion, reports ordered timings, and uses shared language, binding and history contracts. Interfaces, private test imports, definitions, local Nix imports, cross-origin refusals and warning navigation now follow the requested behavior. Canonical boards are adopted. The complete gate passes with 4,597 tests, and the refreshed dogfood server reports zero warnings. Swift and layout limits and the measured Nix result remain documented.
<!-- SECTION:FINAL_SUMMARY:END -->
