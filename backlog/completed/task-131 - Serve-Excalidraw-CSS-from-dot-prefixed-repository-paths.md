---
id: TASK-131
title: Serve Excalidraw CSS from dot-prefixed repository paths
status: Done
assignee:
  - '@codex'
created_date: '2026-08-28 01:33'
updated_date: '2026-08-28 02:05'
labels: []
dependencies: []
references:
  - src/server/canvas/lib/application.ts
  - scripts/check-local-bind.mjs
modified_files:
  - src/server/canvas/lib/application.ts
  - scripts/check-local-bind.mjs
priority: high
type: bug
ordinal: 147000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Independent prerequisite bug blocking TASK-096 live-session verification. Express rejects the explicit Excalidraw stylesheet route when its absolute sendFile path contains a dot-prefixed repository component, leaving Excalidraw unstyled and preventing the intended pane interaction from taking the board hold.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 /assets/excalidraw.css returns the installed stylesheet bytes and text/css when the repository path contains a dot-prefixed component.
- [x] #2 Excalidraw renders within its pane and the original live-session interaction reaches the existing first hold assertion.
- [x] #3 Existing static exposure and dotfile denial remain intact.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the existing test:bind public HTTP contract to launch the server through a deterministic dot-prefixed path alias and assert the stylesheet status, content type, and exact installed bytes without removing its bind or static-denial coverage.
2. Run test:bind before the route change and capture the stylesheet assertion failing.
3. Serve the fixed explicit route as index.css relative to the installed production directory root.
4. Re-run test:bind, then validate build, type-check, lint:code, fmt:check, git diff --check, and one serialized CYCLES=1 live-session run.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis established that absolute res.sendFile rejects the installed CSS path when the repository path contains a dot-prefixed component. The missing stylesheet expands Excalidraw beyond its pane, so the live-session click misses the intended interaction boundary and no initial hold is requested. The approved fix is limited to the explicit CSS route plus deterministic test:bind coverage.

Red: bun run test:bind failed against the unchanged route through the deterministic dot-prefixed alias. /assets/excalidraw.css returned 500 application/json and 49 bytes instead of 200 text/css and the installed 144,689 bytes.

Green: after changing only the explicit route to send index.css relative to the installed production directory root, bun run test:bind passed with its existing bind and static exposure assertions intact.

Validation: bun run test:bind, bun run build, bun run type-check, bun run lint:code, bun run fmt:check, and git diff --check all passed. The serialized CYCLES=1 bun run test:live-session run also passed; Excalidraw loaded from the fresh bundle and the original first delayed-hold assertion observed pending=["session"] and started=["session"].

Independent review corrections: moved creation and population of the dot-prefixed checkout alias inside the protected try block. Child shutdown now completes before the finally block removes the alias. Added a hidden file beside the existing dist/frontend probe, asserted its public URL returns 404, and let the same finally cleanup remove all static probes.

Rereview validation: bun run test:bind, bun run build, bun run type-check, bun run lint:code, bun run fmt:check, and git diff --check passed. The cleanup audit found 0 checkout aliases and 0 planted static probes. The production route did not change, so the browser lane was not run again.

Final verification: the independent rereview found no Standards or Spec findings. The reviewed production route is the same code that passed the serialized one-cycle live-session run; test:bind also proves public dotfile denial and cleanup.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Changed the explicit Excalidraw CSS route to serve index.css relative to its installed directory, so Express accepts dot-prefixed checkout paths without enabling dotfile access. Added deterministic hidden-path, exact-byte, MIME, denial, and cleanup coverage. Verified with test:bind, build, type-check, lint, format, live-session, and an independent clean rereview.
<!-- SECTION:FINAL_SUMMARY:END -->
