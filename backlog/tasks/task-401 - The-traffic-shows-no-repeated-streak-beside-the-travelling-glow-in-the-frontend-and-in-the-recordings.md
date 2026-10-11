---
id: TASK-401
title: >-
  The traffic and the sidebar leave no ghosts: not in the live frontend, the
  README clips or the recordings
status: Done
assignee:
  - '@claude'
created_date: '2026-10-05 23:11'
updated_date: '2026-10-06 01:08'
labels:
  - renderer
  - frontend
  - recording
dependencies: []
references:
  - src/transformers/semantic-renderer/lib/svg/pulse.ts
  - src/transformers/semantic-renderer/lib/svg/beam-light.ts
priority: high
type: bug
ordinal: 743000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner saw artifacts everywhere on their Mac in the early afternoon of 2026-10-05, right after the first push of the redesigned shell: in the live frontend, in the README clips and in the narrated recordings. The streak of a traffic pulse is repeated about 50 px along or beside the travelling glow, tiny marks of traffic stay in empty parts of the canvas (hero.webp), and in drill-down.webp the sidebar leaves a ghost of itself behind after it folds. There are two candidate causes. A rendering or compositing defect: a masked, SMIL-animated pulse whose old position is not repainted, which a headless screenshot hides but a screencast and a GPU browser show. Or the encoder: the kit writes lossy animated WebP (ffmpeg libwebp_anim, quality 90, preset drawing), which stores each frame as a changed rectangle over the one before and can leave a remnant of what moved. The raw filmed frames decide between them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The raw filmed frames and the live frontend on a GPU-style Chromium are checked for stale marks in empty canvas, and the cause is named with evidence
- [x] #2 No clip in docs/readme shows a remnant of anything that moved (no ghost of the sidebar after it folds, no speck of traffic in empty canvas) and the live frontend shows none, seen in frames, and the largest clip stays fit for the README
- [x] #3 The cheapest test that fails without a rendering fix holds it, the kit document says how the clips are encoded and why, and the clips and the narrated videos are made again
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Two defects, found in the raw filmed frames and in a GPU-composited Chromium. 1) The page slides each pulse bar as a Web Animation on the compositor, and there a masked bar leaked slivers outside the mask box. 2) The first fix put a clip-path to the same box on the masked group, and where the clip edge fell part way across a pixel Chromium drew one row of the bar with no mask, a static 1 px tick near a bend. The clip now sits in a group inside the masked group (src/transformers/semantic-renderer/lib/svg/pulse.ts), the mask markup is unchanged, the bars still slide on the compositor, and a motion test requires the structure. The agent's scans find 0 stray marks and 0 ticks in every configuration it tried; I looked at 20 consecutive frames of the new hero clip at 4x and found none. Separately, a lossy animated WebP left blocky ghosts (the sidebar of drill-down), so the filmed clips are lossless. An independent review reproduced the first defect and its absence. Not verified: the owner's real Mac GPU browser.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The renderer clips each piece of a pulse inside its mask, which removes the slivers and the ticks the owner saw in the live frontend and in the recordings; the clips are lossless, so the sidebar ghost is gone; every asset was made again and attached. Verified by raw-frame scans, frames viewed at 1:1 and 4x, the motion test that fails without the fix, and an independent review.
<!-- SECTION:FINAL_SUMMARY:END -->
