---
id: TASK-444
title: Copy rendered boards with image and HTML clipboard formats
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 18:22'
updated_date: '2026-10-07 20:49'
labels: []
dependencies: []
references:
  - TASK-443
ordinal: 727000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Chrome Copy image offers a PNG and HTML with an image source and description together. TASK-443 added image pipelines, but wl-copy exposes only one format. The user wants the CLI to copy both representations so image editors and rich text editors can choose the supported representation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A clipboard destination on semantic rasterize copies PNG and HTML together on Linux and macOS without requiring a clipboard manager. It honors the selected board, variant, view, theme, scale and region.
- [x] #2 The HTML carries a self-contained image source and an escaped, useful description. It does not depend on a temporary file or the Archboard server remaining available.
- [x] #3 The CLI reports success only after the native clipboard accepts both formats. The image remains available after the CLI exits. Unavailable desktops and failed writes produce useful errors without a success receipt.
- [x] #4 Clipboard output refuses combination with an explicit output file. Existing raw stdout and explicit file output keep their behavior.
- [x] #5 Focused tests cover the clipboard transport and command contract. Help and consumer guidance describe native Linux and macOS support and the image-plus-description command.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add --clipboard to semantic rasterize as a destination that conflicts with --out. Keep raw bytes and file receipts unchanged. Return a JSON receipt for the copied image.
2. Build escaped, self-contained HTML from the PNG and the selected board, variant, view and SVG accessibility metadata. Capture and clean up Chromium before publishing.
3. Use the approved @teddyzhu/clipboard package in a private detached Bun helper owned by src/runtime/image-clipboard. Send one payload through IPC and wait for a native write acknowledgement. On macOS, exit after the system accepts the copy. On Linux, retain ownership until a bounded periodic HTML read observes a different copy or the desktop disconnects. Include an inert unique HTML marker so repeated identical exports retire their previous owners.
4. Bound startup, terminate failed or cancelled helpers, and detach only after acknowledgement. Test the process contract without touching the desktop. Test native Wayland copying and retirement on the actual desktop, preserving its prior contents.
5. Update help, the CLI audit, installation guidance and consumer skill. Run focused tests and the complete gate.
Architecture proposals: Command interface@TASK-444 adds the image clipboard module. Archboard@TASK-444 adds the local clipboard owner process. Both remove the unbuilt CopyQ boundary. The Archboard server never owns the clipboard, so --url can target another machine. Inspect and adopt the proposals at completion.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CopyQ 16.0.0 is installed and already running on the current Hyprland desktop. Its documented copy command accepts multiple MIME representations atomically and the manager retains ownership after the CLI exits. A fixed eval script reads JSON from stdin, so image data never enters the argument list or a shell. No dependency installation is needed.

The user rejected the CopyQ runtime prerequisite and confirmed Linux and macOS as product targets. Replace the transport with a native Bun/Node package. Research identifies @teddyzhu/clipboard as supporting one PNG-plus-HTML write on native Wayland, X11 and macOS. Its Linux clipboard owner must remain alive after the CLI exits. Dependency approval and owner lifecycle investigation are pending.

The user approved @teddyzhu/clipboard. Version 0.0.10 is installed and its native library loads under Bun. The package listener lacks a reliable subscription acknowledgement and can combine an older event with newer contents, so it cannot safely own helper cleanup. Use periodic HTML identity reads instead; every interval remains in shared/timing.

Native Wayland desktop QA passed with CopyQ stopped: the real command offered image/png and text/html after CLI exit, the HTML embedded the identical 3899x2517 PNG, and its alt text matched the receipt. The helper remained available across several poll intervals and exited after the original clipboard was restored. CopyQ was restarted in its approved Wayland mode. macOS behavior is backed by the package pasteboard implementation but cannot be exercised on this Linux machine. Focused process tests passed (4 tests, 83 assertions), including identical successive copies retiring the previous owner. Simplification replaced explicit child event listeners with node:events.once and shared the render option mapping between SVG and PNG exports. No CopyQ reference remains in active code or consumer guidance.

Proposal code checks introduce no findings against the current-board baseline. Footprints read against 36c557983 identify Rasterize, Clipboard image and Image clipboard as named and changed on Command interface, and Clipboard owner on Archboard. Agent CLI is a drill-down and is represented by the Command interface proposal. Render, Board client and the Commands container changed internally in 650a983e2 for TASK-445 and the shared render mapping; their responsibilities and existing relationships remain accurate. No named part lacks an implementation change. README baseline e9a766843 already had all 16 assets stale. Only the architecture diagram depicts the newly added process, so regenerate that asset after adoption.

After adoption, the vault check passes with no diagnostics. The code check keeps only baseline findings. The behind report for 650a983e2 names Board rasterizer (Receipt and its container) and Skill evaluation (Evaluation inputs). Receipt changed only explanatory comments for comparison-off output; its schema and module relationships are unchanged. Evaluation inputs changed only coverage rows for the new CLI behaviors; the evaluator and its dependencies are unchanged. Both boards remain accurate.

The user identified the old wl-copy example in semantic render help as misleading. Both render and rasterize help now show the native rasterize --clipboard command as the clipboard example. Raw pipe behavior remains available and documented for explicit single-format workflows.

Final gate: bun run check passed all normal lanes. The final help-only correction then passed the CLI artifact and introspection owners (6 tests, 53 assertions). Architecture proposals are adopted and claims released. Regenerated and visually inspected the README architecture diagram in light and dark themes; updated its alt text. Other README assets were already stale at e9a766843 and their pictured behavior did not change. Consumer skill source and generated installation guidance are current; existing installed copies in other repositories refresh on their next install-skill run.

Pre-push clipboard runtime review: derive ImageClipboardError refusal codes from the IPC reply schema instead of maintaining a second union. Installed @teddyzhu/clipboard 0.0.10 declarations and its tagged Rust source confirm that setContents publishes the PNG and HTML in one native operation. Scoped type-aware lint and formatting pass. A disposable process-boundary fault probe blocked the helper inside synchronous setContents, cancelled the caller after helper startup, and proved rejection preserved the caller reason and the helper was killed and reaped in 34 ms. No architectural board changes are required: the error representation and owner lifecycle remain the same.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added semantic rasterize --clipboard with native PNG and self-contained HTML output on Linux and macOS. Linux helpers keep the copy alive after command exit and retire on replacement. No clipboard manager is required. Full gate, process-contract tests and real Wayland QA passed with CopyQ stopped. Both export help pages point to native clipboard copying. Adopted the architecture proposals and refreshed the README system diagram.
<!-- SECTION:FINAL_SUMMARY:END -->
