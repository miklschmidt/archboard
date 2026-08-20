---
id: TASK-060
title: 'Saving a board embeds another board images, and images do not survive a reopen'
status: To Do
assignee: []
created_date: '2026-08-20 19:04'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/types.ts
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while investigating a stateless server, measured in source, not fixed.

Two halves of one gap in how scene files are handled.

src/server.ts around 2678 builds the note's `filesObj` from the whole process-global `files` map with no board filter. The map is keyed by file id and shared by every open board, so saving board A writes board B's images into A's note. With several boards open, every save carries everyone else's attachments.

ingestSceneElements around 2392 never restores `scene.files`, so an image that was in a note is not put back into the map when the board is reopened. The image element survives, its data does not, and the board comes back with a broken picture.

Together: images leak sideways on write and are lost on read. Neither is loud.

The library and stencils are unaffected. This is only the `files` map that carries pasted or imported images.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A saved note contains only the images its own board uses
- [ ] #2 An image in a note is restored when the board is reopened, and renders
- [ ] #3 A check saves two boards with different images and asserts neither note carries the other
<!-- AC:END -->
