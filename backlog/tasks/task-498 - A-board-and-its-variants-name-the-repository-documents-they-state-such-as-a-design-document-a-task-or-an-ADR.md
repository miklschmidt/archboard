---
id: TASK-498
title: >-
  A board and its variants name the repository documents they state, such as a
  design document, a task or an ADR
status: Done
assignee:
  - '@claude'
created_date: '2026-10-18 13:15'
updated_date: '2026-10-18 16:17'
labels:
  - schema
  - cli
  - skill
dependencies: []
priority: high
type: enhancement
ordinal: 863000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board holds no link to the documents it draws. In the Docs-Architecture-Design vault, one design (Platform Doc-0072 and TASK-0417) is a draft on four boards under four names, and an agent explaining its pull request could not tell which draft on a board was the design and which a rejected alternative. The design document also changed through the stack (Doc-0072 grows from 338 to 499 lines between #589 and #615), and nothing says which version a draft draws. The owner asked for a metadata field that couples a board to repository tasks, documents and ADRs. Where the field lives (board, variant or both) and how a reference names a repository, path and branch are open: bindings already name a repository, a path and a branch for a part.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An ADR decides where a document reference lives and what it names
- [x] #2 A board or a variant can name repository documents, and show returns them
- [x] #3 `archboard check` reports a reference whose document is missing at the branch it names
- [x] #4 The archboard and archboard-pr skills read a draft's documents to find a design and its version, and write them when they draw one
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ADR 0054 (docs/adr/0054-a-variant-names-the-repository-documents-it-draws.md) decides: a document reference {repo, path, branch?, commit?} has a binding's shape and resolver; a variant holds them as the optional list documents; semantic new/edit payloads state it (an edit replaces the edited variant's list, [] removes it); semantic branch copies it; show returns it; check --code reports DOCUMENT_PATH_MISSING on every variant it reads, at the ref the reference names, with the binding's skips. A board-level list is rejected: no case needs a reference no variant carries. CONTEXT.md gains Document reference.
2. Schema: DocumentReferenceSchema in src/shared/code-target (derived from CodeBindingSchema); documents on SemanticVariantSchema, VariantEditInputSchema and BoardCreateInputSchema. Store: transitions.ts (new, branch copies, edit replaces) and edit-scope.ts (documents count as a variant edit, so historical/shelved refuse). Tests first in semantic-board-store tests.
3. Code check: a document judge in src/runtime/code-check reads each reference through the ref-code reading (codeFor/targetIn/otherRefOf) and adds DOCUMENT_PATH_MISSING; references join the snapshot, checkouts and ref reads. Test beside ref-code.test.ts with a branch that lacks the file. Check command description and src/shared/code-check header name the code.
4. Skills: archboard (authoring.md bindings section and propose-compare/variants: name documents when drawing a design or a task proposal; check finding) and archboard-pr (design.md: the design draft names its design document and plan at the commit or branch; SKILL.md section 2/6: find the design draft through the document; reconcile.md: move the reference's commit when the design changes through a stack). evals/coverage.json and the scenario inputs that the CLI change touches; bun run generate:skill-artifacts.
5. Boards: Archboard server@TASK-498 and Archboard server routes@TASK-498 restate Code check (it now holds document references, ADR 0054); Board persistence@TASK-498 restates Lifecycle transitions (edit restates documents, branch copies them). No part, relationship or binding is added: the work stays inside src/runtime/code-check and transitions.ts. At closing the proposals name ADR 0054 as their document.
6. Close per archboard-dev: check --code --variant TASK-498 diff, footprint, adopt, check, behind; bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: references live on the variant only (ADR 0054); no board-level list, because no case needs a reference that no variant carries. A reference is {repo, path, branch?, commit?} (DocumentReferenceSchema, derived from CodeBindingSchema) and resolves through the binding's resolver. Only check --code reads them (the plain check reads no Git, so a pinned ref could not be read there); it reads every variant the check reads, drafts included, because a document precedes the code a draft plans. A directory is not a document (DOCUMENT_PATH_MISSING). Write path: documents in the semantic new and semantic edit payloads (edit replaces the edited variant's list, [] removes it); branch copies the predecessor's list. No browser change.
Closing: check --code against check --code --variant TASK-498 differ in nothing (25 findings each, none from this task). Footprint read against base e1c7a849c (the commit before d38674ccc, the first Refs: TASK-498 commit outside backlog and the vault): each proposal's against is its parent; namedAndChanged = Lifecycle transitions, Code check, Code check; changedNotNamed and namedNotChanged empty on all three. Adopted Archboard server@TASK-498 (v276), Archboard server routes@TASK-498 (v76), Board persistence@TASK-498 (v76); each names ADR 0054 as its document. archboard check: no diagnostics. Behind on this task's commits: Command interface (Semantic authoring, Vault check, Commands: 5668cfebb changed help descriptions of semantic edit, branch and check, nothing they draw) and Skill evaluation (Evaluation inputs: 1b553e9ff added a coverage row). Both boards stay right.
Skill note: archboard-dev names ./bin/dogfood, which this checkout does not have; ./bin/archboard was used.

Gate: bun run check passed (exit 0). Modules 4860 tests, 4859 pass, 0 fail. System 253 pass. Repository 27 pass. Serial browser lane 19 of 19 owners, exit 0. No rerun was needed. readme:check lists every asset as stale by its source globs; this task changes nothing an asset shows, so none was refreshed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A variant names the repository documents it draws (ADR 0054). A document reference is { repo, path, branch?, commit? }, the shape of a binding, resolved by the binding resolver. semantic new and semantic edit state documents (an edit replaces the edited variant's list, [] removes it), semantic branch copies the list, semantic show returns it on each variant, and check --code reports DOCUMENT_PATH_MISSING at variants.<id>.documents.<n> for a file that is not at the version a reference names; an unregistered repository and an unresolvable ref are skipped with the reason. The archboard skill names a draft's documents and finds a design through them; the archboard-pr skill names the design document and plan on the design draft, finds it in a later pull request, and moves the reference's commit when the design changes through the stack. Evidence: branching.test.ts and documents.test.ts; bun run check green. Adopted the TASK-498 proposals on Archboard server, Archboard server routes and Board persistence. Follow-up: run archboard install-skill again so installed skills carry the change; archboard-dev names ./bin/dogfood, which this checkout lacks.
<!-- SECTION:FINAL_SUMMARY:END -->
