---
id: TASK-211
title: Overhaul the archboard skill around efficient board workflows
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-13 23:15'
updated_date: '2026-09-18 11:01'
labels: []
dependencies:
  - TASK-207
  - TASK-208
  - TASK-209
  - TASK-210
references:
  - skills/archboard/SKILL.md
  - skills/archboard/references/architecture-workflow.md
  - skills/archboard/evals/evals.json
  - INSTALL.md
  - TASK-208
  - skills/archboard-dev/SKILL.md
  - TASK-207
  - TASK-212
  - TASK-213
type: enhancement
ordinal: 370000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agents currently need extra help/config/reference discovery to use archboard, while the main skill spends substantial context on detailed semantics without giving complete workflows for both diagram types. The overhaul should minimize total author tokens per successfully completed workflow, not simply document length or raw tool-call count.

Agreed design:
- Primary workflows: create architecture and sequence diagrams from real code, update a board, and propose/compare an architectural change. Common paths should be executable after SKILL.md plus at most one targeted reference.
- Explain capabilities and when each diagram type fits; sequence diagrams use the current data-flow grammar. Provide step-by-step CLI recipes grounded in genuine use cases.
- Keep shared essentials and concise workflow routing in SKILL.md; generously link conditional use cases, grammar and schema explanations at the point where they apply. Description frontmatter is the skill trigger.
- Installation guidance references INSTALL.md. Vault configuration and both full generated schemas must be directly reachable after installation as well as in this checkout.
- Preserve the current hard-won dos/donts. Reduce redundant discovery, not semantic judgment or necessary verification.
- Additional CLI behavior improvements discovered during this work must be separate subtasks under TASK-208. Existing help defects already covered there must not be duplicated. This task does not implement CLI behavior changes.

Guardrails to preserve, with authority checked against the current product during implementation:
- Author meaning, never layout hacks, fake relay nodes, or falsified architecture to force a render. Calls reach their actual internal receiver; containment is not a call.
- Use consumer vocabulary and board levels; do not change configuration merely to make a write pass. Separate linked boards describe different subjects/detail levels; variants represent evolution of the same diagram.
- Read before edits, use the read version and --doing, make one requested change in one batch, and retain fields on restated replacement definitions. Preserve continuing IDs; use new IDs for real replacements; retain flow/step identity by action. Preserve the edge replacement rule for two or more changed authored properties, including effective traffic defaults.
- Use portable registered repository bindings. Shared views belong to the board, not individual variants. Compare predecessor and proposal through the same view; verify saved meaning and visible additions/deletions, including sequence changes.
- Claim substantial multi-write work, release afterwards, and respect lost claims. Adopt only when asked. Preserve actionable completion diagnostics and report renderer defects rather than corrupting meaning.

Use the preceding eval and schema tasks as prerequisites. Measure baseline before changing the skill; run the accepted candidate through the same harness. The comparison uses the same CLI for both skill packages; if TASK-208 changes it, pin both runs consistently. This is planned future work; no implementation is requested in this planning session.

Ongoing maintenance is part of this deliverable: update the canonical skills/archboard-dev guidance so an agent changing Archboard checks whether the change invalidates or alters the consumer skill workflows. Relevant triggers include CLI inputs/outputs and ordering, diagram grammars, semantic identity/comparison rules, vocabulary/configuration, schema generation/distribution, installation, and verification behavior. Update affected skill recipes, references, examples, schema links and eval fixtures alongside the product change, then synchronize the derived skills.

The developer guidance must preserve the success contract agreed here: report total tokens per successful workflow; keep common architecture/sequence creation, editing and proposal paths usable with the main skill plus at most one targeted reference; retain truthful semantics and all material guardrails; keep conditional documentation discoverable and installed links usable. Explain the evaluation procedure and link its canonical commands/rubric rather than duplicating the harness manual: pinned real Flask scenarios, isolated installed-skill runs, Luna/high authors, blinded Astra/high quality grading in one session without subagents, three parallel repetitions per version, controlled comparisons and separately reported discovery/operational costs. The overhaul must demonstrate no quality regression; future maintenance must preserve correctness and efficiency, and account explicitly for changed product contracts when an old recipe is no longer executable. Median author tokens are reported, never required to fall: an increase that buys more or better completed work is the outcome we want, and the report says by how much it moved. Do not count an incompatible old workflow failing early as an efficiency win.

Feature completeness is part of successful skill use: TASK-209 scenarios declare expected semantic features and the Astra grader checks correct scenario-specific use rather than presence alone. The overhaul and archboard-dev maintenance guidance must preserve this checklist-based evaluation contract and update expectations when features change. Include traffic modeling, containment, configured kinds and TASK-207 grouping as explicit coverage; teach the new configured multi-membership groups contract, not the superseded singular group field. Final evaluation requires TASK-207 so grouping is assessed on the same supported CLI for both skill packages.

Full feature coverage is required, not only the initial illustrative feature list. TASK-209 now records an audited schema-to-scenario inventory covering content, authoring inputs, views/scopes, walkthroughs, bindings, variant lifecycle/reconciliation, vault policy and planned TASK-207 grouping. The skill references must explain these features on the branches that need them, and archboard-dev must instruct maintainers to update this coverage inventory and expected feature lists alongside schema/workflow changes. Keep common workflows compact; comprehensive coverage belongs across the suite and conditional references.

The maintained evaluation instructions must specify one gpt-6-astra session at high reasoning for all baseline and candidate runs across scenarios/repetitions, reusing Flask understanding. Its prompt explicitly prohibits subagents and delegation of source interpretation or grading. Author runs remain parallel; shared grading remains blinded with per-run feature checklists, scores and evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 SKILL.md explains what archboard is useful for, its actual architecture and sequence diagram types, when to use each, and a concise frontmatter description that triggers relevant board work.
- [x] #2 Step-by-step workflows explicitly cover creating architecture and sequence diagrams, editing existing boards, and branching/comparing proposals. Primary paths require SKILL.md and at most one targeted reference for guidance, with discovery calls separated from necessary state reads, writes and verification.
- [x] #3 Conditional references cover specialized authoring, linking/binding, views/walkthroughs, adoption, grammar and schema details; main-skill pointers say when to read them. Installation and vault guidance link authoritative repo documents and directly link the full generated semantic and config JSON Schemas. Links work in the installed package.
- [x] #4 All existing material dos/donts and the guardrails recorded in this task are preserved in the appropriate workflow/reference. A documented preservation assessment and behavioral eval evidence establish this without tests that match prose or headings.
- [x] #5 Unnecessary help/list/config/check discovery is removed where existing context suffices, while required configuration knowledge, optimistic concurrency, identity, claims, batching and semantic/visual verification remain correct.
- [x] #6 The implementation remains limited to skill/reference/schema distribution and evaluation work. Concrete new CLI improvements are recorded as subtasks of TASK-208, not implemented here or duplicated from its existing scope.
- [x] #7 Canonical skills/archboard sources are synchronized through the repository mechanism; install usability is verified, generated artifacts remain ignored, and applicable normal checks pass. Before acceptance, simplify the resulting document structure and implementation where possible.
- [x] #8 skills/archboard-dev/SKILL.md explicitly triggers consumer-skill maintenance when Archboard changes alter or invalidate documented workflows, including CLI contracts, diagram/semantic behavior, config/schemas, installation and verification. It directs updates to affected canonical recipes, references, examples and eval fixtures in the same change, followed by skill synchronization and relevant validation.
- [x] #9 The archboard-dev guidance records the agreed successful-skill contract: low total tokens per completed workflow; explicit architecture and sequence creation, editing and proposal workflows; main skill plus at most one targeted reference on common paths; precise frontmatter triggers, conditional references and portable document/schema links; preserved semantic guardrails and successful, readable results.
- [x] #10 The archboard-dev guidance explains when and how to use the TASK-209 harness and links its canonical run instructions/rubric: real pinned Flask fixtures, isolated installed skills, gpt-5.6-luna/high authors, blinded gpt-6-astra judging, three parallel repetitions per skill version, controlled baseline/candidate inputs, and separate efficiency/quality evidence. It distinguishes skill-only comparisons from product changes that invalidate old workflows and requires explaining comparability limits rather than treating early failures as token savings.
- [x] #11 The skill and archboard-dev maintenance instructions incorporate per-eval expected semantic-feature checklists and require updates when product features change. TASK-209 grading verifies correct use of applicable traffic, containment, configured kinds, TASK-207 grouping and other expected features, with missing/incorrect required features failing semantic compliance; final baseline/candidate runs use the same CLI supporting TASK-207.
- [x] #12 All user-facing semantic features and behavioral enum/union branches in the TASK-209 schema-audited inventory have appropriate skill/reference guidance and mapped eval evidence, including TASK-207. archboard-dev requires maintaining the inventory and per-eval expectations when contracts change; internal/generated metadata and mechanical validation have explicit runtime owners rather than being forced into authored diagrams.
- [x] #13 archboard-dev and linked eval instructions preserve the single-session grader contract: gpt-6-astra/high grades every run itself, reuses Flask context and is explicitly prompted not to use subagents. Parallel author execution, blinding and separate per-run checklist results remain intact.
- [ ] #14 Using TASK-209, baseline and candidate each receive three repetitions per scenario in parallel. Candidate primary workflows successfully complete without guardrail violations and show no material quality regression under the blinded rubric. Median total author tokens are reported as a measured number and its change against baseline, and an increase is not a failure: more or better completed work may cost more. Reports include scenario-level outcomes, failures, discovery/operational calls and separately reported broad exploration/setup costs.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit the current skills/archboard/SKILL.md and references against the final CLI help (TASK-208), the groups contract (TASK-207), the generated schemas (TASK-210) and the TASK-209 inventory; write docs/design/skill-evals/preservation-assessment.md mapping every existing do/don't and task guardrail to its new home and its evidence owner (scenario check, guardrail or runtime test).
2. Restructure the skill: SKILL.md holds what archboard is, the two diagram types and when each fits, the shared essentials (environment from the setup block, vocabulary from config.yaml, read-version/--doing writes, identity, verification from the write's own answer), and four ordered recipes grounded in the Flask scenarios: architecture from code, sequence via the data-flow grammar, edit one batch, propose and compare; a routing table says when to read each reference.
3. References: authoring.md (nodes, containment and actual receivers, groups and inspect, bindings, drill-down, edges, traffic, handles, removal collections, constraints and refusal recovery), sequences-views-walkthroughs.md, variants.md (branch, comparison rules, edge two-property rule, flow/step identity, reconciliation and partial resolution, adopt, claims), schemas.md (kept). Remove the old architecture-workflow.md; update the install fixture's tracked-file list.
4. Cut redundant discovery: no help calls for commands the recipes show, no semantic config when config.yaml has been read, check only after vocabulary edits or a warning; keep every required read, write and verification.
5. archboard-dev: maintenance trigger, success contract, harness use and comparability limits, per-eval checklist and inventory maintenance, single-session grader contract; link the eval README and rubric.
6. Sync skills, run bun run check. AC#6 (measured comparison) is a human-run step: the baseline package is frozen and the harness is ready; the runs are not executed here.

Review follow-up: repair the canonical primary recipes where a command is not executable or the Flask example contradicts source; update the corresponding preservation/eval contract if the same false expectation is encoded there; synchronize derived skills; validate with the no-model eval input check and focused skill-distribution/install tests.

Proposed follow-up after human batch 2026-09-14T13-50-10-617Z: TASK-212 repairs evaluation validity and moves canonical inputs to repository-root evals/; TASK-213 repairs the documented reconciliation restoration contract. Once those contracts are executable, update only the affected general skill guidance (actual call receivers versus ordered sequence, external bindings, explicit-edge versus node-region views, reconciliation restoration); do not optimize for hidden rubric wording. Preserve the frozen baseline and original batch. Behavioral evidence and efficiency acceptance remain pending a new human-run comparison on identical corrected inputs and CLI for both arms. Global-home isolation remains deferred. This turn records a plan only.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote skills/archboard around four recipes grounded in the TASK-209 Flask scenarios: SKILL.md (what archboard is, the two diagram types and when each fits, shared essentials: environment from the setup block, vocabulary from one read of config.yaml, show/version/--doing/--expect-version writes with the write's own answer as the source of ids and version, references by name/id/handle, verification, claims; then architecture-from-code, sequence via the data-flow grammar, edit one batch, propose and compare; a Keep-it-true list and a routing table). References: authoring.md (nodes, containment and actual receivers, groups and inspect, bindings, drill-down, relationships, traffic, handles and removals, a refusal table with the repair for each), sequences-views-walkthroughs.md, variants.md (branch, what a comparison counts including the compare.ts distinctions, edge two-property rule, sequence identity, comparing before reporting, the five reconciliation kinds and resolve, adoption, claims), schemas.md kept. references/architecture-workflow.md retired; the install fixture's tracked list updated. Discovery removed: no help calls (recipes carry the syntax), no semantic config (config.yaml is one read), check only after a vocabulary edit or on warnings. Frontmatter description names the trigger branches. All links resolve in the checkout and in an install (tests/system/cli/install-targets.test.ts).

docs/design/skill-evals/preservation-assessment.md maps every baseline do/don't and task guardrail to its new home and evidence owner (scenario check, harness guardrail, grader feature or fast test) and records what was removed on purpose.

skills/archboard-dev/SKILL.md: "Maintaining the consumer skill" (trigger list, same-change updates to recipes, references, examples, schema links, eval fixtures and coverage.json, then sync and validation; the success contract) and "Evaluating a change" (harness link, Luna/high authors, three parallel isolated repetitions per version, frozen baseline vs live candidate on the same CLI, ONE blinded gpt-6-astra/high session per batch with the explicit no-subagents sentence, separated discovery/operations/grader costs, comparability limits: an incompatible old recipe failing early is not a saving; semantic compliance needs every expected feature).

CLI defect found while writing recipes recorded as TASK-208.01 (semantic new help omits flows/views/walkthroughs); nothing in the CLI changed here.

AC #6 is deliberately unchecked: the baseline package is frozen (docs/design/skill-evals/baseline/archboard) and the candidate is in place, but the comparison needs Codex runs, which the user reserved for a human. Run `bun run eval:skill run`, `grade`, `report` and record the outcome here.

Skills synced with bun scripts/sync-skills.ts; bun run check EXIT 0.

Review follow-up repaired the consumer contract: the sequence workflow now creates a standalone board with one semantic new payload; recipe numbering and the adopt command are complete; relationship/step references and removal spellings distinguish named subjects from id-only ones; group guidance covers the canvas Details report. Corrected S01 and S07 Flask call directions in the skill/eval inputs. Replaced annotated Flask tag-object pins for 2.1.3/2.2.0 with their peeled commit ids so checkoutFlask's exact HEAD check can succeed. Validation: all four primary JSON recipe payloads parse against the authoring Zod schemas; bun run eval:skill check reports 15 scenarios/15 fixtures/14 coverage parts; focused suite/distribution/install tests pass (20 tests). No author or grader eval ran.

Review: the preservation assessment and corrected workflow documentation are complete, but AC 4 also requires behavioral evaluation evidence. That evidence remains pending with AC 6 because author evaluations and grading are reserved for a human; neither was run during this review.

Review integration gate: bun run check passed after correcting standalone sequence creation, source-grounded JSON-provider and Flask CLI recipes, adoption syntax, references and group Details guidance. Canonical skills are synchronized. AC 4 behavioral evidence and AC 6 measured comparison remain unchecked and reserved for a human; no author evaluation or grader was run.

Batch 2026-09-15T03-21-37-188Z: all three candidate S07 runs drew ScriptInfo's two-candidate import loop as one self step with a note and no repeat, following the SKILL.md wording that a data-dependent loop is a note; the baseline skill, which says nothing about repeat, got it right once. SKILL.md now says a loop over a list the source fixes (two default module names) is a repeat of that count, in both the evidence step and the sequence procedure. Skills re-synced.

AC 4: docs/design/skill-evals/preservation-assessment.md maps every guardrail to its home and evidence owner (updated for the TASK-235.09 recipe split); the 2026-09-15 batch shows zero guardrail violations and zero direct writes in either arm, and the harness guardrails plus scenario checks own the evidence. AC 6 waits for the human-run rerun of both arms on the TASK-235 inputs.

2026-09-16 batch (.skill-evals/2026-09-16T00-32-53-542Z, Claude grader): candidate 40/45 fully ok vs baseline 31/45, no guardrail violations, mean correctness 8.7 vs 8.2, truth 8.5 vs 8.1, readability level; median tokens rose 15% overall (S00 routing and S05 drove it; S04, S06, S07, S08, S13 fell). AC #6's quality half holds; its token half did not. The user promoted the candidate to the frozen baseline (TASK-243.01) and the follow-ups are under TASK-243.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The archboard skill now teaches four complete workflows (architecture from code, sequence diagram, one-batch edit, propose and compare) with the syntax inline and conditional material behind routed references, drops discovery the context already answers, and keeps every recorded guardrail with a documented evidence owner; archboard-dev tells maintainers when and how to update the skill, its eval fixtures and inventory, and how to measure a change with the human-run harness. The measured baseline/candidate comparison (AC #6) awaits a human run.

Implementation review and the full normal gate are complete; source-grounded workflow corrections are included. Human-run behavioral evaluation and the measured baseline/candidate comparison remain pending.
<!-- SECTION:FINAL_SUMMARY:END -->
