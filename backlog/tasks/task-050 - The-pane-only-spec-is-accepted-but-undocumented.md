---
id: TASK-050
title: The --pane only spec is accepted but undocumented
status: To Do
assignee: []
created_date: '2026-08-20 04:11'
labels: []
dependencies: []
references:
  - src/core/panes.ts
  - src/cli/run.ts
  - skills/excalidraw-skill/SKILL.md
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the TASK-045 agent while writing the pane documentation against the real CLI help rather than against the code.

`matchesSpec` in src/core/panes.ts accepts `only` as a pane spec. It is absent from PANE_SPECS and from the usage text in src/cli/run.ts, which lists left, right, top, bottom, 1, 2, primary, focused and a pane id.

The agent left it undocumented rather than write something the help contradicts. That was the right call for that task and it leaves the inconsistency here.

Decide one way. Either `only` is a real spec, in which case it belongs in PANE_SPECS, the help and the skill, or it is not, in which case `matchesSpec` should stop accepting it. Today a caller who guesses it works gets a silent success no documentation promised, and the next person reading the help will not know it exists.

Worth noting that `only` reads well: with one pane on screen its place is "the only pane", so a caller who read the panes report might reasonably type it back.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Either --pane only is documented in PANE_SPECS, the CLI help and the skill, or matchesSpec no longer accepts it
- [ ] #2 The pane spec list is the same in matchesSpec, PANE_SPECS, run.ts help and the skill
- [ ] #3 A check asserts those lists agree, so they cannot drift again
<!-- AC:END -->
