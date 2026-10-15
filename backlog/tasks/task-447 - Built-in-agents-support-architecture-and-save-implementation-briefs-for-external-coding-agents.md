---
id: TASK-447
title: >-
  Built-in agents support architecture and save implementation briefs for
  external coding agents
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 19:57'
updated_date: '2026-10-15 03:39'
labels:
  - voice
  - coordinator
  - workhorse
dependencies: []
references:
  - src/runtime/codex-instructions
  - src/runtime/codex-realtime/lib/voice-prompt.ts
  - .agents/skills/handoff/SKILL.md
documentation:
  - >-
    docs/adr/0047-built-in-agents-support-architecture-and-hand-off-implementation.md
priority: high
type: bug
ordinal: 730000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The October 7 coordinator interpreted a feasibility question as authority to implement a proposal on a branch with other work. The user uses their own coding agent for product implementation. Archboard needs consistent architecture roles and a saved brief that gives that agent the correct live board context. The user chose instructions rather than narrower permissions because repository diagnostics write untracked output folders.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Coordinator, workhorse, and delegated agents assist architectural inspection, analysis, proposals, and requested architecture documents. Explicit implementation requests produce briefs instead of product code.
- [ ] #2 Ambiguous build questions receive feasibility, blockers, and next architectural steps. They never start product implementation or automatically create an implementation brief.
- [ ] #3 Architectural investigation can run existing tests and diagnostics, including normal untracked output folders. Temporary experiments live outside repositories. Existing permissions remain unchanged.
- [ ] #4 An explicit implementation request always saves a Markdown implementation brief in the OS temporary directory and reports its path. It creates no repository file.
- [ ] #5 The brief identifies the board, proposal, observed version, affected repositories, unresolved decisions, intended change, acceptance criteria, and suggested skills without duplicating existing artifacts.
- [ ] #6 The brief includes the actual CLI path, ARCHBOARD_URL, ARCHBOARD_VAULT, ARCHBOARD_NO_AUTOSTART=1, and concise commands to retrieve the proposal and its differences.
- [ ] #7 A saved brief survives ordinary thread interruption. A failed save is reported without claiming that a brief exists. Secrets are omitted.
- [ ] #8 Behavioral evaluation covers feasibility, explicit implementation, architectural artifact changes, diagnostics, and delegation. Documentation and instructions consistently describe the agreed role.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
This task keeps built-in agents focused on architecture and gives the user coding agent a saved implementation brief. ADR 0047 defines the agreed behavior.

Affected proposals: Codex workhorse@TASK-447, Voice coordinator@TASK-447, and Agent workbench@TASK-447.

1. Trace every coordinator, voice, workhorse, fork, and native delegation instruction path. Update the authored roles and reviewed instruction digests consistently. Carry the architecture role into descendants.
2. Permit source inspection, existing tests, diagnostics, requested board changes, and requested architecture documents. Permit normal untracked diagnostic output. Put temporary experiments outside repositories. Preserve the existing sandbox, approval policy, and network permissions.
3. Answer ambiguous build questions with feasibility, blockers, and next architectural steps. An explicit implementation request produces a brief for the user coding agent. Built-in agents do not implement product code.
4. Save every requested implementation brief as Markdown in the OS temporary directory. Use the handoff skill location convention, a unique readable name, and ordinary agent file tools. Add no handoff service, tracked repository file, or new storage configuration. Report the actual saved path only after a successful save. Preserve saved documents across ordinary thread interruption.
5. Include the board, proposal, observed board version, affected repository paths, intended change, unresolved decisions, acceptance criteria, and suggested skills. Reference existing plans, decisions, and diffs rather than duplicating them. Omit secrets.
6. Include the actual CLI path and concrete ARCHBOARD_URL, ARCHBOARD_VAULT, and ARCHBOARD_NO_AUTOSTART=1 values for the live instance. Give concise semantic show and semantic compare commands that name the proposal. Quote paths and names correctly. Explain that the observed version is a snapshot and the external agent must retrieve current context before work. Do not copy a built-in thread identity into the external agent commands.
7. Use a short completion message and saved path for tell_coordinator, within its existing size limit. Keep the complete brief in the saved file. Report save or retrieval failures explicitly. Do not claim that the brief exists after a failed save. Do not dispatch work to another harness automatically.
8. Sweep PRODUCT.md, CONTEXT.md, ADR 0019, built-in instruction sources, voice prompts, and relevant examples for the old implementation role. Preserve the consumer skill for external coding agents and normal repository development workflows.
9. Evaluate public behavior for feasibility, explicit implementation, requested architecture edits, diagnostics, and descendant delegation. Observe tool actions and file artifacts instead of asserting exact prompt wording. Use focused contract tests for live retrieval context and save outcomes where a deterministic owner exists. Keep evaluation fixtures outside shipped instructions.
10. Run focused tests and bun run check. Inspect the proposals against the built code, read their code findings and commit footprints, and restate drafts if another task changed their parents. Adopt only when implementation meets the acceptance criteria. Pause to simplify before closing.

The drafts change the responsibilities of existing instruction and start modules. They add no service, container entry point, or persistent brief store. This task can proceed independently of TASK-446. Their shared board drafts must be restated after either task adopts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Planning only. Runtime implementation has not started.

The user settled twelve design questions. Built-in agents support architecture, even after an explicit implementation request. Implementation requests always save a brief for the user coding agent. Ambiguous build questions receive feasibility. Existing permissions stay unchanged because diagnostics write untracked folders. Requested architecture documents remain allowed. Experiments live outside repositories.

The handoff skill was read only to understand its convention. It saves in the OS temporary directory, includes suggested skills, references existing artifacts, and omits sensitive information. The skill was not invoked. No implementation brief was created during planning.

The user requires actual Archboard environment values and concise commands for proposal retrieval. tell_coordinator has a 2048-character limit, so the completion message links to the saved file. Archboard thread tools address local built-in threads, not the user external harness.

The board check passes with no diagnostics. semantic compare changes only existing responsibilities. Current content remains unchanged. No proposal is adopted.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-15 03:39
---
From the TASK-472.06 boundary review: ADR 0047 is amended by ADR 0050. The implementation brief names the checkout and gives -C with the board's vault in place of ARCHBOARD_VAULT, so acceptance criterion #6 and plan step 6 are out of date. The Codex child environment no longer holds ARCHBOARD_VAULT (TASK-472.06), and the board context gives each board's vault as board.vault. The brief's commands take the form `archboard -C '<board.vault>' semantic show '<board>@<proposal>'`, and ARCHBOARD_URL and ARCHBOARD_NO_AUTOSTART=1 stay as before.
---

created: 2026-10-15 03:39
---
Correction to the comment above: the example command is only an illustration of where -C goes. Take the exact show and compare spellings from `archboard help semantic show` and `archboard help semantic compare`; -C goes before or after the command name, for example `archboard -C '<board.vault>' semantic compare '<board>@<proposal>'`.
---
<!-- COMMENTS:END -->
