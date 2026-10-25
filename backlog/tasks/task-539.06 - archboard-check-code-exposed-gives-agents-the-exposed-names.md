---
id: TASK-539.06
title: archboard check --code --exposed gives agents the exposed names
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T17:05:00Z'
updated_date: '2026-10-25T17:57:00Z'
labels:
  - code-check
  - cli
dependencies:
  - TASK-539.01
parent_task_id: TASK-539
type: feature
ordinal: 938000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The CLI is the default surface (ADR 0008), so an agent in the survey or grilling step reads the same exposed names as the pane. The owner decided on 2026-10-25 that this is opt-in, so an ordinary check stays small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 --exposed requires --code
- [ ] #2 With --exposed, the JSON answer carries the exposed names of each judged container with the same caps as the pane, and the text output gives one line per container
- [ ] #3 Without --exposed, the answer is unchanged
- [ ] #4 The consumer skill teaches the flag, and the evaluation inputs cover it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Affected boards: none. The change adds an option to an existing command and a query parameter to an existing route. No part, relationship or flow step that a board draws is added, removed, renamed or rewired: Vault check (Command interface) and Code check route (Archboard server routes) already exist and are already joined, and the Code check route responsibility on the unadopted TASK-539.01 proposal already says the route answers the exposed names. No proposal is branched; the TASK-539.01 proposals stay as they are.
2. Flag: --exposed on archboard check, refused without --code by the CheckRequestSchema refine (stage code-check-variant); --code's requiredWhen names it so help derives it.
3. Wire: the CLI appends exposed=true to GET /api/vault/code-check; the route keeps pass.exposures in the answer only then (answerOf); the memory is fed either way. CodeCheckAnswerSchema gains an optional exposures; CodeCheckPass is dropped (it was the same type).
4. Text: one exposed: line per container (module, counts, board@variant and container id).
5. Skill: authoring.md (interfaces of a module) and SKILL.md teach the flag; evals/coverage.json gets an entry; ADR 0046 amendment.
6. Tests: CLI check-code.test.ts (flag asks the route, exposures in the answer, one line per container, refusal without --code, no exposures key without the flag); code-findings-route.test.ts (exposures only with exposed=true; memory keeps them regardless).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built in 62b4073c6 (+ style 'format the code check route'). Wire: CLI appends exposed=true to GET /api/vault/code-check; answerOf keeps pass.exposures only then; memory is fed regardless. Decisions: (1) CodeCheckAnswerSchema gained optional exposures and CodeCheckPass was dropped (same type once exposures is optional; the intersection with a readonly field did not type-check). (2) Text line: 'exposed: <module>: N names, M used outside[, K listed] (board@variant, container id)' - counts only; names are in JSON. (3) No board is affected, so no proposal: the option and query parameter add nothing a board draws, and the unadopted TASK-539.01 proposal text for Code check route stays true. (4) Skill: authoring.md and SKILL.md teach the flag; evals/coverage.json has a runtime-owner entry (no author-run scenario; eval:skill check passes, no model run). (5) ADR 0046 carries an amendment. Gate: lint 0, type-check 0, test:modules 4909 pass 2 fail (wide-boards first-layout bound: Board viewer track, TASK-542, and Agent workbench track at 4.4s under load, same assertion), test:system 257/0, test:repository 142/0, test:serial-browser all 0 fail; format:check fails only on 60 third-party files under .agents/.claude (from the skills tracking commit), not on files of this task. Ran archboard check --code --exposed against this worktree's server: 22 exposures; without the flag the answer keys are unchanged.
<!-- SECTION:NOTES:END -->
