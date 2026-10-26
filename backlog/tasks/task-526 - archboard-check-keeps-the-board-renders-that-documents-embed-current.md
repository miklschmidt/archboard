---
id: TASK-526
title: archboard check keeps the board renders that documents embed current
status: Done
assignee: []
created_date: '2026-10-24T15:33:00Z'
updated_date: '2026-10-25T00:01:00Z'
labels:
  - cli
  - renderer
  - code-check
  - skill
dependencies: []
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
priority: high
type: enhancement
ordinal: 920000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Documentation sites embed board pictures, often from a vault in another repository. After a code change, the code check says that a board no longer matches the code, and somebody corrects the board. Nothing then says which embedded pictures now show the old board, because `semantic render --out` records nothing in the file. The code check is also easy to skip: the plain `archboard check` never runs it. The owner decided the design in a design interview on 2026-10-24, recorded in ADR 0057: one `archboard check` runs every check, every board render carries its render recipe, `check embeds` keeps embeds current with `--fix`, a board can list its tracked embeds, and a board can be deleted from the CLI. The terms are in CONTEXT.md: Render recipe, Embed, Tracked embed, Embeds check, Semantics check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every subtask is Done
- [x] #2 A code change that makes an embedded picture outdated is reported by `archboard check` in the repository that holds the embed, and `archboard check --fix` draws it again
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Criterion 2, as decided in the design interview, is two checks in sequence: the code check warns that a code change made a board stale (check code), and once the board is corrected, the embeds check in the repository that holds the embed reports it outdated and --fix draws it again (tests/system/semantic-boards/embeds-check.test.ts, embeds-without-vault.test.ts, tracked-embeds.test.ts). archboard check runs both. No test drives both steps from one source edit. The parent stays open while TASK-526.07 criterion 3 waits for the owner.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard check and check all run every check, and check semantics, check code and check embeds run one each (ADR 0057, with Amended-by lines in ADR 0045, 0046, 0049 and 0054). Every SVG and PNG render carries a render recipe, and SVG renders follow the reader's colour scheme and draw a legend by default. check embeds finds the embeds that Git tracks, draws each again from its recipe and warns when the board changed what it shows, and --fix draws them again and lists every re-pointing. --track makes a tracked embed that its board lists, so the vault's own check sees embeds in other repositories. A vault of an unregistered repository is fetched shallow and sparse and cached by commit. semantic delete removes a board, and the check names the deleting commit. The skill and the README teach it, and the README's architecture SVGs are tracked embeds. Not measured: the layout timing bounds of wide-boards.test.ts, under another agent's load on this machine (TASK-527).
<!-- SECTION:FINAL_SUMMARY:END -->
