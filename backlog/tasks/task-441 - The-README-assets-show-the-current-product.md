---
id: TASK-441
title: The README assets show the current product
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 10:27'
updated_date: '2026-10-07 10:57'
labels:
  - readme
  - recordings
dependencies: []
references:
  - TASK-440
  - TASK-404
  - TASK-407
  - TASK-438
documentation:
  - docs/agents/readme-assets.md
priority: medium
type: docs
ordinal: 794000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nine older clips and narrated videos remain stale after the renderer and shell changes. The user asks to regenerate every remaining README asset, including fresh recordings, after TASK-440 added three new demonstrations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All thirteen remaining assets are regenerated from the current source, including the three narrated videos and the agent conversation clip.
- [x] #2 Every regenerated asset is inspected, each attachment fits the hosting limit, and the README links and captions match the new recordings.
- [x] #3 The README manifest reports all sixteen assets current, and the applicable repository gate passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Run the existing harness for the thirteen remaining assets after the active gate finishes. Use fresh Codex narration for the three videos. 2. Repair only harness issues exposed by those real takes, then inspect static images, clips, captions, and narrated video frames and audio evidence. 3. Upload the inspected attachments and update README links and captions. 4. Run the asset manifest and repository gates, simplify any fixes, complete the required review before pushing, and commit the completed refresh.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The first five assets regenerated successfully, including fresh Codex narration for the Archboard explainer. Its saved talk reaches all five steps and contains 118.3 seconds of voice. The Renderer layout history now has six saved generations, so the README gallery alt text, clip alt text, and caption were updated from the former three-state description. Both regenerated banners and the plan/history stills were inspected.

All thirteen assets regenerated successfully. The three narrated videos use fresh Codex talks, and the question clip contains a fresh agent answer. Parent inspected all static images and thumbnails, middle and late playback of nine encoded clips, and all sixteen narrated walkthrough steps. Full audio decoding succeeded for each MP4. Saved talks cover all steps and match their captions. Video durations are 118.33, 102.23, and 102.00 seconds. All animated images fit the 10 MB limit; the largest is hero at 7,983,346 bytes. Uploaded twelve media files and replaced their README links. The manifest reports 16 of 16 current, zero stale. Evidence stays under /tmp/task441-inspection, with upload results in /tmp/task441-attachments.log. No harness fix was needed for the thirteen existing assets.

Final bun run check passed: 4,647 tests, zero failures. Both dogfood checks exited zero. The code check has no warnings and no README task commits in its behind report. The final documentation review found zero issues with the twelve link replacements or the six-generation history caption. Simplification required no new code for this refresh. Commit 68eadcd30 contains the regenerated assets and links. New GitHub attachments resolve for the uploader before publication; public link verification follows the push.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Regenerated all thirteen existing README assets, with fresh narration for three videos and a fresh agent answer. Inspected all images, clip playback, video steps, captions, and audio decoding. Uploaded twelve media files, including the refreshed TASK-440 demonstrations. Updated README links and the history caption. All sixteen assets are current, and the full gate passes 4,647 tests. TASK-404, TASK-407, and TASK-438 now record their completed recording follow-ups.
<!-- SECTION:FINAL_SUMMARY:END -->
