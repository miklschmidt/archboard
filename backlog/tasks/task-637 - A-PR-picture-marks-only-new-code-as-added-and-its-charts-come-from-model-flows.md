---
id: TASK-637
title: >-
  A PR picture marks only new code as added, and its charts come from model
  flows
status: Done
assignee: []
created_date: '2026-11-14T15:07:00Z'
updated_date: '2026-11-14T15:53:00Z'
labels:
  - skills
  - cli
  - actions
dependencies: []
ordinal: 1079000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An agent updated a stack of PR bodies in a consumer repository and posted misleading pictures. It drew Mermaid flowcharts by hand, because the archboard skill description never says "flowchart" or "diagram" and archboard-pr has no evidence case for new or changed logic. One PR picture marked 37 subjects as added, because its proposal added a container for a CLI that already existed at the base. The render was correct for that model. archboard-pr requires that the comparison accounts for every changed subject, but not that every added subject is new in the diff, and nothing mechanical catches an added module bound to existing code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 archboard-pr asks for new or changed logic to be authored as a proposal flow and rendered with `model render --flow <id> --grammar flowchart` from the base branch, and says that every chart in the body comes from a model flow
- [x] #2 archboard-pr says that each added subject binds source that the diff adds, and that source at the base goes in Current first, without a conflict with the documentation sentence
- [x] #3 The renders reference matches each added, changed and removed count of the legend with `model compare` and the diff before the picture is posted
- [x] #4 The archboard skill description triggers on flowcharts and diagrams
- [x] #5 `model footprint` with a draft lists `preexisting`: modules the draft adds whose bound source the branch does not add. A directory binding that gains a new file is not preexisting
- [x] #6 `--fail-preexisting` exits 1 when `preexisting` is not empty, and `--help` documents the rule
- [x] #7 System tests with real Git fixtures cover an added module bound to existing code, one bound to new code, and a directory binding that gains new files
- [x] #8 The pull-request Action lists preexisting modules in its comment, and fails on them only when the workflow opts in
- [x] #9 Site docs and consumer skill references describe the new list, option and Action input
- [ ] #10 The archboard and archboard-pr skills model every flowchart and sequence chart as a flow and forbid Mermaid for them
- [ ] #11 archboard-pr prefers the sequence grammar when timing and call routing matter more than the logic
- [ ] #12 The archboard description triggers on code in general, in the wording the owner gave
- [ ] #13 The pull-request Action warns in the log and the comment when the archboard-pr section of the description holds a Mermaid code block, and never fails on it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Skills: archboard-pr evidence case for logic, the reverse criterion for added subjects, the legend count step in renders.md, and flowchart and diagram triggers in the archboard description.
2. Core: netChangedParts tells which parts the range adds source to. A path binding gains source when the net diff from the merge base adds a file (status A) inside it; a rename moves code and adds none. A declaration binding gains source when the merge base lacks the declaration and the head has it. Each listed part carries newSource; a proposed footprint lists preexisting: parts the draft adds by part, read, with newSource false.
3. CLI: --fail-preexisting, refused without --state, exits 1 on a non-empty list; a summary line names the modules.
4. Action: the plan names the bound modules it adds; the Action lists those that were read and gained no source, in the comment. Input preexisting (warn, fail, off; default warn) mirrors out-of-plan and honors the override label.
5. Docs: design-lens and the site pages pull-requests and home-repo. The CLI and Action reference pages are generated from the contracts and action.yml. archboard-plan keeps its per-ticket gate: a ticket branch leaves code to later tickets, so --fail-preexisting would fail it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions:
- Names: the list is `preexisting`, the gate `--fail-preexisting` (outcome `preexisting`, exit 1), each listed module carries `newSource`, and the Action input is `preexisting` (warn, fail, off; default warn), mirroring `out-of-plan` and its override label.
- The rule reads the net change from the merge base, the same range as `changed`, not the tip of --base.
- Path bindings: the branch adds source when the net diff adds a file (status A) inside the binding. A directory that gains a new file is not preexisting. A rename moves code and adds none, so a moved module counts as preexisting.
- Declaration bindings: the branch adds source when the merge base lacks the declaration and the head has it. When the declaration cannot be read, the path rule applies, as attribution does.
- A module bound to a path that exists nowhere is preexisting: the branch adds none of its source.
- The Action computes the list from its own plan (added bound modules) and `newSource`, because after adoption on the branch the CLI has no draft to set against. An older CLI without `newSource` never makes a changed module preexisting.
- archboard-pr evidence case says "so that its markers compare with the review base" in place of "from the base branch": on the base branch the proposal does not exist.
- renders.md listed `legend` among flags render lacks; `--legend` exists, so it was removed from that list.

Follow-up from the owner: Mermaid is forbidden for flowcharts and sequence charts in both skills, the description uses the owner wording (it replaces the "architecture diagrams and flowcharts" parenthesis), archboard-pr prefers sequence charts for timing and call routing, and the Action counts fenced mermaid blocks (backtick or tilde fences) between the archboard-pr begin and end comments. A section without its end runs to the end of the body. The warning has no input, because it never fails.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard-pr now asks for logic as proposal flows rendered as flowcharts, requires every chart in the body to come from a model flow, and requires every added subject to bind source that the diff adds, with existing source modeled in Current first. renders.md matches legend counts with model compare and the diff before posting. The archboard skill description triggers on architecture diagrams and flowcharts.

model footprint marks each listed module with newSource, lists preexisting modules for a draft, and --fail-preexisting exits 1 on them. The pull-request Action lists them in its comment and judges them with a new preexisting input (default warn, fail is opt-in, override label honored). It computes the list from its own plan, so it works for a draft and for a proposal adopted on the branch.

Verification: new system test with real Git fixtures (existing directory changed, unchanged file, existing declaration, new file, directory with a new file, new declaration); Action plan and comment tests; full bun run check passed (26 of 26 tasks); the docs site builds and its guide and link checks pass.

Risk: the default warn adds an annotation and a comment group on pull requests whose proposals add modules for existing code.
<!-- SECTION:FINAL_SUMMARY:END -->
