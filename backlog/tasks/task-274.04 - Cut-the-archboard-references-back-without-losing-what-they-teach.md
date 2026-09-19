---
id: TASK-274.04
title: Cut the archboard references back without losing what they teach
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-19 00:40'
updated_date: '2026-09-19 01:05'
labels: []
dependencies:
  - TASK-274.03
parent_task_id: TASK-274
priority: high
ordinal: 488000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
SKILL.md was trimmed under TASK-273.03 (32.4 -> 21.9 KB), yet median author tokens in batch 2026-09-18T23-44-56-390Z were still +20% over the baseline. The references grew from 69 KB to 90 KB: authoring.md 15.3 -> 21.1 KB, create-sequence.md 5.8 -> 9.1, variants.md 6.5 -> 8.9, propose-compare.md 3.3 -> 4.8, create-architecture.md 5.2 -> 6.2. Candidate authors read more of them (one S06 run read references/*.md whole). Same method as TASK-273.03: padding, duplication (between references, and between a reference and SKILL.md), and a rule ledger an independent reviewer checks rule by rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The references total materially less than 90 KB; per-file before/after recorded in the task
- [x] #2 Every rule the references taught is still taught somewhere a run that needs it will read; a reviewer diff-checks the ledger rule by rule
- [x] #3 No evals/evals.json or rubric.md edit and no heading moved, so every skill citation still resolves (bun run eval:skill check)
- [ ] #4 Derived copies resynced and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Padding: turn the wide tables (authoring.md Nodes, Relationships and refusal tables; variants.md Disagreements; schemas.md file table) into lists so no cell sets a column width; wording unchanged; bun run fmt output stable. Commit.
2. Dedup: within authoring.md (Containment/Evidence receiver rule, traffic in the field table vs prose, drill-down kind vs SKILL.md drillDown row, refusal preamble vs SKILL.md CLI essential, bindings vs SKILL.md evidence rule 2); between references (create-sequence step 1 vs sequences-views-walkthroughs Flows, variants Branching targeting vs edit.md step 3 / propose-compare step 2, compare reporting in propose-compare vs read.md step 3, edit.md replacement count vs variants Edge identity, picture-location sentence in three recipes vs SKILL.md Verification). Keep each rule in the file the workflow that needs it reads (recipes keep their own; cited sections keep what their feature expects) and link from the others. Commit.
3. Prose: tighten verbose sentences without changing meaning. Commit.
4. No heading moved or renamed; no evals.json/rubric.md edit; recheck every <file>#<heading> citation's feature against its section. Keep TASK-274.03 wording (defines/defining; 'a method calling another method of a class that is one column'; containment-and-receivers first sentence).
5. Resync (bun scripts/sync-skills.ts), bun run eval:skill check, oxfmt --check skills/archboard, test:modules, test:repository, memory-capped.
Targets (bytes, from): authoring.md 21,178 -> <=16,000; create-sequence.md 9,124 -> <=7,800; variants.md 8,901 -> <=7,600; propose-compare.md 4,845 -> <=4,200; create-architecture.md 6,154 -> <=5,600; edit.md 4,250, read.md 2,359, schemas.md 5,543, sequences-views-walkthroughs.md 5,741 trimmed where padding/duplication allows. References total 68,095 (90,360 with SKILL.md) -> <=58,000.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Size (bytes), before -> after: authoring.md 21,178 -> 15,052; create-sequence.md 9,124 -> 8,353; variants.md 8,901 -> 8,249; propose-compare.md 4,845 -> 4,742; create-architecture.md 6,154 -> 5,744; edit.md 4,250 -> 4,153; read.md 2,359 -> 2,368 (reflow only); schemas.md 5,543 -> 4,628; sequences-views-walkthroughs.md 5,741 -> 5,015. References total 68,095 -> 58,235 (-9,860, -14.5%); with SKILL.md (22,265, untouched) 90,360 -> 80,500. Baseline references 50,427. Lever 1 padding -5,386 (36b7f88d); lever 2 dedup -3,443 (a7aa9046, includes a whitespace-only reflow of overlong lines with code spans kept whole); lever 3 prose -1,031 (51901313). No heading moved or renamed (heading lines diffed against 0fd00084); evals.json and rubric.md untouched; TASK-274.03 wording kept verbatim (containment-and-receivers paragraph reflowed only, words unchanged; 'a method calling another method of a class that is one column'; 'defines its functions, methods or components').

Rule ledger (reference before -> where it lives now):
Lever 1 (36b7f88d), restructure only, wording unchanged:
- authoring.md Nodes, Relationships and refusal tables -> lists of '- key: meaning', same cells. variants.md Disagreements 3-column table -> list, 'Answered by' column appended to each item. schemas.md generated-file table -> list. sequences-views-walkthroughs.md message-kind and grammar tables -> lists; grammar list introduced by 'Its grammar is one of:' (the header the table carried).
Lever 2 (a7aa9046), duplicates removed, link left:
- authoring Nodes kind 'A node standing for another board takes that board's level' -> authoring#drill-down 'The kind is the linked board's level' (same file) + SKILL drillDown row.
- authoring Nodes drillDown 'Only on a part that is really there' -> authoring#drill-down 'The link sits on a part that is really there'.
- authoring#bindings 'a part implemented in another checkout may bind after you inspect its owner and register that repository' and 'responsibility across files: narrow or split rather than bind to a partial file' -> SKILL evidence rule 2 (linked from the bindings sentence). 'A planned part or an implementation unavailable for inspection stays unbound' stays in #bindings (cited for S00/S14 unbound externals).
- authoring#drill-down reuse sentence (check archboard semantic before adding a service/system part; a board of that part's internals is a drillDown, not a reason to redraw) -> SKILL drillDown row ('archboard semantic lists them; check first ... instead of drawing its parts again') + keep-it-true; #drill-down keeps 'Reuse an existing detail board' with the check and links the row.
- authoring#drill-down 'a node whose only reason to exist is the link is a button, and a diagram has no buttons' -> SKILL keep-it-true (verbatim there), linked.
- authoring traffic paragraph: 'authored intent, not measurement; a static render cannot show it moving', 'forward path on every pass', 'a call a normal pass always makes is on the path even when an error could skip it', 'never on teardown, error or exception path, optional hook most passes skip, startup, registration, one-shot' -> SKILL catalogue traffic row (all stated there), linked. Kept in authoring: stamping it everywhere says nothing; the handler call and every call between entry point and handler carry it, even when a short-circuit could skip them; teardown means closing a connection or a cleanup hook; speed/volume mark the hotter of two runtime paths. 'Restate with its id to add or change traffic; without the id it is a new relationship' -> SKILL References essential (verbatim rule), linked.
- authoring 'A step is not a relationship' repair ('take the key off the steps it names, keep it on the relationships between the same parts; removing emphasis from the whole payload loses it where it was right') -> kept in one sentence ('move the key onto the relationships between the same parts rather than dropping it everywhere') + SKILL catalogue closing paragraph, linked. Refusal text and locator line kept.
- authoring 'Evidence for a relationship': the one-line record (from -> to, kind, claim, file and symbol), caller/receiver for a call, endpoints follow the claim for other kinds, siblings-not-a-chain with apply/validate/persist -> SKILL evidence rule 3 (all there), linked; 'receiver is the part, not its container; containment says nothing about calls' -> authoring#containment-and-receivers (same file), linked. Kept: 'a return travelling back is a flow step, not a second architecture relationship', the kind-follows-mechanism mapping, the after-write read of saved edges against the record. 'A picture that needs a relationship the source lacks is wrong however readable' -> SKILL catalogue 'a row the source does not support stays out: an added relationship without a line of evidence is a wrong board'.
- authoring refusal preamble: repair from the reason, never change vocabulary or invent an id, never open the vault file to change ids/version/lifecycle/adoptions/reconciliation, stop with the board valid and report -> SKILL CLI essential (all there), linked. Dropped as a reason, not a rule: 'a board patched outside the CLI is a board the product no longer vouches for'. Kept: what new evidence is (a different id, a field the refusal named, a re-read version), the same payload is refused again, examples of what the commands cannot do, report rather than approximate.
- authoring refusal 'unknown kind, level or group': 'extend only when the request is about vocabulary, then archboard check' -> SKILL Vocabulary essential, linked.
- create-sequence step 1: the repeat example said twice ('the example below tries two candidate documents in one self step because chooseDoc runs inside Setup block') -> said once, in the repeat sentence. Catalogue walk detail (traffic on the forward path incl. error-skippable calls; not returns, teardown, error branches, one-shot startup) -> SKILL catalogue traffic row; step 1 keeps 'external, traffic on the forward path and never on its returns'.
- create-sequence step 3, create-architecture step 4: 'a picture the request names goes where it says; one drawn to look at goes in a temporary directory, never the checkout' -> SKILL Verification essential. create-sequence step 3, create-architecture step 4, edit.md step 4: 'your answer names the catalogue rows used and judged not to apply' -> SKILL catalogue intro + runbook step 19.
- create-architecture after the example: 'lands on the part that receives the call, inside its parent; the renderer carries the line across; a container is an endpoint only for a relationship to the whole module' -> SKILL evidence rule 3 + authoring#containment-and-receivers; linked, Board lease example kept.
- variants#branching targeting ('where the two name different variants the command line wins and the write warns naming both') -> edit.md step 3 and propose-compare step 2 (both keep it); variants keeps 'names no variant edits current; command line wins, on resolve too' and the misfire-repair sentence.
- propose-compare step 3 'views belong to the board and apply to both pictures' -> same file's paragraph after the example ('Views belong to the board, so both pictures go through the same view').
- schemas 'a stated id must name a subject already on the variant, or the write is refused' -> kept as 'a stated id names one already on the variant' + authoring refusal 'unknown id' + SKILL References; 'new subject leaves id out; product mints one' and 'restated subject replaces its definition whole' -> kept in one bullet, linked to SKILL References.
- schemas obligations 'Refusals name the rule and the subject, so repair the payload rather than changing vocabulary or inventing an id' -> SKILL CLI essential + authoring refusal preamble.
- sequences-views#flows 'record each step's evidence and check order, returns and branches; read the saved steps against the record after the write' -> SKILL evidence rule 3 ('every flow step keep a one-line record'; 'check each step's order, return, branch and repeat count') + create-sequence steps 1 and 3.
Lever 3 (51901313), prose only; each rule restated with the same content: authoring groups (dropped 'read the configured groups' before 'ask of each new part which configured concerns it serves'; SKILL groups row says read them before every write), canvas group paragraph, bindings owner paragraph, drill-down kind/external, the three drill-down warnings, frozen-variant checks, emphasis/hero/muted paragraphs, step keys, kind mapping (single-item list -> paragraph); create-sequence intro, step 1 split into four paragraphs (record; columns; message kinds and repeat/note; catalogue and beat), step 2 evidence ('a list the source fixes' folded into 'the literal list'), step 3; variants edge identity, comparing-before-you-report, disagreement intro, theirs paragraph, third-answer paragraph; propose-compare post-example and report paragraph; create-architecture step 4; schemas reference and id-namespace obligations.

Citations: every references/<file>#<heading> cited in evals.json re-read against its feature: authoring#relationships still lists traffic {} / {speed, volume} / omit; #bindings keeps repo add identity, repo-relative path and 'stays unbound'; #containment-and-receivers unchanged words; #drill-down keeps current/named; #groups keeps explicit multi-membership, no inheritance, configured ids; #handles-and-removals, sequences-views #views/#walkthroughs, schemas#vault-setup, variants#adoption unchanged; variants #branching/#what-a-comparison-counts/#comparing-before-you-report/#disagreements and sequences-views#flows keep every cited rule; recipe-level citations keep self steps, repeat, note, beat subjects, data-flow view, edit targeting and 'walk the catalogue for what you add' (rubric.md).

Gate: bun scripts/sync-skills.ts (diff -r skills/archboard .agents/skills/archboard clean); bun run eval:skill check -> suite ok: 15 scenarios, 15 fixtures, 14 coverage parts; oxfmt --check skills/archboard and full fmt:check clean; test:modules 3351 pass / 0 fail; test:repository 8 pass / 0 fail. Left In Progress for review.

Review round 1 fixes (2f92bbc9): step kinds nested under the steps bullet (sequences-views#flows); #bindings regains 'never bind to a file that does only part of the responsibility; narrow it to what one file owns, or split the node'; example renders write /tmp/*.png (create-architecture, create-sequence, propose-compare, and variants#comparing-before-you-report's inline command); traffic sentence now 'never on the paths the row excludes (teardown there includes closing a connection or a cleanup hook); a call a normal pass always makes stays on even when an error or short-circuit could skip it'; the four relationship-evidence decisions are a bullet list again; refusal labels bold.
Ledger additions (nuances the reviewer named): variants#branching no longer says 'and the write warns naming both' itself; that clause lives in edit.md step 3 and propose-compare step 2, which variants links (edit.md). authoring 'Evidence for a relationship' no longer lists 'the claim in words' among the record's fields; SKILL evidence rule 3 states it ('state the directional claim in words and make the endpoints follow it'), and the section links rule 3 for the record.
Plan targets missed: authoring.md target <=16,000 met (15,339); create-sequence.md <=7,800 missed (8,358); variants.md <=7,600 missed (8,259); propose-compare.md <=4,200 missed (4,752); create-architecture.md <=5,600 missed (5,749); references total <=58,000 missed (58,562 after the review fixes, from 68,095; 58,235 before them). The recipes' remaining bytes are mostly worked examples and cited rules, left whole.
Sizes after review fixes (bytes): authoring 15,339; create-architecture 5,749; create-sequence 8,358; edit 4,153; propose-compare 4,752; read 2,368; schemas 4,559; sequences-views-walkthroughs 5,025; variants 8,259; total 58,562 (80,827 with SKILL.md).
Gate after fixes: skills resynced (diff -r clean); eval:skill check suite ok (15 scenarios, 15 fixtures, 14 coverage parts); oxfmt --check skills/archboard clean; test:modules 3351/0; test:repository 8/0; type-check exit 0; lint red only in other workers' uncommitted src/runtime/skill-evaluation/lib/grading-run.ts (require-jsdoc) and grading-retry.ts (complexity, require-jsdoc), none touched here. Left In Progress.

Independent review, two rounds; round 2 clean (2f92bbc9). AC#4 held for the final full gate on a quiet tree.
<!-- SECTION:NOTES:END -->
