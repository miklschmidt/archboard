---
id: TASK-367.05
title: archboard check --code reports anchors and bound symbols that no longer hold
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 11:52'
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
- [ ] #1 For the current variant of every board in a registered checkout, the check reports an anchored file that does not exist, an anchor symbol that the file does not contain, and a bound symbol that the bound file does not contain
- [ ] #2 `--variant <name>` checks a named draft on request. Historical and shelved variants are never read
- [ ] #3 The code pass runs on its own route or from a cache keyed on the checkout HEAD, never inside the check that canvases poll
- [ ] #4 Repositories this machine has not registered stay silent, and the exit status follows `archboard check`
- [ ] #5 Findings carry their subject, and the consumer skill's verification step names the command
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
