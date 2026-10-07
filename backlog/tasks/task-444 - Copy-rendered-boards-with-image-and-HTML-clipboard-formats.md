---
id: TASK-444
title: Copy rendered boards with image and HTML clipboard formats
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 18:22'
updated_date: '2026-10-07 18:26'
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
- [ ] #1 A clipboard destination on semantic rasterize copies PNG and HTML together through CopyQ, with the selected board, variant, view, theme, scale and region honored.
- [ ] #2 The HTML carries a self-contained image source and an escaped, useful description. It does not depend on a temporary file or the Archboard server remaining available.
- [ ] #3 The CLI reports successful clipboard output only after CopyQ accepts both formats. Missing or unavailable CopyQ fails with a useful error and does not claim success.
- [ ] #4 Clipboard output refuses combination with an explicit output file. Existing raw stdout and explicit file output keep their behavior.
- [ ] #5 Focused tests cover the clipboard transport and command contract. Help and consumer guidance explain the CopyQ prerequisite and the image-plus-description command.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add --clipboard to semantic rasterize as a destination that conflicts with --out. Keep raw bytes and file receipts unchanged. Return a JSON receipt for the copied image.
2. Add a private command adapter that uses the installed, running CopyQ. Send a fixed script and one JSON payload over stdin, then copy PNG and HTML in one operation. Include an embedded PNG source and escaped board/view/variant identity plus SVG accessibility metadata. Use the existing Chromium rasterizer and wait for clean teardown before copying.
3. Refuse unavailable CopyQ, failed writes, and cancelled commands without a success receipt. Add focused process-contract coverage using an isolated CopyQ stand-in. Inspect both real clipboard formats after the command exits.
4. Update help, the canonical CLI audit, installation guidance and the consumer skill. Run focused checks and the complete gate.
Architecture proposals: Command interface@TASK-444 and Archboard@TASK-444 add the optional CopyQ boundary and describe Rasterize clipboard output. No new application process or runtime module is owned by Archboard. Inspect the proposals against the implementation and adopt them at completion.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CopyQ 16.0.0 is installed and already running on the current Hyprland desktop. Its documented copy command accepts multiple MIME representations atomically and the manager retains ownership after the CLI exits. A fixed eval script reads JSON from stdin, so image data never enters the argument list or a shell. No dependency installation is needed.
<!-- SECTION:NOTES:END -->
