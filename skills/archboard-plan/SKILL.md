---
name: archboard-plan
description: >-
  Use whenever to-spec, to-tickets, or implement-spec runs in a repository with
  an .archboard/vault directory. Load it before that skill's first step, and
  never run any of those three skills there without it.
---

# Archboard Plan

Carry one Archboard **proposal** through a spec, its tickets and their implementation.
A proposal is a draft of the architecture that the spec builds, kept beside Current in the vault.
The spec shows the proposal, each ticket owns one **slice** of it, and each ticket merge stays inside the proposal.

Run the steps of this skill inside the steps of the skill that you run: `to-spec`, `to-tickets` or `implement-spec`.
That skill keeps its own process. This skill adds the architecture to it.
Before the first architecture operation, load the `archboard` skill. It owns every command, request schema and recovery recipe.

## With to-spec

1. While you sketch the seams, author one proposal for the whole spec through the `archboard` proposal recipe.
   Name it after the feature. Give it the spec's problem as its summary.
   Put every module, relationship and flow that the spec adds, changes or removes in the proposal.
   Bind each new module to the path that will hold its source.
   The footprint sees only bound modules, so an unbound new module hides every change made in it.

2. Show the user the seams beside `archboard model compare --state <proposal>`.
   A seam is a module interface. Read each one with `archboard model inspect <module> --state <proposal>`.
   Give the user the link to the proposal (see [links](#links)).
   Change the proposal until the user confirms the seams and the proposal together.

3. Add this section to the spec, after Implementation Decisions:

<architecture-section>

## Architecture Proposal

- Proposal: the proposal's name and stable ID, and the model ID.
- Link: the link to the proposal, compared with its base.
- Picture: a picture from `archboard model render --state <proposal> --out <file>`, so that readers without a local server see it.
- Changes: one line for each added, changed or removed subject from the comparison, in the domain language of the spec. Interface changes first.

</architecture-section>

4. Commit the vault files of the proposal before you publish the spec, so that every branch and worktree reads the same proposal.

Done: the spec names the proposal, and the comparison lists every architectural change that the spec describes.

## With to-tickets

1. Read the proposal and its comparison: `archboard model compare --state <proposal>`.

2. While you draft the vertical slices, give each ticket one slice of the proposal:
   - A tracer bullet owns a **flow**: the path that it cuts through the modules, and the subjects on that path that change.
   - A prefactor owns the modules and interfaces that it changes.
   - In a wide refactor, the expand ticket owns the added subjects, and the contract ticket owns the removed subjects.

   If a tracer bullet has no flow in the proposal, add the flow to the proposal first.

3. Make sure that each changed subject of the comparison belongs to exactly one ticket.
   If a subject belongs to no ticket, add it to a ticket or remove it from the proposal with the user's agreement.
   If two tickets need the same subject, make one of them block the other, or move the subject into a prefactor ticket.

4. When you quiz the user, add two lines to each ticket of the breakdown:
   - **Architecture**: the subjects or the flow that the ticket owns.
   - **Link**: the link to its slice (see [links](#links)).

5. When you publish the approved tickets, add this section to each ticket:

<ticket-architecture-section>

## Architecture

- Proposal: the proposal's name and stable ID.
- Slice: the qualified IDs of the subjects that this ticket owns. If the ticket owns a flow, add the flow's ID.
- Link: the link to the slice.
- Gate: before this ticket merges, `archboard model footprint --base <integration-branch> --head <ticket-branch> --state <proposal-id> --fail-outside` exits 0, and each module that it lists as changed is in this slice.

</ticket-architecture-section>

Done: each changed subject of the proposal has exactly one ticket, and each published ticket names its slice and its gate.

## With implement-spec

1. Read the proposal and the Architecture section of each ticket.

2. You, the orchestrator, are the only writer of the proposal.
   If parallel worktrees edit the vault, their changes conflict at the merge.
   Tell each implementer subagent its slice. Tell it to report each module that it changed outside its slice, with the reason, and to leave the vault unchanged.

3. Before you merge a ticket branch, run its gate in the worktree of the integration branch:

   ```bash
   archboard model footprint --base <integration-branch> --head <ticket-branch> --state <proposal-id> --fail-outside
   ```

   Exit status 1 means that the branch changed a module that the proposal does not name.
   Exit status 0 means that the branch stayed inside the proposal. Then compare `namedAndChanged` with the ticket's slice.
   A module of another ticket's slice is a **deviation** too.

4. For each deviation, find the reason, and then do one of these:
   - If the code is wrong, send the ticket back to its implementer.
   - If the proposal is wrong or incomplete, edit the proposal so that it describes the code.
     Write the reason in the edit's `--doing` line, for example `--doing "Deviation in <ticket>: the worker reads the queue directly, because <reason>"`.
     Archboard keeps that line in the proposal's history.
     Add the same reason to the ticket. If the change moves a subject between slices, update both tickets.
   - If the change alters an interface or a decision that the user confirmed, show the user the difference and the reason.
     Wait for the user's decision, and continue with the other tickets meanwhile.

   Run the gate again. When it exits 0 and every deviation has a recorded reason, merge the branch.

5. After the code review, read the footprint of the whole integration branch:

   ```bash
   archboard model footprint --base <default-branch> --head <integration-branch> --state <proposal-id> --fail-outside
   archboard check code --state <proposal-id>
   ```

   Explain each module in `namedNotChanged`: unfinished work, or a planned change that needed no code.
   Fix each finding of the code check that the work caused.

6. If the user authorized the work that the spec describes, adopt the proposal on the integration branch.
   Use the `archboard` proposal completion recipe, and commit the vault.
   If you open a pull request, load the `archboard-pr` skill for its body.

Done: every ticket merged through a passing gate, and every deviation has its reason in the proposal history and on its ticket.
The proposal is adopted, or the user made another decision.

## Links

A link opens a reading of the proposal in the Archboard browser. If the server is not running, start it with `archboard start`.
The release server listens on `http://archboard.localhost:4242`. If `ARCHBOARD_URL` is set, use its address.

```text
http://archboard.localhost:4242/?modelA=<model-id>&stateA=<proposal-id>
```

Add these parameters to read a slice:

- `focusA=<id>,<id>`: show only these subjects, with their containment paths.
- `grammarA=sequence&flowA=<flow-id>`: show one flow as a sequence diagram.
- `againstA=<state-or-checkpoint>`: compare with another base than the default.

Write each `#` of a qualified ID as `%23`, because a browser reads `#` as the start of a fragment.
Open each link once before you give it to the user, and make sure that it shows the proposal and the slice.
