---
id: TASK-090
title: >-
  We reimplement ~1800 lines of Excalidraw behaviour against a caret range, and
  nothing detects drift
status: To Do
assignee: []
created_date: '2026-08-21 13:36'
labels: []
dependencies:
  - TASK-088
  - TASK-087
references:
  - src/core/arrow-binding.ts
  - src/core/measure-text.ts
  - src/core/font-layout.ts
  - src/core/expand-elements.ts
  - package.json
  - scripts/check-fixed-point.mjs
priority: high
type: task
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Raised by the user on seeing that TASK-088 ported Excalidraw's binding math rather than calling it.

**Importing is not available, and that is established rather than assumed.** `determineFocusPoint` and `updateBoundPoint` appear zero times in the package's public types, and the package cannot be loaded server-side at all — `import('@excalidraw/excalidraw')` in bun throws `ReferenceError: window is not defined` at import time. It is a browser package. The server has to answer questions about arrows and text without a browser, because pure JSON operations are meant to work headless. So porting was the only route that keeps that true. Wrapping is not an option you can reach from the server, and it is worth writing that down so nobody re-litigates it.

**What porting leaves behind is the problem.** Four modules now encode behaviour we do not own:

| Module | Lines | Reimplements |
|---|---|---|
| `src/core/font-layout.ts` | 548 | GSUB/GPOS shaping, to reproduce what Chrome measures |
| `src/core/measure-text.ts` | 203 | Excalidraw's text width and height |
| `src/core/arrow-binding.ts` | 306 | `determineFocusPoint` and `updateBoundPoint` |
| `src/core/expand-elements.ts` | 746 | Element defaults, and the shape of a converted element |

And `package.json` depends on `^0.18.0`. A caret. A minor release can change any of the above and every check in the suite would still pass, because every check compares us against ourselves.

**The fix has two halves.**

Pin the version exactly, so an upgrade is a decision somebody makes rather than something `bun install` does. Record which behaviours are ported and where each was read from — the source maps in `dist/dev` are readable, which is how TASK-088 did it, and that provenance is worth keeping.

Then detect drift instead of hoping. **The tool for this already exists**: `check-fixed-point` drives a real browser running real Excalidraw. A check can ask actual Excalidraw where a bound arrow's endpoint lands, and compare it against `arrow-binding.ts`. Same for text: ask the page to measure a string and compare against `measure-text.ts`. That is a differential test against the real thing rather than against a fixture we wrote, and it is the only kind that can fail when Excalidraw moves.

TASK-088 recorded one deliberate approximation in `arrow-binding.ts`'s header — Excalidraw expands a shape's outline corner by corner along bezier diagonals, ours expands analytically and treats a rounded corner as square, differing only within a corner radius and by at most the gap. A differential check needs to encode that tolerance rather than trip over it, which is a good forcing function for stating it precisely.

Same shape as TASK-087, which is the Obsidian plugin version of this: behaviour read from somebody else's source, no version recorded, no check against the real thing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The excalidraw dependency is pinned to an exact version, not a caret range
- [ ] #2 Which Excalidraw behaviours archboard reimplements is listed, each saying which module and where it was read from
- [ ] #3 A browser-driven check compares arrow-binding.ts against where real Excalidraw puts a bound arrow's endpoint, within a stated tolerance
- [ ] #4 A browser-driven check compares measure-text.ts against what the real page measures
- [ ] #5 Upgrading excalidraw names the checks to run, so drift is found at the upgrade rather than later
<!-- AC:END -->
