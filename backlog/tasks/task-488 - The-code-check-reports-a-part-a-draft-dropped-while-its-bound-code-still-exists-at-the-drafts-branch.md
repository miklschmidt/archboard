---
id: TASK-488
title: >-
  The code check reports a part a draft dropped while its bound code still
  exists at the draft's branch
status: Done
assignee:
  - '@claude'
created_date: '2026-10-16 13:37'
updated_date: '2026-10-17 04:42'
labels:
  - code-check
  - board-store
dependencies:
  - TASK-487
priority: low
ordinal: 853000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-487 refuses, at write time, a draft that removes more than half of what it inherited. That refusal is a count: it cannot tell a part the PR deleted from a part the author forgot, and it misses a drop of one or two parts. The code check can tell them apart with evidence. If the predecessor holds a part, the draft lacks it, and the part's bound path or symbol still exists in the draft's code, the part was most likely dropped by mistake. Many drafts that describe a PR carry `binding.branch` on their parts, so the check knows which ref to read.

Why this is a follow-up and not the guard. The damage on Device Trust Control Plane and Endpoint Gateway (14 October, repaired 2026-10-16, see TASK-487) spread to every draft below in the same write, so a check that runs after the write and only on request cannot prevent it. What broke there was identity between variants, which the code does not know. The write-time refusals of TASK-487 stay the guard, and this finding adds code evidence for the drop case.

Why it must read every draft. Plain `check --code` reads only the current variant of each board, and `--variant` reads one named draft per board. A PR stack is all drafts: Device Trust Control Plane holds eleven in a row and no current variant. Neither form would have seen this damage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With the code check, a draft that lacks a node its predecessor holds, while that node's bound path (and symbol, when it names one) exists in the code the draft is read against, gets a warning with its own code that names the node, both variants and the evidence
- [x] #2 A node whose bound code is gone from that code is not reported, shown by a test
- [x] #3 The code check can read every draft of a board, each against the ref its bindings name, in one run, and reports which drafts it could not read and why (for example, a checkout that lacks the ref)
- [x] #4 Run against the 14 October state of Device Trust Control Plane, the check reads every draft and reports nothing for feat/device-trust-authorities, because that branch held none of the dropped parts' code; read against feat/device-trust, which holds that code, it reports all 11 bound parts the draft dropped
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
(1) dropped-parts.ts in the code check: a bound node the predecessor holds and a read draft lacks, whose path (and symbol) exists in the code the draft is read against, is the warning INHERITED_PART_DROPPED with a structured dropped field. (2) A draft is read per repository against the one ref its bindings name that no ancestor names, else the single ref they name; none reads the files on disk; several or a missing ref is a draft skip. A ref is read through Git (ls-tree, cat-file), never checked out. (3) Every-draft form: check --code --every-draft, GET /api/vault/code-check?every-draft=true. (4) Tests in src/runtime/code-check/tests. (5) Skill references and generated artifacts. (6) AC4 on a scratch vault from Docs-Architecture-Design e7527cd.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 implementation: new src/runtime/code-check/lib/dropped-parts.ts. A read draft with a predecessor (variant.parent) is held to every bound node the predecessor holds and it lacks; a bound path with files in the code the draft is read against (and the symbol defined there, when named) is the warning INHERITED_PART_DROPPED, subject the node, variant the draft, path the predecessor's binding, and a structured dropped field {from, repo, ref, commit, path, symbol, file, line}. Gone code, an undefined symbol, or a symbol found only in unparsed code gives nothing. The code a draft is read against, per repository: the one ref (binding.commit, else binding.branch) its bindings name that no ancestor names, else the single ref they name; read through the history lens (new sourceAt: rev-parse of the name, then refs/remotes/origin/<name>, then ls-tree and cat-file, never a checkout). No ref means the checkout's files on disk. Draft skips (board, variant, repo, no subject): draft-ref-missing (detail is the ref), draft-refs-ambiguous (detail lists refs), repository-unregistered. Every-draft form: readEveryDraftToCheck, GET /api/vault/code-check?every-draft=true, 'archboard check --code --every-draft' (refused without --code or beside --variant); behind reads each board once. Decision: --every-draft reads drafts only, each as a named draft, so the rest of the pass runs on them too (pinned parts still skip as ref-not-checked-out). Tests: src/runtime/code-check/tests/dropped-parts.test.ts (5), route and CLI tests extended. Skill: variants.md stack recipe step 5 and the warning; SKILL.md code-check paragraph. AC4 on a scratch vault from Docs-Architecture-Design e7527cd (board unchanged since 5913181), worktree server with a scratch registry pointing Platform at /home/msc/Work/Platform (the machine registry's chosen Platform checkout, the Docs-Architecture-Design submodule, has none of the device-trust branches): all 13 drafts read, no draft skipped, zero INHERITED_PART_DROPPED. The 11 bound parts feat/device-trust-authorities (CXfkzPzw) dropped are all absent from that branch (tip 3e3208ffe, unchanged since 2026-10-14 03:58; also absent at its earlier tips 38b6569be and f9eb8a6f5): later pull requests in the stack build them, so code evidence cannot flag them and the TASK-487 refusals remain the guard. A labelled what-if copy reading that draft at feat/device-trust reports all 11.

AC4 reworded on 2026-10-17 from 'reports the parts feat/device-trust-authorities dropped'. Evidence: on the real refs the check read all 13 drafts, skipped none and raised 0 INHERITED_PART_DROPPED, because the 11 bound parts CXfkzPzw dropped have no files at feat/device-trust-authorities (tips 3e3208ffe, 38b6569be, f9eb8a6f5): the stack's later pull requests build that code. This is the case the description foresaw: the parts were planned for later pull requests, so the code cannot tell a planned part from a forgotten one there, and the TASK-487 write-time refusals stay the guard. With CXfkzPzw re-pinned to feat/device-trust in a scratch copy, the check reported all 11. Validation on feat/derived-overview after cherry-pick (42a1f98ac): bun test --isolate src/runtime/code-check src/runtime/history-lens src/server/archboard src/cli 456 pass 0 fail; tsc and lint clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added INHERITED_PART_DROPPED: the code check warns when a draft lacks a bound node its predecessor holds while the node's path (and symbol) still exists at the ref the draft is read against. archboard check --code --every-draft reads every draft of a board, each against its own branch, and names drafts it could not read. Verified by dropped-parts.test.ts and the route and CLI tests; on the real 14 October board it correctly reports nothing because the dropped parts' code was not yet built on that branch.
<!-- SECTION:FINAL_SUMMARY:END -->
