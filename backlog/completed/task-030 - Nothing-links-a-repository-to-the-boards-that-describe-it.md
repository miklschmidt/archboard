---
id: TASK-030
title: Nothing links a repository to the boards that describe it
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 22:56'
updated_date: '2026-08-20 03:43'
labels:
  - needs-triage
dependencies: []
ordinal: 30000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An agent standing in a repo can find which boards describe it, without being told
- [x] #2 Works when a board spans several repositories
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
An agent standing in a strange repo asks the vault which boards have nodes bound to that repository.
The data is already there: TASK-031 made every binding carry a repository identity, so this is a
query, not new state.

Shape: a filter on `board list`, not a new command. "Which boards describe this repo" is the same
question as "what boards are there", narrowed. That also keeps the MCP surface in step for free —
`list_boards` gains the same optional argument — with no new tool and no cheatsheet edit (which
another agent owns right now).

1. src/core/repo-boards.ts — given a repository identity, the boards with nodes bound to it. Reads
   every note in the vault, pulls the scene out, and collects customData.archboard.binding.repo
   matches, reporting node id, kind, name and path per board. Open boards are scanned from memory
   instead, so unsaved work counts and a board that is open wins over its copy on disk.

2. GET /api/boards?repo=<identity> filters `boards` to matches and annotates each with its bound
   nodes. Without the parameter, nothing changes.

3. CLI: `board list --repo <identity>` and `board list --here`. `--here` resolves the working
   directory to a repository identity in the CLI process, where a working directory exists and is
   the caller's own, and the answer echoes the identity it found — the server never resolves an
   ambient path (ADR 0010). `--text` prints board, variant, file and the nodes that matched.

4. MCP: list_boards gains `repo`, identity only, because that surface has no working directory.

5. Cover it in scripts/check-repos.mjs: a board spanning two repos is found from either one, a
   board bound to neither is not, an unsaved board on the canvas counts, and `--here` finds the
   repo the caller is standing in.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WHAT LANDED

- src/core/repo-boards.ts: given a repository identity, the boards with nodes bound to it. Reads
  every note in the vault, extracts the scene, and collects customData.archboard.binding.repo
  matches, deduplicated by node id so a labelled box counts once. Boards open on the canvas are
  read from memory instead of from their notes, so unsaved work counts and the open copy wins.
- src/core/board.ts gains extractSceneElements(note), the read the scan needed.
- GET /api/boards?repo=<identity> narrows `boards` to matches and annotates each with its nodes,
  its source (vault or memory) and its file. Without the parameter the response is unchanged.
- CLI: `board list --repo <identity>` and `board list --here`, plus `--text`. --here resolves the
  working directory to an identity in the CLI process and echoes what it found; the server is only
  ever handed an identity, never a path (ADR 0010). A canvas server too old to know the filter is
  detected and refused rather than answered with every board.
- MCP: list_boards takes the same optional repo. No new tool, so the surface stays paired.

WHY A FILTER ON `board list` AND NOT A NEW COMMAND

"Which boards describe this repo" is "what boards are there", narrowed. Making it a filter kept the
MCP surface in step with one argument instead of a new tool, which matters here because the tool
cheatsheet a shell-less client reads is owned by another agent this session and could not be
edited.

VALIDATION

`bun run test` green, including 20 new checks in scripts/check-repos.mjs. `bun run type-check`
clean.

AC1, an agent standing in a repo finds its boards without being told. From inside a throwaway repo,
with nothing written in that repo and no argument given:
  $ canvas board list --here --text
  Standing in github.com/acme/payments.
  Boards describing github.com/acme/payments:
    systems (current, system, vault)
      Payments [service] -> src/service.ts
  Open one with `board open systems`.
Outside any repository it is a usage error naming --repo, not an empty answer. A repository nothing
describes gets "No board ... has a node bound to X (2 board(s) read)", so an empty answer is
distinguishable from an empty vault.

AC2, works when a board spans several repositories. The same board, which is named after neither
repo, is found from both, each time listing only that repository's nodes:
  standing in payments -> systems, node "Payments [service]"
  standing in ledger   -> systems, node "Ledger [datastore]"
Covered in check-repos.mjs from both sides, plus: a board open but never saved is found and marked
source=memory, the vault scan alone finds the saved board with its binding read back out of the
note, and an MCP client gets the same answer from list_boards { repo }.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 22:56
---
Surfaced while writing INSTALL.md. The skill tells an agent archboard exists; nothing tells it which board covers the repo it is standing in. The guide's workaround is a line in the repo's own CLAUDE.md, which works and is manual.

There is a better answer available for free: nodes already carry a binding with a repo identity, so 'which boards have nodes bound to this repo' is answerable from data archboard already stores. That also handles the case a naming convention cannot, where one system board spans five repos and belongs to none of them.

Worth doing after the current queue. It is the last thing standing between an agent opening a strange repo and finding its architecture without a human in the loop.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Boards now answer for the repositories they describe. `board list --here` (or --repo <identity>) narrows the listing to boards with nodes bound to that repository, each match listing the nodes that matched, read from the bindings rather than from board names so a system board spanning five repos is found from any of them. src/core/repo-boards.ts does the scan, GET /api/boards?repo= exposes it, and list_boards takes the same argument so MCP keeps pace with no new tool. Verified by 20 new checks in scripts/check-repos.mjs, including a board found from both of the two repositories it spans, an unsaved board on the canvas counting, the vault scan on its own, and the same question answered over MCP; also demonstrated by hand from inside two throwaway repos.
<!-- SECTION:FINAL_SUMMARY:END -->
