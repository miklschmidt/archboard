---
id: TASK-017
title: Board save destroys prose written in the note
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 17:50'
updated_date: '2026-08-19 18:02'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 17000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Markdown a human writes outside the Drawing block survives an archboard save
- [x] #2 Verified with prose both above and below the Excalidraw Data section
- [x] #3 Export stays idempotent and lossless
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Region model in src/core/obsidian-md.ts: split an existing note into four regions — frontmatter (already round-tripped verbatim, TASK-002), BODY (end of frontmatter up to the '# Excalidraw Data' heading — the human's space, per the plugin's own convention), DATA (the heading through the closing fence of the Drawing block — ours, regenerated), TRAILING (everything after the closing fence, normally '\n%%' — carried across verbatim, which is also how prose written below the Drawing block survives).
2. Locate the DATA region with the same drawing-block regex the reader (extractSceneJsonFromObsidianMd) uses, so writer and reader can never disagree about which block is the scene; find its heading by scanning lines and skipping any '# Excalidraw Data' that sits inside a fenced code block, so prose that quotes the plugin's own headings is preserved rather than swallowed.
3. Defaults when the destination has no DATA region (new note, empty note, or a plain prose note being turned into a board): BODY = whatever prose is there (verbatim) plus the plugin's 'Switch to EXCALIDRAW VIEW' banner, TRAILING = '\n%%'. Never inject the banner into a note that already has a DATA region — that would break losslessness for boards whose banner a human removed.
4. Keep wrapSceneAsObsidianMd's signature and the save path untouched, so the TASK-010 sha-256 baseline still hashes exactly the bytes written and is unaffected.
5. Add scripts/check-obsidian-md.mjs (repo idiom: scripts/check-*.mjs) wired into 'bun run test', asserting the region model plus the two load-bearing properties — two consecutive saves byte-identical (idempotent), and re-wrapping an extracted scene reproducing the file byte-for-byte (lossless) — across every note shape: prose above, prose below, no prose, archboard-created, prose quoting plugin headings, empty note.
6. Verify behaviourally end to end against a real vault: reproduce the original bug, then confirm prose survives 'board open --reload' + 'board save', that the note still opens as a board afterwards, and that a second save is byte-identical. Run 'bun run test' and 'bun run type-check'; leave the canvas cleared.
7. Remove the 'Known shortfall' section from docs/adr/0004-obsidian-vault-as-persistence.md, which exists only to record this bug.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Region model implemented in src/core/obsidian-md.ts: preservedRegions() splits a destination note into body (verbatim, human's) / data (regenerated) / trailing (verbatim), on top of the frontmatter round-trip TASK-002 already had. Reader and writer now share one locateDrawingBlock(), so they can never disagree about which fenced block is the scene. Added scripts/check-obsidian-md.mjs (108 assertions, wired into 'bun run test' as test:obsidian) covering every note shape with idempotency + losslessness; green.

Verified behaviourally against a real vault (fresh ARCHBOARD_VAULT, server restarted with it):
- Original reproduction passes: prose added to a saved note, 'board open payments --reload' + 'board save' -> file byte-identical (diff clean), prose above and below intact.
- Scene change with prose in place: element moved to x=500, save wrote the new scene, both prose regions survived, second save byte-identical (idempotent).
- TASK-010 not regressed: an outside edit after the save still refuses ('Refusing to save', success:false); --force then writes and still keeps the prose — force discards the scene, never the human's writing.
- Empty note at the destination -> valid default board note, reopens. Plain prose note with a fenced markdown example containing '# Excalidraw Data' -> fence preserved verbatim, data section appended below it, idempotent + lossless, board reopens.
- bun run test: 5 stdio wire checks, local-bind check, 108 obsidian-md checks — all green. bun run type-check clean. Canvas cleared, server stopped.
Also removed the 'Known shortfall' section from docs/adr/0004 (it existed only to record this bug) and noted in its status note that prose alongside the diagrams is now real.

Orchestrator verification against a real vault: prose added both above the data section and below the Drawing block survived open --reload then save. Idempotency and losslessness both re-checked and pass. TASK-010 is not confused — an outside edit still refuses with exit 5, and --force writes while KEEPING the prose, so force discards the scene rather than the human's writing. bun run test now includes 108 obsidian-md assertions alongside the stdio wire and loopback checks.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 17:50
---
Verified by the orchestrator, not just reported: added '## Why this shape' prose to a saved note, ran board open --reload then board save, and the prose was gone. Any save destroys it — not only --force, because wrapSceneAsObsidianMd carries frontmatter across but regenerates the note body.

Severity is higher than it looks. ADR 0004 chose an Obsidian vault partly because it gives 'prose alongside the diagrams' for free; it does not, because archboard eats it. This is silent data loss of exactly the knowledge-base content the vault decision was made for, and it lands on the human's own writing rather than on generated content.

Note the irony worth avoiding in the fix: TASK-010 built careful protection against Obsidian eating archboard's changes while this goes the other way.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A note is now four regions and a save owns exactly one: frontmatter and trailing content are carried verbatim, the body above '# Excalidraw Data' is the human's and is preserved, and only the data section is regenerated. Reader and writer share one locateDrawingBlock so they cannot disagree about which fenced block is the scene. Heading detection skips fenced code, so prose quoting the plugin's own headings survives. Backed by a new 108-assertion suite covering eleven note shapes for idempotency, losslessness and scene extractability.
<!-- SECTION:FINAL_SUMMARY:END -->
