---
id: TASK-367.05
title: archboard check --code reports anchors and bound symbols that no longer hold
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 12:39'
labels:
  - code-check
  - cli
  - skill
dependencies:
  - TASK-367.03
  - TASK-367.04
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: high
type: feature
ordinal: 613000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
This is the tracer bullet of the code check: the whole path from a stored anchor to a finding, in any language, before any parser exists. It reads text only. Every open canvas polls the plain check every 5 seconds (`src/ui/semantic-board-canvas/lib/queries.ts`), so reading source must not run inside that poll.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 For the current variant of every board in a registered checkout, the check reports an anchored file that does not exist, an anchor symbol that the file does not contain, and a bound symbol that the bound file does not contain
- [x] #2 `--variant <name>` checks a named draft on request. Historical and shelved variants are never read
- [x] #3 The code pass runs on its own route or from a cache keyed on the checkout HEAD, never inside the check that canvases poll
- [x] #4 Repositories this machine has not registered stay silent, and the exit status follows `archboard check`
- [x] #5 Findings carry their subject, and the consumer skill's verification step names the command
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Shared: DiagnosticSubjectSchema kind gains step; describeSubject prints step; diagnosticLine accepts severity information. EvidenceKindSchema in semantic-policy. code-check answer: CodeFindingSchema gains optional evidence (kind, resolution, from, to, repo, path, line, symbol); CodeCheckSkipSchema board optional, adds variant, subject, repo, ref and the code pass reasons (repository-unregistered, checkout-unavailable, ref-not-checked-out, path-ignored, path-never-read, text-only).
2. Runtime module src/runtime/code-check (new): readBoardsToCheck(vault, variant?) reads every board through the store at its current variant, or at the named draft where it has one; refuses when no board has that draft and names the drafts that exist; never reads historical or shelved variants. checkCode(boards, signal) collects claims (binding with symbol; anchor on an edge or a flow step; on a named draft every binding path), resolves each through the code-target checkout snapshot (symlinks and checkout containment), lists each registered checkout's readable files once with git ls-files --cached --others --exclude-standard, and judges with the text adapter (last name of the symbol as a whole word): ANCHOR_PATH_MISSING, ANCHOR_SYMBOL_MISSING, BINDING_SYMBOL_MISSING, BINDING_PATH_MISSING (named draft only), all warnings. Skips: unregistered repo (per subject), pinned ref not checked out (per subject; an anchor whose end is pinned in the anchor's repo too), Git-ignored path, Terraform state/vars/.terraform (never read), checkout unavailable (once per repo, no subject), text-only (once per checkout read, no subject).
3. Route: GET /api/vault/code-check?variant=<name> refuses NO_SUCH_DRAFT (422) before checkout work; runs checkCode beside behind (behind keeps current variants only).
4. CLI: check --code --variant <name> (usage error without --code), NO_SUCH_DRAFT refusal exit 2; codeCheckLines prints findings with diagnosticLine plus evidence lines, and skips one line per reason with a count.
5. Tests: runtime/code-check on temporary Git checkouts (criteria 1, 2, 4), route test (own route, polled check unchanged, refusal), CLI test (exit status, findings lines, variant query).
6. Consumer skill verification step names check --code (SKILL.md and recipe verification steps), evals + coverage.json, eval:skill check; cli-command-audit.json.
7. Dogfood: Archboard server@TASK-367.05 adds Code check (src/runtime/code-check), Code check route -> Code check, Code check -> Semantic board store (moves the route's board read); run ./bin/dogfood check --code and explain every finding.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (495cd7147, 02e77d052): src/runtime/code-check (boards.ts picks the variant per board; claims.ts lists binding and anchor claims; checkouts.ts resolves checkouts and paths through src/runtime/code-target and lists readable files; readable-files.ts runs git ls-files --cached --others --exclude-standard; text-reading.ts is the text adapter; check.ts judges). The route reads boards through it, refuses NO_SUCH_DRAFT (422) and runs checkCode beside behind; behind still reads current variants. CLI: --variant (usage error without --code), NO_SUCH_DRAFT exit 2, finding lines with evidence, one skip line per reason with a count (checkouts named). Shared: subject kind step, diagnosticLine takes severity information, EvidenceKindSchema in semantic-policy, CodeEvidenceSchema and optional evidence on findings, CodeCheckSkipSchema with optional board, variant, subject, repo, ref.

Decisions the ADR left open:
1. Skipped subjects are only those the pass would have judged: a binding with a symbol, any binding on a named draft, an anchor. An unbound part or a symbol-less binding on the current variant is not listed.
2. Skip reasons: repository-unregistered, ref-not-checked-out, path-ignored, path-never-read (Terraform state, .tfvars, .terraform), checkout-unavailable (once per repo, no subject; also when git ls-files fails), text-only (once per checkout read, no subject: the tracer bullet judges nothing that needs references). A skip carries board, variant, subject, repo, ref and detail (the code path for path-ignored and path-never-read); skip has no 'path' field, so 'path' keeps meaning the place in the board.
3. An anchor is skipped as ref-not-checked-out only when a part at one of its ends binds the anchor's repository and is pinned to a ref its checkout does not have out; an end in another repository says nothing about the anchor's files. Other end skips (unbound, unregistered, ignored) do not skip the anchor (ADR: tests every anchor in a checkout it reads, also with an unbound end).
4. A path that leaves the checkout, lexically or through a symbolic link, or an anchor path that is a directory, is not in the checkout: ANCHOR_PATH_MISSING (and BINDING_PATH_MISSING on a named draft). Each file read is realpath-checked to stay inside its checkout.
5. On the current variant a bound path the resolver cannot find gets no code-pass finding: the plain check owns BINDING_PATH_MISSING there, and a missing path is the only finding about a binding. Gap found: the plain check's insideCheckout does not resolve symbolic links, so a current-variant binding whose link leaves the checkout gets neither finding.
6. A directory binding with no file Git lists below it is path-ignored; one whose only listed files are never read is path-never-read.
7. Last name: split on ::, ., /, #; strip a trailing [index] or (call); a whole word has no letter, digit, _ or $ beside it. Text cannot tell a definition from a reference, so a binding symbol holds wherever its last name stands in the file.
8. No Git timeout of its own: git ls-files reads the index and working tree, and the request's signal (hang-up or stop) ends it; a timeout constant would live in timing.ts, outside this task's fence.
9. NO_SUCH_DRAFT is refused inside checkout work (boards are read synchronously first); status 422, exit 2, and the message names every draft that exists on any board.
10. --variant without --code is a usage error (stage code-check-variant), not an implied --code.
11. evidence on CodeFindingSchema is optional with min 1, and the CLI prints each piece under its finding as 'kind, resolution, path:line'; no finding of this task carries one.
12. Evals: one coverage row in part 4, evidence runtime-owner with no scenario: the command is mechanical validation, and each run's anchors are already graded per anchor. A harness outcome 'code-check-clean' (beside check-clean) would need src/runtime/skill-evaluation.

Close of the proposal: Archboard server@TASK-367.05 matched the build (Code check binds src/runtime/code-check; Code check route -> Code check anchored at checkCode in code-check-route.ts; Code check -> Semantic board store anchored at readSemanticBoardAt in lib/boards.ts; the route's own call to the store removed). Given the board's scope as its summary and adopted at v46. ./bin/dogfood check: no diagnostics. Behind: my commits put Command interface (Vault check, Commands: vault.ts) and Skill evaluation (Evaluation inputs: evals) behind; both still right: Vault check still calls the code check route after the plain check (--variant is a query on the same call), and the coverage row adds no part.

Gate (after c5377da46): lint 0, fmt:check 0, type-check 0, build:frontend 0, test:modules 4039 pass 0 fail, test:system 192/0, test:repository 20/0, test:serial-browser exit 0; eval:skill check: suite ok. Real run on the dogfood vault: ./bin/dogfood check --code exits 0 with no findings over 15 boards; the current variants carry 3 anchors (Board persistence 1, Archboard server 2) and no binding symbol, all hold; the one skip is text-only for github.com/miklschmidt/archboard. --variant TASK-367.05 (before adoption) read that draft on Archboard server and found nothing; --variant naming no draft was refused NO_SUCH_DRAFT, exit 2.

Independent review (2026-10-06): the reader followed tracked symlinks without asking Git, so a link below a bound directory could read an ignored .env or a .tfvars file; every read now goes through readListed, which reads only real paths that git ls-files lists and that are not never-read paths (4444544e8). Terraform state backups and terraform.tfstate.d/ are now never read. The BINDING_SYMBOL_MISSING message was inverted for a file, and the last-name rule split before stripping an index or call. Decision 8 is superseded: git ls-files runs under CODE_CHECK_GIT_TIMEOUT_MS (60 s), re-exported by timing.ts. The plain check's insideCheckout now resolves symlinks with the code opener's two-step test (f9c94b7a3). The store exports edgeSubjects and nodeSubject, and claims.ts uses them. Help says --code is required with --variant (1efcf892d).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard check --code now reports, on the current variant of every board or a named draft with --variant, an anchored file that does not exist, an anchor symbol or bound symbol that its file does not hold, and on a named draft a bound path that is missing. It reads only files Git lists in registered checkouts, through their real paths, never Terraform state or variable files, from GET /api/vault/code-check and never the polled check. Findings carry a node, edge or step subject, unregistered repositories stay silent, and the skill's verification step names the command. Verified by code-check.test.ts, the route, CLI and bindings tests (pass with --isolate) and a clean run on the dogfood vault.
<!-- SECTION:FINAL_SUMMARY:END -->
