---
name: archboard-deepen
description: >-
  Deepen shallow modules and narrow wide interfaces from exploration to merged
  code, with two advisor sub-agents deciding in place of the human. Use when
  the code check reports INTERFACE_WIDE or MODULE_SHALLOW, or when you are asked
  to deepen modules or improve the architecture without a human gate.
---

# Archboard Deepen

Turn shallow modules into deep ones: much behavior behind a small interface, tested at its seam.
The run is autonomous. Where a design process would ask the owner, two **advisors** decide, and every decision lands in the **decision log** with its reason.
Before the first architecture operation, load the `archboard` skill. It owns every command, request schema and recovery recipe that this skill names.

A finding names a smell and its principle, never its fix. The design is yours and the advisors' to reason out.

## The owner

Interrupt the owner only for a decision that reverses one the owner already made: an ADR, the vault's `codeCheck.rules`, an adopted or confirmed proposal, a rule in `AGENTS.md` or `CLAUDE.md`, or an instruction in this conversation.
Then put the question and the advisors' answers to the owner, park the ticket that depends on it, and continue with the rest.

The request to run this skill authorizes the run's own branch, proposals, tickets and merges, and adoption of its proposal on the integration branch.
Push, or merge into the default branch, only when the owner asked for it.

## Vocabulary

Use these words exactly, in the report, the briefs, the tickets and the log.

- **Module**: anything with an interface and an implementation, at any scale: a function, a class, a package, a slice across tiers.
- **Interface**: everything a caller must know to use the module: its names and types, and also its invariants, order of calls, errors, configuration and cost.
- **Implementation**: the code behind the interface.
- **Depth**: behavior a caller or test reaches per piece of interface it learns. A **deep** module hides much behind little; a **shallow** one has an interface almost as large as its implementation.
- **Seam**: the place where a module's interface lives, and where behavior can change without editing the callers. Where the seam goes is its own decision.
- **Adapter**: a concrete thing that fills a seam, such as a production client or an in-memory stand-in.
- **Leverage**: what callers get from depth: one implementation pays back across every call site and test.
- **Locality**: what maintainers get from depth: a change, a bug or a fact lives in one module. `model locality` shows its absence, as modules that change together.

Judge each design with these tests:

- **Deletion test**: imagine deleting the module. If its complexity vanishes, it only passed calls on. If the complexity reappears in every caller, it earned its place.
- **The interface is the test surface**: callers and tests cross the same seam. A test that has to reach past the interface means the module has the wrong shape.
- **Two adapters make a seam real**: one adapter is a hypothetical seam and only adds indirection. Production plus a test stand-in is two.
- **Replace, don't layer**: tests at the deepened interface replace the tests of the shallow modules it absorbs. Delete the old ones.

Classify each dependency of a candidate, because the class decides how its tests cross the seam:

1. **In-process**: computation and memory only. Merge the modules and test through the new interface.
2. **Local stand-in**: a dependency with a local substitute, such as an in-memory filesystem or an embedded database. Test with the stand-in; the seam stays internal.
3. **Owned remote**: your own service across a network. Put a port at the seam, with a network adapter for production and an in-memory adapter for tests.
4. **Third party**: a service you do not control. Inject it as a port, and give tests a fake adapter.

## Advisors

Two advisors answer every decision of steps 4 and 5. Run them like this:

1. **Brief.** Spawn each advisor fresh, with no fork of your conversation. Give both the same brief: the question, the report and decision log paths, this skill's [vocabulary](#vocabulary), the facts you gathered with their sources, and the repository's agent instructions, domain glossary and ADRs to read. Leave your own preference out of it.
2. **Families.** When the harness offers models of different families, give each advisor a different one. Otherwise run two agents of the same model, each without the other's context.
3. **Round 1.** Both answer in parallel: an answer per point, each with its reason, citing files, findings and model facts.
4. **Round 2.** Give each advisor the other's round 1 answer, verbatim. Each keeps, revises or rebuts its answer, point by point, with a reason.
5. **Settle.** A point that both answer the same way after round 1 or round 2 is settled. You settle each point that is still open after round 2: take the answer whose reason the evidence supports, and write down why the other one lost.

Write one log entry per point: the question, each advisor's answer and reason in each round, the settled answer, and who settled it.
An advisor's answer that reverses an owner decision goes to [the owner](#the-owner).

## Run

Finding facts is your job: the code, the model, Git, the tests. The advisors decide what the facts cannot.

### 1. Scope

Make the integration branch from the current `HEAD`, named after the scope, such as `deepen/<scope>`. Every vault write and every ticket merge of the run lands there.
Choose the target modules:

- If the code check reported `INTERFACE_WIDE` or `MODULE_SHALLOW`, take the modules that the findings name.
- If the owner gave a direction, such as a module or a pain point, take it.
- Otherwise, read `model locality` and take the hotspots and the coupled pairs. A module that changes often repays its deepening soonest.

Start the decision log beside the report, outside the checkout (see [the report](references/report.md#where-it-lives)).

Done: the log lists each target module with its evidence: the finding's code and message, the direction, or its locality count.

### 2. Explore

For each target, read:

- Its interface: `model inspect <module>` for its callers, entry points, pass-throughs and outgoing relationships. The design lens of the `archboard` skill says how to read each field.
- Its code, at each entry point and at the busiest callers.
- Its coupling in `model locality`, and the ADRs and glossary terms of its area.

Ask where understanding one concept means bouncing between many small modules, where logic leaks across a seam, where tests reach past an interface or are missing.
Apply the deletion test to each module that you suspect is shallow, and classify each dependency.
Group the targets into **candidates**: one deepening each, which may absorb several modules.

Done: each candidate names its modules and files, its friction, its deletion-test verdict, its dependency classes, and each ADR that it contradicts.

### 3. Report

For each candidate, author a sketch proposal of the deepened shape through the proposal recipe of the `archboard` skill, as siblings with Current as their predecessor.
Render each candidate's before picture from Current and its after picture from its sketch, with the same scope.
Use `model compare --state <sketch>` to state what the change does to callers.
Write the report as [the report reference](references/report.md) says.

Done: the report opens in a browser, every candidate has every part of its card and both pictures, and the top recommendation names one candidate.

### 4. Choose

Ask [the advisors](#advisors) which candidates to build, ranked, and why each other candidate waits.
Give them the report, and ask them to weigh strength, leverage, locality, the number of callers, risk and ADR conflicts.

Done: the log holds a settled decision for every candidate, built or rejected, and the built ones are in order.

### 5. Grill

For each chosen candidate, map the design as a **tree**: each decision branches into the decisions that depend on it.
Cover at least the constraints, the dependencies and their classes, the shape of the deepened interface, what sits behind the seam, and which tests survive or move to the seam.
Work the tree in rounds. The **frontier** is every open decision whose prerequisites are settled. Put the whole frontier to the advisors in one round, each question with the facts it needs and your recommended answer.
For the shape of the interface, ask each advisor to design it independently; two designs from different starting points expose more of the space than one.
Each settled decision moves the frontier. Recompute it and run the next round.

As decisions settle, keep the repository's language current:

- When a deepened module is named after a concept that the domain glossary lacks, add the term.
- When a decision or a rejection carries a reason that a future run would otherwise reopen, record it as an ADR, in the repository's ADR format.
- When an ADR blocks a decision, the decision reverses an owner decision: take it to the owner.

Done: the frontier of every chosen candidate is empty, every decision of its tree is in the log, and the glossary and ADRs hold what the decisions named.

### 6. Build

1. Author one proposal for the whole redesign through the proposal recipe of the `archboard` skill, holding each chosen candidate in its settled shape. Bind each new module to the path that will hold its source.
   Shelve each sketch proposal through the proposal completion recipe, with the reason: carried into the redesign, or rejected with the advisors' reason.
2. Write one ticket per chosen candidate in the repository's tracker, which its agent instructions name. Without a tracker, write the tickets beside the report.
   Give each ticket its slice of the proposal and its gate as the `With to-tickets` section of the `archboard-plan` skill says, and link its decisions in the log.
3. Order the tickets by blocking edges. The candidate whose module has the most callers goes first and alone. After it merges, tickets whose slices share no module run in parallel.
4. Hand each ticket to an implementer sub-agent in its own worktree, branched from the integration branch. Brief it with the ticket, its decisions, the [vocabulary](#vocabulary), and the tests to write at the seam. Tell it to leave the vault unchanged and to report each module that it changed outside its slice, with the reason.
5. Merge each ticket as the `With implement-spec` section of the `archboard-plan` skill says: its footprint gate, then its deviations. Where that section waits for the user, the advisors decide.
   Before the merge, in the ticket's worktree, the repository's tests pass and `archboard check code --fail-shallow-modules --base <integration-branch>` passes.
6. After the last merge, read the footprint of the whole integration branch and adopt the proposal, as the same section says.

Done: every chosen ticket merged with a passing gate or a recorded exception, the code check passes on the integration branch with no finding on a module the run touched, and the proposal is adopted.

### 7. Review

Run review rounds on the integration branch's diff from its base.
Give fresh reviewer sub-agents the diff, the proposal's comparison, the decision log and the [vocabulary](#vocabulary), each a disjoint part of the diff.
Fix each finding that you verify, and commit the fix. A finding that contradicts a settled decision goes to the advisors before you act on it.
After each round's fixes, run the tests and the code check again, then start the next round on the new diff.

Done: a round finds nothing, and the tests and the code check pass after its last fix.

### 8. Hand off

Tell the owner, in a few lines:

- The report and the decision log, by absolute path.
- The integration branch and its head commit, and the adopted proposal.
- The findings that started the run, and what the code check reports now.
- Each question that waits for the owner, with the advisors' answers.

Done: the owner has that message, and nothing of the run is left uncommitted.
