---
id: TASK-036
title: Installing the skill into a repo leaves the setup undocumented
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 03:09'
updated_date: '2026-08-20 03:29'
labels: []
dependencies: []
references:
  - src/cli/commands/install-skill.ts
  - INSTALL.md
  - skills/excalidraw-skill/SKILL.md
priority: high
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Feedback from a real Codex plus GPT-Live session. `archboard install-skill` copies the skill and stops. Everything the next agent in that repo needs to actually use archboard stays in the installing human's head.

Three gaps, all reported from use:

1. Nobody is asked where the vault goes. ARCHBOARD_VAULT has deliberately no default (INSTALL.md section 3), so an agent that installs the skill and walks away leaves a repo where every board command fails on the vault message. The install flow should ask, and should assume the answer is a vault local to this project or repo unless told otherwise. That is a change from INSTALL.md's current framing, which presents one cross-repo vault as the normal case.

2. The environment is undocumented. ARCHBOARD_VAULT and whatever else the machine needs are set in one shell and invisible to the next agent.

3. The binary's location is undocumented. If archboard is not on PATH, an agent in that repo has a skill telling it to run `archboard` and no way to find it.

The fix is that installing the skill writes the setup down where the next agent will read it, in the repo's own CLAUDE.md or AGENTS.md, the same way scripts/../.claude conventions are recorded today. INSTALL.md should carry the instruction and the install command should support it rather than leaving it to memory.

Also worth recording in the same place: project conventions and gotchas that are not derivable from the code, for example which board covers this repo (TASK-030 territory) and any level vocabulary this project uses.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The install flow asks where the vault should live and offers a project-local or repo-local location as the assumed answer
- [x] #2 After installing, the repo's CLAUDE.md or AGENTS.md documents ARCHBOARD_VAULT and any other required environment
- [x] #3 The same place records how to invoke archboard when it is not on PATH
- [x] #4 The same place has a spot for project conventions and gotchas, and the installer is told to fill it
- [x] #5 INSTALL.md carries these instructions rather than assuming the human remembers
- [x] #6 Installing into a fresh repo and then starting an agent there is enough for that agent to draw a board with no further human input
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. install-skill grows a repo-setup half: --repo, --vault, --doc, --no-doc, --yes. After copying the skill it resolves the repo root (git root of cwd), resolves a vault (--vault > $ARCHBOARD_VAULT > TTY prompt defaulting to <repo>/.archboard/vault > that default when not a TTY), creates the vault directory, and writes a managed block into the repo's CLAUDE.md or AGENTS.md.
2. Doc selection follows the setup-matt-pocock-skills rule: existing CLAUDE.md wins, else existing AGENTS.md, else create the one matching --target (claude -> CLAUDE.md, anything else -> AGENTS.md). Never create the other one. The block sits between <!-- archboard:begin --> and <!-- archboard:end --> markers and is replaced in place on a re-run.
3. The block records: how to invoke the binary (resolved for real, 'archboard' only when a PATH entry actually points at this build, otherwise the absolute bin/canvas path), ARCHBOARD_VAULT and the per-command prefix form, the fact that the canvas server holds the vault it started with, and a 'Boards for this repo' section left for the human to fill.
4. New scripts/check-install-doc.mjs covers: fresh repo gets a doc plus a vault dir, re-run updates in place with no duplicate block, an existing AGENTS.md is used and CLAUDE.md is not created, --no-doc leaves the repo alone. Wired into bun run test as test:install.
5. INSTALL.md rewritten around the new flow: five things instead of four, project-local vault as the assumed answer with the cross-repo vault kept as the alternative, install-skill documented as the step that writes the setup down, and the TASK-030 hand-written section folded into the generated block.
6. Verify AC 6 by installing into a throwaway repo in a temp dir and driving a board from a cold read of the generated doc, against my own canvas server on a random port.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
install-skill now has a second half. After copying the skill it resolves the repo (git root of cwd, or --repo), resolves a vault (--vault, else ARCHBOARD_VAULT from the environment, else a TTY prompt offering <repo>/.archboard/vault, else that path when stdin is not a terminal), creates the vault directory, and writes a marker-fenced block into the repo's CLAUDE.md or AGENTS.md. Doc choice follows the setup-matt-pocock-skills rule: an existing CLAUDE.md, else an existing AGENTS.md, else the one matching --target, and never both. Re-running replaces the block in place.

The block records the vault path and the prefix form for shells that do not carry variables between commands, the fact that the server keeps the vault it started with, the exact command that runs the CLI here (only 'archboard' when a PATH entry really resolves to this build, otherwise the absolute bin/canvas path), the canvas URL, and a 'Boards for this repo' section left empty for a human to fill. EXPRESS_SERVER_URL is written too when it is not the default.

Running it inside the archboard checkout writes no block: that repo's CLAUDE.md is authored, not generated.

Verification: scripts/check-install-doc.mjs (33 checks, wired in as bun run test:install) covers doc choice, in-place replacement, prose survival, --vault/--doc/--no-doc and an ARCHBOARD_VAULT already in the environment. AC 6 was tested by hand: a throwaway repo in a temp dir, install-skill, then following only the generated AGENTS.md produced a board, a labelled rectangle and payments.excalidraw.md in the repo-local vault, against a private canvas server on port 39847 so the live one on 3000 was never touched. The TTY prompt was exercised under script(1) both ways, empty answer and typed path.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 03:29
---
skills/excalidraw-skill/references/cheatsheet.md still describes install-skill as '--dir <skills-root>' only, and SKILL.md's table says the same. Neither mentions the vault question or the repo block. Left alone deliberately: TASK-037 owns that directory right now. Worth one line there once it lands.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard install-skill now sets a repo up instead of only copying files. It chooses a vault (repo-local at <repo>/.archboard/vault unless --vault, an existing ARCHBOARD_VAULT, or a typed answer at the prompt says otherwise), creates it, and writes a marker-fenced block into the repo's own CLAUDE.md or AGENTS.md carrying the vault path, the exact command that runs the CLI on this machine, and an empty 'Boards for this repo' section for conventions and gotchas. Re-running replaces the block in place; the archboard checkout itself is exempt. INSTALL.md is restructured around it: five things that have to be true, project-local vault as the assumed answer, the shared vault kept for diagrams that span repos. Verified by scripts/check-install-doc.mjs (33 checks, in bun run test) and by installing into a throwaway repo and drawing and saving a board from a cold read of the generated doc alone.
<!-- SECTION:FINAL_SUMMARY:END -->
