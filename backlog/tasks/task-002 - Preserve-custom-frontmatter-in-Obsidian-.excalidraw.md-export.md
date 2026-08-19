---
id: TASK-002
title: Preserve custom frontmatter in Obsidian .excalidraw.md export
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 13:55'
updated_date: '2026-08-19 15:01'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 2000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Existing frontmatter keys in a target .excalidraw.md survive export
- [x] #2 excalidraw-plugin and tags are still emitted when absent
- [x] #3 board / variant / level survive an import -> export round-trip
- [x] #4 Export remains idempotent and byte-lossless
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a small, dependency-free frontmatter scanner to src/core/obsidian-md.ts: scanFrontmatter(content) -> {kind:'none'} | {kind:'ok', lines} | {kind:'malformed', reason}. Only recognises a '---' block at the very start of the file; requires a closing '---' line; flags top-level lines that are neither blank, comment, indented continuation, nor 'key:' as malformed.
2. Preserve by round-tripping raw lines: keep the existing frontmatter body lines verbatim (order + formatting), and only insert 'excalidraw-plugin: parsed' / 'tags: [excalidraw]' when the key is absent, placed after the last non-blank line so a fresh export keeps its exact current shape.
3. wrapSceneAsObsidianMd(scene, existing?) gains an optional second arg carrying the destination file's current content; with no arg the output is byte-identical to today's template, so src/core/mcp-dispatch.ts (not owned here) is unaffected.
4. scene.ts export: when --out is an obsidian target, read the destination if it exists and pass it through. Refuse to clobber a non-empty destination that is not an Obsidian .excalidraw.md unless --force. Malformed frontmatter throws rather than being silently rewritten.
5. Verify with node against the built-free source (tsc-free: exercise via a small ESM harness in /tmp using the TypeScript stripped by node --experimental-strip-types, or a compiled-to-tmp copy): fresh export, export over custom frontmatter, idempotency (export twice -> byte-identical), losslessness (extract -> wrap(existing) === original bytes), plus empty/missing/malformed/not-an-excalidraw-md cases. Type-check with 'bunx tsc --noEmit'.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in src/core/obsidian-md.ts and src/cli/commands/scene.ts.

Approach: raw-line round-tripping, no YAML dependency. New exported scanFrontmatter(content) returns {kind:'none'|'ok'|'malformed'}; it only recognises a '---' block starting on line 1, requires a closing '---'/'...' line, and flags any top-level line that is not blank, a '#' comment, an indented continuation, or a 'key:' pair. The frontmatter body lines are then carried across verbatim — order, quoting, comments and block scalars intact — and only 'excalidraw-plugin: parsed' / 'tags: [excalidraw]' are inserted when their key is absent, placed after the last non-blank line so the block keeps its trailing blank line.

wrapSceneAsObsidianMd(scene, existing?) takes the destination's current content as an optional second arg; called with one arg (src/core/mcp-dispatch.ts, not owned here) the output is byte-identical to the previous hardcoded template. Malformed frontmatter throws before any work, so the caller never writes.

CLI: export resolves the out path first, reads the destination when the format is obsidian, and passes it through. A non-empty destination that isObsidianExcalidrawMd() rejects (someone's notes, a plain .md, raw JSON) is refused with a CliUsageError unless the new --force flag is given.

Verified with bun-run harnesses against the source (no build, no server, no port 3000), then cleaned up:
- fresh export to a new path: header byte-identical to the pre-change template; still recognised by isObsidianExcalidrawMd.
- export over custom frontmatter: board/variant/level survive, key order preserved.
- idempotent: export1 vs export2 over two import/export cycles -> cmp identical, md5 266cdb46637e0d827e5973fd4d6f50e0 both.
- lossless: human-edited file vs extract->wrap re-export -> cmp identical, 606 bytes.
- edge cases: missing / empty / whitespace-only / no-frontmatter destinations fall back to the default header; frontmatter without the plugin keys gets them appended (and that is itself idempotent); an existing multi-line 'tags:' block is not duplicated; quoted keys and comments preserved; unterminated and non-'key: value' frontmatter throw instead of overwriting; CRLF parsed; raw JSON and a '---' below line 1 are correctly not treated as frontmatter.
- guard table for the clobber refusal: 8/8 cases as intended, --force overrides.
- bunx tsc --noEmit clean.

Notes for the orchestrator: (1) src/cli/run.ts holds the 'export' usage string and is not in this task's owned files, so --force is undocumented there — the refusal error message names it. (2) A CRLF destination is normalised to LF on export, as the rest of the file was always LF-only. (3) Did not run 'bun run test' to avoid the shared port/dist while another agent works.

Orchestrator verification, end-to-end through the real CLI against a live canvas (the agent could only exercise pure functions): fresh export emits plugin keys; the original reproduction now preserves board/variant/level across import->export; export idempotent (cmp byte-identical); scene payload lossless across import->re-export; customData.archboard and link intact through the whole trip; clobber guard refuses a plain .md and leaves it untouched; --force overwrites while still preserving frontmatter. bun run test green (5/5 stdio wire checks, loopback bind check). Added --force to the export usage string in src/cli/run.ts, which the agent did not own.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Frontmatter is now carried across verbatim by raw-line round-tripping (no YAML dependency); wrapSceneAsObsidianMd takes the destination's current content as an optional second argument, and the export command reads the destination first. Added a guard refusing to overwrite a non-Excalidraw destination unless --force. Verified end-to-end through the CLI: the original board/variant/level reproduction passes, and idempotency and losslessness both still hold.
<!-- SECTION:FINAL_SUMMARY:END -->
