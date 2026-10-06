---
id: TASK-367.02
title: Decide how boards carry evidence and how the code check reads it
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 10:24'
labels:
  - code-check
  - semantic-model
dependencies:
  - TASK-367.01
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: high
type: docs
ordinal: 610000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposal 1 of docs/design/design-checks.md needs decisions before code. The open ones are listed there: the names of the anchor and the binding symbol fields, how a vault's relationship kinds map to evidence kinds (a default by kind name, or a new configuration key under ADR 0024), where findings appear (a CLI command, a route, diagnostics with a subject), and the safety rules (files only, no state, no credentials, no evaluation). The engine choice (tree-sitter candidates resolved by language servers) waits for the spike. New dependencies need the user's approval, so this task asks for it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An ADR records the anchor, the binding symbol, the evidence kinds and their mapping to relationship kinds, the command surface, which variants the check reads, the engine, and the safety rules
- [x] #2 `CONTEXT.md` defines the new terms the ADR picks, each with an _Avoid_ line
- [x] #3 The user approved `web-tree-sitter` and the grammar packages, or chose others, and the ADR names them
- [x] #4 The design note states each decision or points at the ADR
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Draft ADR 0046 from the open decisions in the design note, the spike's measurements and every subtask it serves. 2. Ask the user to approve the packages. 3. An independent reviewer verifies every claim against the code, cuts what no subtask needs, settles the open points and fixes the text. 4. Accept and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The user approved the recommended package set on 2026-10-06. The independent review (2026-10-06) found that the draft's POST route under asyncEndpoint would make a stop refuse after 1 s, so the pass is GET /api/vault/code-check run as checkout work. It cut the finding codes from 9 to 8, the routes from 2 to 1, moved --plan to TASK-367.17, dropped ARCHBOARD_LANGUAGE_SERVERS and the default anchor repo, and chose tsc --lsp from TypeScript 7 over typescript-language-server. RELATIONSHIP_BACKWARDS is information. The ADR's section 'Refinements of the tasks' lists every acceptance criterion it refines. Open doubt for the user: no route of the server refuses cross-site requests, so a web page on this machine can start a pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ADR 0046 records the anchor on relationships and flow steps, the binding symbol, six evidence kinds and the vault configuration key that maps relationship kinds to them, archboard check --code with GET /api/vault/code-check, the variants it reads, the engine (tree-sitter candidates resolved by language servers, src/runtime/code-facts and src/runtime/code-check), the user-approved packages, and the safety rules. CONTEXT.md defines anchor, symbol, code check, code facts, evidence kind, candidate and finding. The design note states each decision. Verified by an independent review against the schemas, compare.ts, reconciliation, the server's admission code and a tsc --lsp probe.
<!-- SECTION:FINAL_SUMMARY:END -->
