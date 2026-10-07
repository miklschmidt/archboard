---
id: TASK-443
title: Pipe rendered boards into clipboard tools
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 14:19'
updated_date: '2026-10-07 14:31'
labels: []
dependencies: []
ordinal: 726000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Copying a rendered board currently requires a file and a JSON receipt. The user wants to pipe an image directly into wl-copy, like Chrome Copy image, and retain description text where the format supports it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 semantic render without --out writes the standalone SVG to stdout, with its accessible description and no JSON receipt.
- [x] #2 semantic rasterize without --out writes valid PNG bytes to stdout for image clipboard tools.
- [x] #3 Explicit --out paths retain file writes and JSON receipts. Failures write no image bytes to stdout.
- [x] #4 Help and author guidance show SVG and PNG clipboard pipelines, including the format limitations for descriptions.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make --out optional on semantic render and semantic rasterize. Select the existing raw output mode when no path is supplied. Keep file receipts for explicit paths.
2. Publish complete SVG or PNG output only after rendering and cleanup succeed. Preserve SVG description metadata and document the PNG/text limitation.
3. Extend the existing command owners to prove clean stdout, byte-safe PNG pipelines, file compatibility, and failure behavior. Update command audit and author guidance, then run focused and complete gates.
No architecture board is affected: commands keep the same render service, rasterizer, and output owner. The existing raw output mode supplies the new destination without new modules or dependencies.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented stdout image output with the existing raw output mode. Explicit --out paths still stage an artifact and return the existing receipt. Both SVG and PNG use Uint8Array results, so the existing publisher writes exact bytes without a text newline. PNG output still waits for successful browser cleanup.
SVG retains the accessible name and any longer description that the renderer supplies. Flat architecture drawings have an accessible name but no desc element. Sequence drawings have a desc element. PNG keeps visible labels, but not SVG metadata. The wl-clipboard manual confirms that one copy offers one format, so a pipe cannot also provide separate plain text.
Simplification pass: reuse the existing render, rasterize, and raw-output paths. No clipboard dependency, new output mode, new flags, or renderer changes. All export pipe assertions live in the existing rasterize owner.

Final validation passes: type checking, lint, formatting, frontend build, module tests, system tests, repository tests, serial browser tests, and focused skill/install tests. The initial gate stopped at the test owner size limit, then the remaining components ran individually. Moved SVG pipe assertions into the existing rasterize owner. Fixed the raw-result schema type to accept the rasterizer Uint8Array<ArrayBufferLike> contract without copying bytes or changing runtime validation. The final export/artifact run passed 6 tests with no warnings.
Both dogfood checks exited 0. Actual Skill evaluation SVG and PNG outputs passed through pipes into scratch files. The SVG parses and retains aria-label and desc. The PNG is complete, has valid chunk checksums, and measures 3899 by 2517 pixels. The private server stopped after testing. The user clipboard was not changed. Logs: /tmp/archboard-task-443-validation.
The code check at 43c15fbd8 reports Command interface behind for Render, Rasterize, and Commands, and Skill evaluation behind for its Evaluation inputs. The commands keep their drawn renderer/rasterizer connections and roles. This task adds a destination in the existing raw-output publisher, so the boards remain true.
README asset hashes remain stale from TASK-442. This task changes the CLI destination and help, with no change to images generated with an explicit --out. No asset refresh is needed for the exported picture.
Chromium WriteImageWithTag copies bitmap data and HTML image markup. The wl-clipboard manual states that wl-copy accepts arbitrary image formats but offers one format per copy. SVG metadata stays inside the SVG. PNG export does not retain that metadata as separate text.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Both image commands now support stdout pipelines. SVG preserves its existing accessibility metadata, and PNG gives clipboard tools complete image bytes. Explicit output paths retain file receipts. All gate components and real board pipeline smoke tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
