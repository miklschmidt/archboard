---
id: TASK-367.03
title: Vault diagnostics name the part or relationship they are about
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 09:53'
labels:
  - code-check
  - cli
dependencies: []
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 611000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A diagnostic says which file, board and variant it is about, but not which subject (`VaultDiagnosticSchema` in `src/shared/semantic-policy/index.ts`). The code check reports findings about one part or one relationship, and the canvas cannot mark a subject the diagnostic does not name. Some existing diagnostics are about one subject too, such as a missing binding path or a drill-down to an unknown board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A diagnostic can carry the kind and id of the subject it is about
- [x] #2 Existing diagnostics about one node or relationship fill it in: missing binding path, drill-down checks, unknown vocabulary on a node or relationship
- [x] #3 `archboard check` prints the subject's name beside the message, and its machine-readable answer carries the id
- [x] #4 Generated schemas and the skill references are regenerated where the answer shape changed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Shape: VaultDiagnostic gains optional `subject: { kind: 'node'|'edge', id, name }` (kind uses the board's SubjectKind words; name carried so check and UI print it without a board read; a code finding fills the same field with board+variant already on the diagnostic).
2. Producers: bindings.ts, drill-down.ts, vocabulary.ts (node kind, group membership, edge kind; board level has no subject) fill it via one helper in semantic-board-store/lib/subject.ts. Write notices (RELATIONSHIP_REPLACED/DUPLICATED) carry no variant so are left as they are.
3. Readers: one CLI line formatter (src/cli/commands/lib/diagnostic-line.ts) used by archboard check and every command that prints answer warnings; UI DiagnosticList shows the subject; routes/client pass the schema field through unchanged (schema is the shared VaultDiagnosticSchema).
4. Skill: authoring.md + SKILL.md state the field; evals/ no expectedFeature depends on it (checked); regenerate skill artifacts.
5. Tests: store tests (bindings, drill-down, vocabulary) assert subject; CLI test for check line + JSON id; UI DiagnosticList test.
6. Board proposal: no board is affected. No part is added, removed or rewired: Board persistence already draws Vault diagnostics and Drill-down checks, and the change is an optional field on what they answer.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built: DiagnosticSubjectSchema {kind: node|edge, id, name} on VaultDiagnosticSchema (src/shared/semantic-policy). kind reuses the board's SubjectKind words; name is carried so check and the UI print it without reading the board; a relationship's name is 'From -> To'. Producers: bindings.ts, drill-down.ts, vocabulary.ts via lib/subject.ts (board level has no subject). One diagnosticLine() in semantic-policy now formats every CLI line (check and the commands that print answer warnings), replacing 7 inline templates; the others gain lowercase severity and the path. UI DiagnosticList shows the subject. Routes, client and eval reader pass the schema through unchanged. RELATIONSHIP_REPLACED/DUPLICATED write notices left without a subject: they carry no variant and name the relationship in path. No board affected (no part added or rewired). README assets: readme:check lists all 13 stale because their sources include src/ui, src/cli, src/shared; no picture changed, not regenerated.

Independent review (2026-10-06) found that no test covered criterion 3 on the real check path. It added src/cli/commands/tests/check.test.ts, which runs runCli(["check"]) against a stand-in server (543b459a5). It also built relationship names from one node lookup per state and printed every warning in one form (2716dec72). Constraint for TASK-367.05: the subject kind allows only node and edge, so a finding about a flow step must widen it, and every reader parses the whole check answer through that enum.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Vault diagnostics now carry an optional subject { kind, id, name } for the node or relationship they are about. Missing binding paths, the three drill-down checks and unknown node, group and relationship vocabulary fill it in. archboard check prints the subject's name beside the message, and its JSON answer carries the id. Verified with check.test.ts on the real CLI path, plus bindings, drill-down and policy tests (24 pass with --isolate). The reviewer reported every gate lane passing.
<!-- SECTION:FINAL_SUMMARY:END -->
