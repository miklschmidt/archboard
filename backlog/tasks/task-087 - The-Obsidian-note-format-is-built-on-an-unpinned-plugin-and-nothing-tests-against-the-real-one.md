---
id: TASK-087
title: >-
  The Obsidian note format is built on an unpinned plugin, and nothing tests
  against the real one
status: To Do
assignee: []
created_date: '2026-08-21 12:18'
labels: []
dependencies:
  - TASK-085
references:
  - docs/adr/0017-a-note-keeps-its-own-record-of-where-its-images-went.md
  - docs/adr/0004-boards-are-obsidian-vault-notes.md
  - src/core/obsidian-md.ts
  - scripts/check-obsidian-md.mjs
priority: medium
type: task
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0004 makes a board a note in an Obsidian vault, and ADR 0017 decided archboard preserves the plugin's `## Embedded Files` record and follows the wikilinks in it. Both rest on what the plugin does.

That behaviour was established properly — by reading `ExcalidrawData.ts`, the plugin's own source, rather than its documentation, and the functions it cites are really there. But the copy was fetched into a scratch directory during the work and **no version was recorded**. It is whatever the default branch held that day. The scratch copy is not durable and will be gone.

Nothing tests against the real thing either. `check-obsidian-md` has 197 checks and every one of them compares archboard against a note archboard wrote. A fixture we author cannot disagree with us, so the checks would stay green if the plugin's format moved underneath them.

Worth being clear that this is latent rather than live. The vault at `ARCHBOARD_VAULT` has no `.obsidian` directory, so it has never been opened in Obsidian, no plugin is installed against it, and none of its notes carries an `## Embedded Files` section. The interop is real work for a real decision (ADR 0015 makes every gesture a note write, so the day somebody does open a board in Obsidian the cost goes from occasional to constant) — but nobody is losing images today.

The second acceptance criterion needs Obsidian actually available to run, which is environment work that does not exist yet: this box has no devenv and its system dependencies are not in order. That is deliberately out of scope here. Recording the version and the dependency list is not, and is most of the value.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The plugin version the note-format work was read from is recorded durably, next to the format code or the ADR
- [ ] #2 Which plugin behaviours archboard depends on are listed, each saying where it was read from
- [ ] #3 A check exercises a note the real plugin wrote rather than only notes archboard wrote
- [ ] #4 What is needed to run Obsidian in a check is written down, even if it is not built
<!-- AC:END -->
