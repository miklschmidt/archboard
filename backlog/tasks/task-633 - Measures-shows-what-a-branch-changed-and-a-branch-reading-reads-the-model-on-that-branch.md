---
id: TASK-633
title: >-
  Measures shows what a branch changed, and a branch reading reads the model on
  that branch
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T23:34:00Z'
updated_date: '2026-11-13T02:13:00Z'
labels:
  - ready-for-agent
dependencies: []
documentation:
  - docs/adr/0045-git-history-is-read-through-bindings-on-request.md
  - CONTEXT.md
priority: high
type: feature
ordinal: 1074000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem Statement

An architect reviews a branch, a pull-request stack layer or an agent's work. The question is simple: which modules did these commits change, and did the proposal plan each of them? Today only the CLI (`archboard model footprint --base main`) and the pull-request Action answer it, and both answer in text. The browser shows other Git readings, such as locality in About and `What changes together` in Measures, but no branch footprint.

The CLI answer has two more limits. It reads the commits up to a head, but it maps them through the vault on disk, which belongs to the chosen checkout. If a branch adds its own proposal or moves a binding, the footprint still reads another branch's model. So the branch is never set against its own plan. Also, to see the branch's architecture, a reader must check the branch out.

## Solution

Measures gets a fourth view, `What this branch changed`. Two searchable drop-downs choose a base and a head from the branches of every repository that the model binds. A third drop-down, `Against`, chooses the state that the commits are set against. The view lists the modules that the commits changed. With a proposal, it shows the three lists of ADR 0045: changed but not named, named and changed, and named but not changed. It also lists skipped modules and changed files that no module binds.

If the vault's repository holds the head, Archboard reads the vault as that head holds it. It reads from Git, without a checkout. This is a branch reading. The footprint then uses the branch's own proposals and bindings. The browser can open the branch reading as a read-only reading. `Show on picture` opens the nearest module that holds a list's modules, in that reading, and selects them through the ordinary selection. The picture gains no new mark.

The CLI gets the same behavior through the same route. `--model-at checkout` keeps the old behavior for a gate that must read the proposal on disk.

## User Stories

1. As an architect, I want a Measures view of the modules that a branch changed, so that I can review a branch without the CLI.
2. As an architect, I want a searchable list of branches for the base, so that I need not type a ref exactly.
3. As an architect, I want the base to default to `origin/HEAD`, else `main`, so that the usual review needs no choice.
4. As an architect, I want a searchable list of branches for the head, so that I can review a branch that no checkout has out.
5. As an architect, I want the head to default to the chosen checkout's branch, so that the view opens on my current work.
6. As an architect, I want the default head to read each repository at its own HEAD, so that branches with different names stay readable.
7. As an architect, I want a detached default head to show its commit, so that I know what it reads.
8. As an architect, I want each branch to name the repositories that hold it, so that I know what a choice leaves unread.
9. As an architect, I want to type any ref that the list does not hold, so that I can name what the CLI can name.
10. As an architect, I want the vault read at the head, so that the footprint uses the branch's own proposal and bindings.
11. As an architect, I want the view to name the vault it read, so that I know which model it used.
12. As an architect, I want an `Against` list of the current state and the active proposals, so that I choose the plan.
13. As an architect, I want `Against` to choose the likely plan by itself, so that the common case needs no click.
14. As an architect, I want `Changed but not named` first, so that I see first what the plan missed.
15. As an architect, I want each module's commits and the reason the proposal names it, so that I can judge each entry.
16. As an architect, I want a module to name the changed modules it holds, so that I can tell its own change apart.
17. As an architect, I want large commits marked, so that I know which changes only seem related.
18. As an architect, I want unread modules listed with their reason, so that a skipped module never looks unchanged.
19. As an architect, I want the changed files that no module binds, so that I see change that no module shows.
20. As an architect, I want each repository's base, merge base and head commits, so that I can see a stale answer.
21. As an architect, I want each unread repository named with its reason, so that I can fix the ref.
22. As an architect, I want reads only on opening and on Refresh, so that a review costs no background Git work.
23. As an architect, I want an answer kept for the same inputs, so that I can return to it without a new read.
24. As an architect, I want `Show on picture` for each list, so that I see that list's reach on the architecture.
25. As an architect, I want it to open the nearest module that holds the whole list, so that one picture shows them.
26. As an architect, I want it to select each drawn listed module and each drawn holder, so that the doors are lit.
27. As an architect, I want to expand a lit module myself, so that the view never expands a large tree at once.
28. As an architect, I want `Show on picture` to open the head's branch reading, so that modules the branch adds are drawn.
29. As an architect, I want a row to open its own module, so that I can go to one module directly.
30. As an architect, I want a branch reading to name its branch and commit, so that I never take it for my checkout.
31. As an architect, I want a branch reading to offer no edit, claim or recording, so that I cannot write to it.
32. As an architect, I want a branch reading's address to survive a reload, so that I can share and return to it.
33. As an architect, I want a branch reading to compare a proposal with its base, so that I see what the branch plans.
34. As an architect, I want a checkpoint reading to offer no footprint and say why, so that I am not misled.
35. As an agent, I want `--head <ref>` to read the vault at that head, so that `--state` names a stack layer's proposal.
36. As an agent at the archboard-plan gate, I want `--model-at checkout`, so that the gate reads the proposal I just edited.
37. As an agent, I want the answer to name the vault it read, so that I can report it in a pull-request body.
38. As a pull-request reviewer, I want the Action to behave as before, so that its report does not change.

## Implementation Decisions

- ADR 0045 gets an amendment. A footprint stays derived on request, stored nowhere and drawn as no mark. Measures becomes a place where a user sees it. `Show on picture` uses the ordinary selection, which the user asks for and which lasts until the next selection. That is not a mark that a reading sets. The server still keeps no footprint.
- A branch reading is a new kind of reading, beside the current state, a proposal and a checkpoint. It reads the vault's input files at a commit of the vault's repository, from Git objects. The checkpoint reader reads `inputs/` from the history archive in the same way. The same canonical decoder decodes them. It needs no checkout and does not change the working tree, the index or HEAD. Its revision names the commit. It is never live, writable, claimed or retained. A ref that the vault's repository does not resolve is refused with a code that names the ref.
- The canonical read entry and the model routes accept a source ref beside `state` and `checkpoint`. A request that names a ref and a checkpoint is refused. `state` and `against` resolve inside the vault that was read.
- The reading address gets a source ref field for each pane, as it has `checkpoint`. Selecting another state keeps the ref. Selecting the checkout's Current clears it.
- The reading stage shows a branch reading with a chip in the heading. The chip names the ref and the short commit. A branch reading follows no live feed. It offers no edits, claims, publication, walkthrough recording or Explain. Comparison works.
- The history lens footprint takes an optional `modelAt`: `head`, the default, or `checkout`. It reads the selected state through the branch reading at the head in one case only: the caller names a head, the vault's repository resolves it, and `modelAt` is `head`. In every other case it reads the vault on disk. The answer gains a field that names the vault it read: the vault on disk, or the ref and the commit.
- The footprint answer of a proposal keeps its three lists. The browser shows `Changed but not named` first. The CLI output keeps its order.
- The browser chooses the default of `Against` from the states of the vault that it will read. If that vault has the state on screen, it takes that state. If not, it takes the one proposal that the head adds over the base. Such a proposal is in the vault at the head and not in the vault at the merge base. If there is no such single proposal, it takes the current state.
- A new route, `GET /api/architecture/refs`, names its vault. It lists the local and remote branches of every repository that the selected state binds. It reads each repository in its chosen checkout, and the vault's repository in the vault's own checkout. It merges the entries by name and lists, for each, the repositories that hold it. It reads no remote, never fetches and lists no tags.
- The same route names the default base of the vault's repository: `origin/HEAD`, else `main`, else none. It also names the vault checkout's branch, or its HEAD commit for a detached HEAD.
- The browser query for the footprint is keyed by the model revision, the base, the head, `against` and `modelAt`. It reads at two times only: when the view opens, and when the reader presses Refresh. It keeps no timer.
- The default head sends no `head`, so each repository reads up to its own checkout's HEAD. Any other entry sends `head`.
- The three drop-downs are searchable lists built from the ui-kit's `Command` and `Popover`, as composite components. A typed value that no entry matches is offered as `Use "<text>"`.
- `Show on picture` finds the nearest shared parent of a list's modules in the reading it will open. It opens that module. If the modules share no parent, it opens the root reading. It selects each listed module that the picture draws, and each drawn module that holds a listed module. With a head that is not checked out, it opens the branch reading of the head, with `against` as its state.
- A row of the view selects its own module, through the same reader choice that the other Measures rows use.
- With a checkpoint on screen, the view is disabled and says that a checkpoint is not live.
- `archboard model footprint` gets `--model-at <head|checkout>`, default `head`. Its help says that `--state` resolves in the vault that it reads.
- The archboard-plan gate passes `--model-at checkout`. The archboard-pr skill describes the branch reading for stack layers.
- `CONTEXT.md` defines `Branch reading` and updates `Reading`, `Measures` and `Branch footprint`. DESIGN.md describes the view, the drop-downs and the chip of a branch reading.

## Architecture Proposal

- Proposal: "A reader sees what a branch changed and reads the model on that branch", `a5K6IbA8`, in model `vKEsyHFk`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=a5K6IbA8, compared with Current by default. A worktree server serves the same address on its own port.
- Picture: `archboard model render --state a5K6IbA8 --out <file>` draws it. The flows are `Read what a branch changed` and `Show a branch footprint on its picture`, in the collection Browser application.
- Changes:
  - Interface: `Reads and server health` gains the entry point Architecture history routes.
  - Interface: History lens becomes an entry point of `code-intel`, and Architecture history routes calls it.
  - Interface: `Model access`, `Workspace routing` and `Panes and workspace` gain the caller Branch footprint.
  - Added: Branch reading reads the vault at a source ref from Git, as a model that cannot be edited.
  - Added: Architecture history routes serve locality, the branch footprint and the source refs.
  - Added: Branch footprint is the Measures view `What this branch changed`.
  - Changed: History lens reads the vault at a named head, names the vault it read, and lists source refs.
  - Changed: Measures holds the fourth view.
  - Changed: Read entry reads a branch reading for a named source ref.
  - Changed: Canonical model routes accept a source ref.
  - Changed: Model address carries the source ref of a branch reading.
  - Changed: Reading stage shows a branch reading as read-only.
  - Changed: Model footprint reads the vault at the head, and `--model-at checkout` reads the vault on disk.
  - Changed: Code check's state reader reads one state at a source ref, for the footprint of a named head.
  - Added relationships: History lens calls Code check to read the selected state at the head. Read entry calls Branch reading. Architecture history routes call History lens. Model queries call Architecture history routes over HTTP. Branch footprint calls Model queries and Model address. Measures renders Branch footprint.
  - Added flows: "Read what a branch changed" and "Show a branch footprint on its picture", in the collection Browser application.

## Testing Decisions

- A good test drives a public interface with real inputs and asserts the answer or the visible result. It does not assert wording, styles or internal calls (`docs/agents/test-suite.md`).
- Seam 1 is the model package's public read. A temporary Git repository commits a vault on a branch that is not checked out. That branch has a proposal that the checked-out branch does not have. The read entry with that ref returns the branch's model and proposal. The working tree, the index and HEAD stay unchanged. An unknown ref is refused with its code. Prior art: the tests of the canonical checkpoint reader, which build real archive commits through the public API.
- Seam 2 is the history lens's public operations, with temporary repositories, as in the existing footprint tests. They cover a head whose vault adds a proposal and moves a binding, and the `checkout` mode. They cover a head that only a code repository holds, where the lens reads the vault on disk. They cover the field that names the vault. They cover the ref listing: merged names, the default base and a detached HEAD.
- Seam 3 is one browser-lane owner beside the Measures owner, with a real server and a real temporary repository. It covers the defaults of base and head, a head that is not checked out, and the default of `Against`. It covers the three lists and Refresh. It covers `Show on picture`: the shared parent opens in the branch reading with the right selection. It covers the read-only branch reading and its address after a reload.
- The CLI gets no new owner. The existing CLI contract test of the query parameters covers `--model-at`.

## Out of Scope

- Reading a model at a ref in any other CLI command, such as `archboard model read --ref`.
- Tags in the drop-downs.
- Fetching from a remote. The lists show only what each checkout already has.
- Any new mark, color or emphasis on the picture for a footprint.
- Changes to the pull-request Action.
- Storing a footprint on the server or in the vault.
- Editing, claiming or recording in a branch reading.

## Further Notes

- The grilling of 2026-11-12 settled these decisions, Q1 to Q16. The user chose to read the vault at the head (Q7, Q13), because the view serves mostly heads that carry their own proposal or bindings.
- A branch reading reads only what the vault's repository holds. A branch that exists only in another clone, with its own `.git`, is not listed.
- The archboard-plan gate change and the default of `--model-at` must land together. Then no gate reads a stale proposal from a ticket branch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Measures has a view, `What this branch changed`, that reads the branch footprint of a chosen base, head and state
- [x] #2 A head that the vault's repository holds is read with the vault at that head, and the answer names the vault it read
- [x] #3 A branch reading opens as a read-only reading, and `Show on picture` selects the listed modules and their drawn holders at the nearest shared parent
- [x] #4 `archboard model footprint` reads the vault at the head, and `--model-at checkout` reads the vault on disk, which the archboard-plan gate uses
- [x] #5 ADR 0045, CONTEXT.md, DESIGN.md and the archboard, archboard-plan and archboard-pr skills match the delivered behavior
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All five subtasks are Done. The whole-branch gate (archboard model footprint --base main --state a5K6IbA8 --fail-outside) passes with recorded exceptions for tickets, tests and the vault. namedNotChanged holds Read entry and Archive object I/O, which are relationship ends only, and Model footprint, whose --model-at change lives in shared words and option helpers that the Commands exception covers. Interface width: code-intel exports one readArchitectureHistory(vault, {analysis}) instead of three reads, and the server mounts one route per analysis, so code-intel stays at its ceiling of 11 (ADR 0058). Known flaky tests outside this change (exclusion.test.ts, repositories, browser-show-checkout) pass alone; the Audit and Update Dependencies thread owns them. Waiting on the user: acceptance of the ADR 0045 amendment of 2026-11-13.

Main adopted the telemetry proposal e3T8Mjgq from TGDLt5Ea before this PR merged, which superseded a5K6IbA8. Proposal 7Kc2FJFu carries the same changes on e3T8Mjgq (3 modules, 9 relationships, 16 descriptions, 2 flows with 22 steps, compared field by field) and is adopted on PR #118. a5K6IbA8 could not be shelved, because the local archive holds four retired TGDLt5Ea checkpoints (STATE_AMBIGUOUS), so the branch drops its never-merged file. Gates that named a5K6IbA8 now name 7Kc2FJFu.
<!-- SECTION:NOTES:END -->
