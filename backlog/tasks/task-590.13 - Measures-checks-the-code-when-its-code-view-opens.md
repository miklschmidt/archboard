---
id: TASK-590.13
title: Measures checks the code when its code view opens
status: Done
assignee:
  - '@claude'
created_date: '2026-11-08T02:17:00Z'
updated_date: '2026-11-08T03:35:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: enhancement
ordinal: 1056000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-08 the owner opened 'Where the map and the code disagree' and read 'No code check has read this reading'. Only `archboard check code` started a pass (ADR 0046, TASK-367.24), so the view stayed empty until somebody ran the command. The owner decided that the code check runs when that view opens.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening the code view of Measures on a reading that no remembered pass read starts one pass of the code check for that reading, and the view says it is checking until the pass ends
- [x] #2 When the pass ends, the view shows its findings without a reload; a reading the pass could not read, or a failed pass, says why and offers to try again
- [x] #3 One page starts at most one pass for one revision of a reading, and nothing else in a pane starts a pass
- [x] #4 ADR 0046 records the change, and a test covers that the view starts the pass and then shows its findings
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. model-reader/access/clients/code-check.ts: codeCheckQuery(vault, model) asks GET /api/vault/code-check, with ?state=<id> for a reading that is not Current, keyed by model, state and revision; staleTime and gcTime are infinite and it does not consume the abort signal, so a pass runs once for a revision and closing the dialog lets it finish. After the pass it re-reads the remembered findings (context.client.invalidateQueries) before it settles.
2. hooks/use-code-check.ts: useCodeCheck starts the query only while the remembered findings are read and none matches the reading, and never for a migration preview.
3. ModelCodeEvidence: checking, failed (the server's words and Try again) and finished-without-this-reading outcomes in place of the old 'run archboard check code' words.
4. ADR 0046 amendment of 2026-11-08; the comments of code-check-route.ts, code-findings-memory.ts, drawings.ts, queries.ts and the protocol say which pane starts a pass.
5. Test: the code view starts one pass, says it is checking, then shows the findings; a refused pass says why and tries again.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
codeCheckQuery lives in canvas/picture/reads/clients/queries.ts beside the other reads, with its own key root (readKeys.codeCheck), so a refetch of the remembered findings does not restart it. Sol review S1: a failed pass stayed stale and restarted on reopen, focus or reconnect; useCodeCheck now enables the query only while it is pending, so a failed pass stays failed until Try again (1e89579a6). The browser test reader-measures.test.ts routes its remembered findings before it opens the dialog, because the dialog opens on the code view and would otherwise start a real pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The code view of Measures starts one code-check pass for the shown reading when it opens, with ?state= for a reading that is not Current, and shows Checking, the findings, a failure with Try again, or no pass for a migration preview. ADR 0046 has an amendment. Proof: model-code-evidence.test.tsx (11 tests), the full gate, and a browser check on a fresh server (Checking, then 193 findings).
<!-- SECTION:FINAL_SUMMARY:END -->
