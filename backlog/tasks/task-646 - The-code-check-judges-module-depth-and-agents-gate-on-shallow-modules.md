---
id: TASK-646
title: The code check judges module depth, and agents gate on shallow modules
status: In Progress
assignee: []
created_date: '2026-11-18T22:57:00Z'
updated_date: '2026-11-19T12:35:00Z'
labels:
  - ready-for-agent
dependencies: []
documentation:
  - >-
    docs/adr/0044-a-containers-interface-is-what-relationships-from-outside-reach.md
  - >-
    docs/adr/0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md
  - CONTEXT.md
priority: high
type: feature
ordinal: 1086000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem Statement

An architect or an agent wants to know how deep a module is. A deep module has a small interface that hides much logic. A shallow module hands its insides to its callers. Archboard cannot answer. The README says: "Archboard gives you no score. … The model does not measure implementation behavior, so Measures never calls a module shallow." The interface measures count only what the model draws.

The code shows the problem plainly. The `timing` module exports frozen groups of durations, such as `CODEX_PROCESS_MS`. Its callers compute on them. For example, `codexRestartDelayMs` in the Codex app server does the backoff math on `restartBase` and `restartMax`. The module that owns the timing does not own the logic for timing. Archboard misses this for three reasons:

- The interface check skips every module without parts, and `timing` has none.
- Module exposure stops at the first language that matches, so a module that holds two languages is read half.
- No rule looks at what an export is or at what the callers do with it.

Agents in an implementation loop have no gate for this. They add exported constants and pass-through re-exports, and nothing fails. A person who reads Measures sees only model counts and has no way to see the code's own interface.

## Solution

The code check measures each bound module from its code and gives verdicts as named findings. It never gives a score.

For each bound module it counts the exports by kind: functions, classes (each public method counts as its own export), values and types. It counts the pieces of logic behind them as evidence. It then judges each exported name:

- `EXPOSED_VALUE` is a warning for an exported value that outside code reads. This includes the results of calls such as `durations({...})`. The message orders the remedies. With one reader, move the value to that reader. With several readers, move the behavior into the module. A getter is an acceptable interface.
- `EXPOSED_VALUE_COMPUTED`: if two or more modules write the same math on one exported value or getter, it is a warning. Each caller line is evidence.
- `CODE_PASS_THROUGH` and a single re-export are information. `REEXPORT_PASS_THROUGH` is a warning only for two doors to one name: outside callers also import the defining module directly.
- `EXPOSED_UNUSED`: if the reader resolved every use in that language and the model draws no outside caller of the export, it is a warning. Otherwise it is information.
- `MODULE_SHALLOW` rolls these up. If every export that is not a type carries a per-name finding, it fires.

`MODULE_SHALLOW` is information by default. `archboard check code --fail-shallow-modules`, or a gate that the model's policy turns on, makes it a warning for the modules that the branch touched. The existing exit rule of `archboard check` then fails. Agents run this gate in their loops, and the archboard skill teaches them how to clear each finding.

The browser shows the same data. In Measures, `What a module exposes` gets Model and Code columns side by side. Code findings join the findings list. The About page lists a module's code exports by kind, each with its findings and Open code. A language without its server names the server it needs and offers Fix with Codex. That action starts the setup in the checkout's own conversation, with the brief that `archboard init` also uses.

## User Stories

1. As an architect, I want each bound module measured from its code, so that the code shows how deep it is.
2. As an architect, I want verdicts as named findings and never a score, so that each verdict names the export and the fix.
3. As an architect, I want exports counted by kind (functions, classes, values, types), so that I see what a module offers.
4. As an architect, I want each public method of a class counted as an export, so that a wide class cannot hide.
5. As an architect, I want the pieces of logic behind the exports counted as evidence, so that I can see how much a module hides.
6. As an architect, I want no ratio gate on the logic count, so that a small narrow module passes.
7. As an architect, I want an exported value that outside code reads to be a warning, so that configuration stays behind functions.
8. As an architect, I want a value made by a call, such as `durations({...})`, judged like a literal, so that a wrapper hides nothing.
9. As an architect, I want the `EXPOSED_VALUE` remedies ordered by reader count, so that I know what to move.
10. As an architect, I want a getter to clear `EXPOSED_VALUE`, so that a narrow interface over a constant is accepted.
11. As an architect, I want a warning for math that several modules repeat on one export, so that I find logic for the exporter.
12. As an architect, I want the match to ignore local names and operand order, so that `a * b` matches `b * a`.
13. As an architect, I want the match to follow one local variable, so that `const base = X.restartBase; base * 2` still matches.
14. As an architect, I want equality and bitwise operators ignored by the match, so that comparisons do not flood the findings.
15. As an architect, I want every caller line listed as evidence, so that I can judge the match myself.
16. As an architect, I want a pass-through function reported as information, so that I see it without a failure.
17. As an architect, I want a warning for a re-export only for two doors to one name, so that one door passes.
18. As an architect, I want `EXPOSED_UNUSED` as a warning only after a complete read, so that a partial read accuses nothing.
19. As an architect, I want a drawn outside consumer to count as a use, so that a published entry passes.
20. As an architect, I want tests not to count as users, so that an export that only tests read is still flagged.
21. As an architect, I want an implementation used through its trait to count as used, so that it passes.
22. As an architect, I want members that the language calls, such as `Drop`, left unjudged, so that they make no findings.
23. As an architect, I want one finding per name, grouped by module, so that a module with many findings stays readable.
24. As an architect, I want one `MODULE_SHALLOW` finding for a module whose every value export has a finding, so that it is named once.
25. As an architect, I want exported types left out of the verdicts, so that an exported union keeps the compiler's exhaustive checks.
26. As an architect, I want no exemption for forced constants, so that each case uses a real seam.
27. As an architect, I want every bound module read, with or without parts, so that a leaf module like `timing` is measured.
28. As an architect, I want every language in a module read, so that a module with two languages is not read half.
29. As an architect, I want every supported language covered, so that a Go, C# or Swift module is judged like a TypeScript one.
30. As an architect, I want Terraform to keep its own codes, so that its findings stay the same.
31. As an agent, I want `archboard check code --fail-shallow-modules`, so that my implementation loop fails on a shallow module.
32. As an agent, I want the gate to judge only the modules that the branch touched, so that old debt does not block my change.
33. As an agent, I want the gate to read the working tree, so that a gate run before a commit sees my changes.
34. As an agent, I want `--base` to name the branch base, so that a stack layer gates against its parent.
35. As an agent, I want the default-base lookup to choose the base, so that the usual case needs no flag.
36. As an agent, I want an unresolvable base to be a refusal, so that a gate never passes because it read nothing.
37. As a maintainer, I want the vault's policy to turn the gate on, so that CI and agent loops share one gate without a flag.
38. As an agent, I want severities that never depend on the caller, so that the CLI and the browser agree.
39. As an agent, I want `EXPOSED_UNUSED` and the other warnings to fail `archboard check` through its existing exit rule, so that there is one exit rule.
40. As an agent, I want the skill to show the seam for each forced constant, so that I know what to export.
41. As an agent, I want the skill to tell me to run the gate in implementation loops, so that I catch shallow modules before review.
42. As an architect, I want Model and Code columns in `What a module exposes`, so that I can compare them.
43. As an architect, I want each column sortable, so that I can find the widest code interface.
44. As an architect, I want code findings in the findings list, so that model and code findings sit in one place.
45. As an architect, I want the About page to list a module's code exports by kind, so that I see its real interface.
46. As an architect, I want each export there to show its findings, so that I see what is wrong with it.
47. As an architect, I want Open code on each export, so that I go to its exact source.
48. As an architect, I want a module with no findings shown as clean, so that I can tell a clean result from a missing read.
49. As an architect, I want an incomplete read to name what it skipped, so that I never take it for a clean result.
50. As an architect, I want a language without its server to name the server it needs, so that I know why a count is missing.
51. As an architect, I want Fix with Codex on that message, so that an agent sets up the server for me.
52. As an architect, I want Fix with Codex to start in the checkout's own conversation, so that the setup runs in the right repository.
53. As a maintainer, I want one language-server setup brief shared by `archboard init` and Fix with Codex, so that the two never give different steps.
54. As an architect, I want the panes to read the remembered result of the last pass, so that opening a pane never starts a pass.
55. As a reader of the README, I want it to say what Archboard now measures and judges, so that the documentation matches the product.

## Implementation Decisions

- A new ADR supersedes the parts of ADR 0044 and ADR 0046 that forbid verdicts. It records that the code check gives named findings and no score, and why. The README sentence about "no score" changes to say what the code check measures and judges.
- Code check gets a new part beside it in code-intel: Module depth. Code check gives Module depth the exposure, the resolved uses, the coverage and the owner of each caller that it already read. Nothing is read twice. Module depth reads the logic behind each export and the expression around each use from Fact analysis.
- Module depth owns every per-name rule, the roll-up into `MODULE_SHALLOW`, and the shape matching for `EXPOSED_VALUE_COMPUTED`. The shape matching ignores the callers' own names, normalizes commutative operators, follows one local variable, and ignores equality and bitwise operators.
- Fact analysis changes so that module exposure reads every language that a module holds. Each grammar query also names the kind of each export and the pieces of logic in each body. It also names the expression around each use of a name that another file defines.
- Code check reads the interface of every bound module, with or without parts.
- The code check answer marks the modules that the branch touched. Its severities never depend on the caller. The CLI owns the gate: Vault check promotes `MODULE_SHALLOW` on touched modules to a warning, then applies the existing exit rule. The reason: the server remembers every finished pass for the panes. If a flag changed the answer, Measures shows whatever the last caller asked for.
- Vault check gains `--fail-shallow-modules` and `--base`. Without `--base`, the existing default-base lookup decides. A base that does not resolve is a refusal.
- History lens: the branch footprint can read the working tree as its head, so that a gate run before a commit sees uncommitted changes.
- Vault configuration: the policy holds whether plain `archboard check` fails on shallow modules. The canonical reader carries it in each model's policy. Code check reads it from the model's policy and does not read the vault configuration separately.
- Code findings memory keeps, per model, state and revision, each module's exports, counts, findings, language coverage and skipped reads. It keeps modules with no findings too, so that a pane can tell a clean result from an incomplete read. The findings route answers from it alone, so a pane never starts a pass.
- Measures reads the code counts, findings and coverage from the retained reads. `What a module exposes` gets grouped Model and Code columns, each sortable. Code findings join the findings list.
- A new Code exports view lists the selected module's code exports by kind, each with its findings and Open code. The Right panel renders it on the About page.
- A new Language server setup brief in the workspace package states, for each language, the server that it needs and how to install it. `archboard init` uses it in its language-server handoff. The Application frame uses it for Fix with Codex, through the existing "fix asked for" path into the checkout's own conversation.
- No `--reach` pass. Dead hidden code is the job of other tools.
- Delivery order: coverage first (every module, every language), then TypeScript and Rust with all rules, then the other languages.
- The archboard skill tells agents to run the gate in implementation loops. For each finding it shows the seam that clears it. Examples: a predicate or method, an owning type, or an exported type with `isKind` and `allKinds`. A module can also ship the attribute, or take the condition inside.

## Architecture Proposal

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W, compared with Current by default. A worktree server serves the same address on its own port.
- Picture: `archboard model render --state 3nkEfr1W --out <file>` draws it. The flows are `An agent loop gates on shallow modules` and `A person reads module depth in Measures`, in the collection code-intel.
- Changes:
  - Interface: `workspace` gains the entry point Language server setup brief, and the caller Application frame.
  - Interface: `Picture clients` and `Retained reads` gain the caller Measures.
  - Added: Module depth judges each bound module's exports from its code, and the math that callers repeat on them. Code check calls it with the exposure, resolved uses, coverage and caller owners.
  - Added: Module depth reads the logic behind exports and the expression around uses from the Cached fact reader.
  - Added: Language server setup brief, called by Init and by the Application frame for a missing server.
  - Added: Code exports, rendered by the Right panel for the selected module.
  - Added: Code check reads the modules touched since the base, working tree included, from History lens.
  - Added: Measures reads the code counts, findings and coverage of the reading from Fetch semantic reads.
  - Added: the flows `An agent loop gates on shallow modules` and `A person reads module depth in Measures`.
  - Changed: Code check reads every bound module in every language and reports module depth.
  - Changed: Vault check promotes `MODULE_SHALLOW` on touched modules under `--fail-shallow-modules` or the policy, takes `--base`, and refuses an unresolvable base.
  - Changed: Vault configuration's policy holds the shallow-module gate.
  - Changed: Code findings memory keeps exports, counts, findings, coverage and skipped reads per module.
  - Changed: History lens reads the working tree as a footprint head.
  - Changed: Fact analysis reads every language of a module, export kinds, pieces of logic and the expressions around uses.
  - Changed: Measures shows Model and Code columns, code findings and Fix with Codex.

## Testing Decisions

- A good test drives the product through its public interface and asserts what a user or a caller sees: findings, exit status, remembered data, rendered UI. It does not assert internal helpers.
- Seam 1, the code check pass over fixture checkouts. This is the main seam. Per-language tests assert only what each grammar decides: export kinds, pieces of logic, uses and the expressions around them. The rules, the roll-up, the gate marking and the shape matching are asserted once, in TypeScript. One fixture is a single bound leaf module that holds two languages, which catches today's first-language bug. Prior art: the code-check operation tests and the per-language check tests in code-intel, with their pass and fixture support.
- Seam 2, the CLI exit and options, through the existing module tests. The check-parts tests cover the exit rule, `--fail-shallow-modules`, `--base` and the refusal. The code-check route and code-findings route tests cover the remembered data. No new system test.
- Seam 3, the UI. The model code evidence component tests cover the code tab and Fix with Codex. The model code warnings component tests cover Code exports. Two existing browser tests each get one case, where a component test cannot see the behavior: the canonical model code test opens an export's exact source, and the Codex text workbench test routes the fix to the right checkout.

## Out of Scope

- A score or a ratio of any kind.
- A `--reach` pass or any search for dead code that no export reaches.
- An exemption for values that a language forces to be constants.
- Changes to Terraform's `VARIABLE_PASSED_THROUGH` and its own `MODULE_SHALLOW`.
- Judging members that the language calls.
- Counting tests as users.

## Further Notes

- The owner accepts one known false match of `EXPOSED_VALUE_COMPUTED`: a deadline and a jitter that share a shape. One exporter function clears both.
- This repository's own `timing` module is the first expected finding. Do not use this repository to choose defaults.
- The decisions came from a long design interview, with reviews by two advisor agents. The proposal holds the architecture that they settled.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on feat/module-depth (PR #135) and refactor/module-depth-cleanup (PR #139), a gh stack that merges as one unit. Every subtask is done; this parent closes when the stack merges.
<!-- SECTION:NOTES:END -->
