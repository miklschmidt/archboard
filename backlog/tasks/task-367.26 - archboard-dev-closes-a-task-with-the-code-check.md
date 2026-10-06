---
id: TASK-367.26
title: archboard-dev closes a task with the code check
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:16'
updated_date: '2026-10-06 13:42'
labels:
  - code-check
  - skill
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: chore
ordinal: 634000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today a task closes with a manual step: inspect each proposal against the code as built. The code check does most of that inspection. The step remains for what the check cannot see.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The archboard-dev closing steps run `./bin/dogfood check --code --variant TASK-<n>` on each proposal before adoption
- [ ] #2 The manual evidence rules remain only for what the check does not cover, and the skill says which
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Skill-only change: skills/archboard-dev/SKILL.md (closing steps). No board is affected, so no proposal is drawn.
2. Add a closing step that runs ./bin/dogfood check --code --variant TASK-<n> on every proposal before adoption (one run covers every proposal of a task, since --variant reads that draft on every board that has one). It says how to read each finding code (ANCHOR_*, BINDING_*, ANCHOR_MISMATCH, RELATIONSHIP_UNDRAWN/BACKWARDS/UNSUPPORTED), what to do about it, that a restated proposal 'TASK-n after TASK-m' is named by its own name, and how to separate findings the task introduced from findings already present (the same run without --variant).
3. Narrow the manual inspection step to what the check does not cover (responsibility and description, kind and label, text-only code, relationships across a network hop until TASK-367.23, languages without an adapter) and keep the steps readable in order (footprint = step 3, behind = last step).
4. Prove on a real proposal: no open draft exists in the dogfood vault, so run the steps on a scratch copy of the vault on my own server (TESTING.md) with a draft I make; record output and what the steps said in the notes.
5. Gate: lint, fmt:check, test:repository, one at a time. Commit with the helper.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: no draft is open on the dogfood vault today (every variant is current, historical or shelved), so the trial runs on a scratch copy of the vault on my own server.

Skill-only change to skills/archboard-dev/SKILL.md (closing steps 1, 2, 3, 5, 7); no board is affected, so no proposal.

Design decisions: (1) The code check goes into step 1 with the manual inspection, so the numbering that other notes cite (step 3 footprint, step 7 behind) holds. (2) Finding the findings the task introduced: the code check reads the same code in every run, so a diff of 'check --code' against 'check --code --variant TASK-n' shows exactly what the proposals introduce (>) or clear (<), keyed by severity, code, board, path without the variant id, subject and message. The text on stderr carries no finding code, so the recipe reads the JSON on stdout with jq. (3) The same diff cannot show findings that the task's CODE introduced on a board with no proposal, because both runs read that code, so step 7 now reads the findings of its run on every board that the commits put behind. (4) One run per proposal NAME: a restated 'TASK-n after TASK-m' is not read by --variant TASK-n (its board reads at the current variant there), and step 5 now runs steps 1 and 3 on the restated proposal by its own name. (5) The manual list names what the check does not cover: a part's responsibility and description, a relationship's kind and label, code read only as text (every language but TypeScript and TSX, infrastructure; skips text-only and symbol-unparsed), a relationship across a network hop (TASK-367.23), unbound parts and unregistered repositories.

Trial (no draft is open on the dogfood vault: every variant is current, historical or shelved). Scratch copy of .archboard/vault on my own server (ARCHBOARD_URL=http://127.0.0.1:3427, XDG_STATE_HOME empty, repo add .), then two drafts of a made-up task: 'TASK-9001' on Board persistence (removes the Vault diagnostics -> Binding checks relationship; adds Vault diagnostics -> Vault configuration anchored at readSemanticBoardConfiguration; adds a part Diagnostic subjects bound to a file that does not exist, with a relationship anchored at a symbol that does not exist) and 'TASK-9001 after TASK-9000' on Command dispatch (an unanchored dispatchedCommand -> Help text; a Global flag readers -> Failure reporting anchored at CliUsageError, which another module defines).
Run without --variant: exit 1, 292 findings (87 UNDRAWN, 20 BACKWARDS, 185 UNSUPPORTED), all already there.
Run with --variant TASK-9001: exit 1, 294 findings. diff of the recipe (base vs draft):
219d218
< warning	RELATIONSHIP_UNDRAWN	Board persistence	content.nodes.AJGft3Pe	Vault configuration
Read: BINDING_PATH_MISSING and ANCHOR_SYMBOL_MISSING are the unbuilt part and its wrong anchor (deviation: drop the part); UNDRAWN on Binding checks is the relationship the draft removed while diagnostics.ts still calls it; UNDRAWN on Vault configuration is cleared by the added anchored relationship, as it should be. Corrected the proposal (removed the part and its relationship, restored Vault diagnostics -> Binding checks anchored at semanticBindingDiagnostics): the diff then showed only the cleared Vault configuration line.
Run with --variant 'TASK-9001 after TASK-9000': 294 findings; diff:
151a152
> information	RELATIONSHIP_UNSUPPORTED	Command dispatch	content.edges.sYqF9LNn	dispatchedCommand -> Help text
205a207
> warning	ANCHOR_MISMATCH	Command dispatch	content.edges.EfWuwOnj.anchor	Global flag readers -> Failure reporting
Read: the restated name reads Command dispatch at its draft and Board persistence at the current variant, so the first run's Command dispatch findings do not appear there and these do not appear in the first. ANCHOR_MISMATCH: the anchor cites what neither end defines. UNSUPPORTED: no anchor, and dispatch.ts does not use help.ts.
--variant TASK-4242 is refused: 'No board has a draft named TASK-4242 ... The drafts that exist: TASK-9001, TASK-9001 after TASK-9000'.
Skips on the draft run: ends-overlap (1 subject) and text-only (.json, .md, .scm).
The scratch server is stopped and the scratch vault is in the session scratchpad, outside the repository.

Gate: bun run lint 0; bun run fmt:check 0; bun run test:repository 20 pass 0 fail.
<!-- SECTION:NOTES:END -->
