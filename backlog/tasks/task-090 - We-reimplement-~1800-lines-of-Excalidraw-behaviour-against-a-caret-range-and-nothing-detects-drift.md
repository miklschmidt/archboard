---
id: TASK-090
title: >-
  We reimplement ~1800 lines of Excalidraw behaviour against a caret range, and
  nothing detects drift
status: To Do
assignee: []
created_date: '2026-08-21 13:36'
updated_date: '2026-08-21 13:46'
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
Raised by the user on seeing that TASK-088 ported Excalidraw's binding math rather than calling it. Investigated properly afterwards; the first answer given was too strong and is corrected here.

## What is and is not reachable

**No sibling package.** `@excalidraw/excalidraw` 0.18.0 ships no `@excalidraw/element` or `@excalidraw/math` alongside it. Only `laser-pointer`, `markdown-to-text`, `mermaid-to-excalidraw` and `random-username`.

**The package cannot be imported as published** — `import('@excalidraw/excalidraw')` throws `ReferenceError: window is not defined` at load. But that is a module-scope side effect computing platform flags from `navigator.platform`, not something the geometry needs: **with a fifteen-line globals shim the chunk does load under bun**, far enough to execute unrelated exports. So 'it is browser-only, end of story' was wrong.

**The functions still are not reachable.** `determineFocusPoint` and `updateBoundPoint` are bundled internals — `var`s inside `chunk-3KPV5WBD.js`, absent from every chunk's `export {}` block. This is not a public-API quibble; there is no export to import, shim or not.

## Vendoring is available, and is better than what we did

**The package ships its full TypeScript source in source maps.** 443 of 444 sources are embedded verbatim across ten `.map` files in `dist/dev`, including `element/binding.ts` (67 KB) and `element/collision.ts` (8.5 KB). They can be extracted mechanically.

The two functions are 256 lines of real source (121 + 135). `updateBoundPoint` reaches about twenty helpers, the ones that matter being `intersectElementWithLineSegment` from `collision.ts` and point and vector helpers from `@excalidraw/math`.

**That intersection function is precisely what our port approximated.** `src/core/arrow-binding.ts` records the compromise in its header: Excalidraw expands a shape's outline corner by corner, pushing each rounded corner's bezier out along its diagonal; ours expands analytically and treats a rounded corner as square, differing within a corner radius by up to the gap. Vendoring the real `collision.ts` removes that approximation rather than documenting it.

Vendoring also makes an upgrade diffable: re-extract from the new version's maps and read what changed, instead of re-deriving behaviour from a minified bundle.

## What still has to happen either way

Four modules, about 1800 lines, encode behaviour we do not own:

| Module | Lines | Reimplements |
|---|---|---|
| `src/core/font-layout.ts` | 548 | GSUB/GPOS shaping, to reproduce what Chrome measures |
| `src/core/expand-elements.ts` | 746 | Element defaults and the shape of a converted element |
| `src/core/arrow-binding.ts` | 306 | `determineFocusPoint` and `updateBoundPoint` |
| `src/core/measure-text.ts` | 203 | Excalidraw's text width and height |

`package.json` pinned `@excalidraw/excalidraw` exactly in 3341f3e, so a version no longer changes underneath us. What is still missing is anything that notices when we upgrade deliberately and the behaviour has moved — every check in the suite compares us against ourselves.

**The detector already exists.** `check-fixed-point` drives real Excalidraw in a real browser. It can be asked where a bound arrow's endpoint actually lands and what a string actually measures, and compared against our modules. That is a differential test against the real thing rather than a fixture we wrote, and it is the only kind that can fail when Excalidraw moves.

Same shape as TASK-087, which is the Obsidian plugin version of this.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Whether to vendor the extracted source for arrow-binding or keep the port is decided and recorded, with the 4px approximation named as what vendoring would remove
- [ ] #2 Which Excalidraw behaviours archboard reimplements is listed, each saying which module and where it was read from
- [ ] #3 A browser-driven check compares arrow-binding.ts against where real Excalidraw puts a bound arrow's endpoint, within a stated tolerance
- [ ] #4 A browser-driven check compares measure-text.ts against what the real page measures
- [ ] #5 Upgrading excalidraw names the checks to run and, if vendored source is used, how to re-extract it
<!-- AC:END -->
