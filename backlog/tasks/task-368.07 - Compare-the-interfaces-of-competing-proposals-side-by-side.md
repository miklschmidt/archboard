---
id: TASK-368.07
title: Compare the interfaces of competing proposals side by side
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:17'
updated_date: '2026-10-06 12:08'
labels:
  - interfaces
  - cli
  - skill
dependencies:
  - TASK-368.06
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: medium
type: feature
ordinal: 643000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Design it twice (Ousterhout): the first interface is rarely the best, so a designer drafts two or more and compares them. Archboard already branches competing drafts from one base and shelves the losers with a reason (ADR 0030). What is missing is one answer that puts their interfaces side by side.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One command reports each container's interface measures for two or more variants in one answer
- [x] #2 The propose recipe of the consumer skill describes design it twice: branch two or more drafts under different constraints, compare the measures and the pictures, adopt or keep one, and shelve the rest with the reason
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Boards: no board is affected (archboard-dev step 1). The Comparison card of Command interface binds src/cli/commands/semantic-compare.ts and its responsibility stays true; the change adds no part and no relationship (compare already reads the shared model, which no board binds). Same call as TASK-368.02 and TASK-368.06. No proposal is branched.
2. CLI: extend semantic compare rather than add a command. A new section interfaceMeasures in every compare answer: the variants read (the variant, the one it is read against, then each --beside variant) and, for every node that has children on any of them, the five counts on each variant from inspectContainer + interfaceMeasures, with the entry points and the pass-through entry points named (ADR 0044 names pass-through beside the measures of competing proposals). A node with no children on a variant says it holds no parts there. No standing, no score, no rank. New repeatable option --beside <variant> (occurrences: append), resolved by id or name, refused by name when unknown, deduplicated. Schema in src/cli/commands/lib/measured-interfaces.ts, sharing the measures schema with the inspect answer. Human answer: one line per container after the interface-change lines, before Other changes.
3. Help derives 'repeatable' from occurrences: append in commander.ts (first command to use it).
4. Tests: comparison-answer.test.ts owns the section (counts per variant, holds no parts, pass-through named, order, no standing; --beside resolution); parameters.test.ts owns that an append option collects every occurrence.
5. Skill: propose-compare.md gains design it twice (branch two or more drafts under different constraints, compare the measures and the pictures, adopt or keep one, shelve the rest with the reason), portable terms, archboard names only in the worked example; read.md step 4 names the interface section and the measures; variants.md one pointer if its foreign hunk is committed.
6. Evals: new scenario S17 (propose-compare, read then shelve) with fixture (S16's board, two drafts that give Flask app different interfaces) and captures of the three variants; coverage rows for the interface section and the side-by-side measures. bun run eval:skill check.
7. generate:skill-artifacts, cli-command-audit.json entry, bun test --isolate src/runtime/skill-evaluation tests/system/cli/install-targets.test.ts, then gate lanes one at a time.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (commits on main): semantic compare answers interfaceMeasures {variants, containers[{container, byVariant[]}]} from inspectContainer + interfaceMeasures per variant (src/cli/commands/lib/measured-interfaces.ts); --beside <variant> repeatable (occurrences: append, the first option to use it; help now derives 'repeatable' in commander.ts). NOTHING_TO_COMPARE refusal moved into read-against.ts beside the throw, to keep semantic-compare.ts under the 600-line cap. Tests: src/cli/commands/tests/interface-measures.test.ts, src/cli/command-contract/tests/parameters.test.ts (append). Skill: propose-compare.md 'Design it twice', read.md step 4, variants.md pointer. Evals: S17 scenario + fixture, coverage rows; waiting to commit evals.json/coverage.json/cli-command-audit.json until other agents' hunks there are committed.

Decisions the ADR did not settle:
- Command: extend semantic compare (TASK-368 AC #2 names it) with one repeatable option --beside, rather than a new command or a repeated --variant (which would make the first --variant special). Every compare answer carries the section, so one draft against now also reads its counts beside the base.
- Variants read: the variant, the one it is read against, then each --beside in the order named; a --beside naming one already read is dropped; an unknown name is a usage error naming the board's variants.
- Containers: every node with children on any variant read, by node id, named as the first variant that holds it names it; order is the first variant's document order, then the containers only later variants have. A node absent or childless on a variant is holdsParts: false there (not zero entry points).
- Per variant: the five counts plus the entry points and pass-through entry points named (ADR 0044 names pass-through beside the measures of competing proposals). Hidden parts, callers and outgoing are counts only; semantic inspect --container lists them.
- No shelving reason in the answer: the variant entry carries its lifecycle; the reason lives in the board's shelvings.
- Human answer: one line per container after the interface-change lines, before Other changes (hero clip reads Other changes by prefix, unaffected).
- Board: none affected (as planned).

Committed evals and audit (cb186f616) by staging only my hunks with git apply --cached, as the coordinator directed. Between my check of the staged diff and the commit, TASK-367.04 staged its own hunks in the shared index, so cb186f616 also carries its evals.json features edge.anchor, binding.symbol and step.anchor and its coverage rows node.binding.symbol and edge.anchor/step.anchor. Not rewritten (no amend or rebase); TASK-367.04 should treat those hunks as committed. bun run eval:skill check: suite ok, 20 scenarios. Gate (run one lane at a time before the eval commit): lint 0, fmt:check 0, type-check 0, build:frontend 0, test:modules 3996 pass, test:system 192 pass, test:repository 20 pass, test:serial-browser pass.

Independent review (2026-10-06): the design-it-twice step adopted a chosen draft without being asked, so the chosen draft now stays a draft until the request says to adopt (b63a7a7d1). A draft with no caller now says so beside its measures, InterfaceMeasuresSchema satisfies the shared type, and the ordering test checks its claim (7aa84e38e). SKILL.md points at the section, and the coverage row names the owning test (b35465fcb).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
semantic compare now reports the five interface measures of every container for the variant, the one it is read against and each --beside variant in one answer, unranked and with no score, and names pass-through entry points and drafts that draw no caller. propose-compare.md describes design it twice: branch drafts under different constraints, compare the measures and the pictures, keep or adopt one when asked, and shelve the rest with the reason. Verified by interface-measures.test.ts (pass with --isolate), an end-to-end S17 run on a scratch server, and eval:skill check.
<!-- SECTION:FINAL_SUMMARY:END -->
