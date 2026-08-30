---
id: TASK-144
title: Adopt Tailwind 4 and shadcn/Base UI as the Archboard UI foundation
status: To Do
assignee: []
created_date: '2026-08-30 14:32'
updated_date: '2026-08-30 14:32'
labels: []
dependencies:
  - TASK-140.01
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
  - docs/agents/boundaries.md
priority: high
type: enhancement
ordinal: 170000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Introduce the Tailwind 4 and shadcn/Base UI development foundation decided during the Codex workbench design without rewriting or retroactively expanding the already-running TASK-140 plan. The task leaves the implemented operator shell behavior intact, maps its approved aesthetics into one semantic utility system, adds reviewed interaction primitives, configures deterministic class sorting and strict drift rules, and records the visual contract future UI workers must follow. It supplies styling and interaction mechanics to TASK-143.03; it does not supply agent state, transport, conversation runtime, or visual direction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Exact mutually compatible tailwindcss 4, @tailwindcss/vite, shadcn CLI, @base-ui/react, and only the helper dependencies required by reviewed copied source are pinned in package.json and bun.lock. Vite loads one Tailwind plugin instance and the browser imports one canonical Archboard application stylesheet.
- [ ] #2 Tailwind is introduced additively over the implemented operator shell. Excalidraw vendor CSS remains separate, the current reset remains authoritative, and Preflight is excluded unless before-and-after real-browser evidence proves every existing shell and canvas control. Migrated declarations are removed rather than retained as a competing style path.
- [ ] #3 components.json explicitly selects a Base UI base-* style, React Server Components false, CSS variables true, the canonical Tailwind 4 stylesheet, deliberate aliases that resolve identically in Vite and every TypeScript config, and the existing Archboard icon strategy. It cannot generate a generic components/ui bucket or install unreviewed registry blocks.
- [ ] #4 One canonical semantic token map derives from the approved operator mockup and owns light and dark paper, surfaces, text, rules, cobalt selection, acid-lime status, danger, typography roles, spacing, radii, focus, motion, and shadow. Tailwind exposes semantic utilities from that map; feature code and copied components do not use default palette classes or duplicate theme constants.
- [ ] #5 The first adoption slice copies and reduces only the Base UI behaviors needed by one existing operator-shell interaction and the Codex workbench. Copied source lives behind named Archboard UI module roots, removes unused variants and dependencies, preserves keyboard, focus, dismissal, labelling, and disabled behavior, and never owns application state.
- [ ] #6 Class composition uses complete static class names or exhaustive typed variant maps. Oxfmt Tailwind sorting points at the canonical v4 stylesheet and covers className plus each approved cn, clsx, cva, and twMerge call shape with stable fixtures in bun run fmt and bun run fmt:check.
- [ ] #7 Oxlint or a focused repository-policy test rejects dynamic Tailwind interpolation and concatenation, unapproved palette utilities and arbitrary color literals, duplicate Tailwind entrypoints, forbidden generic component directories, and copied source that bypasses named module roots. The new checks are strict and do not weaken any existing lint, format, type, test, or browser gate.
- [ ] #8 A tracked Archboard UI aesthetic guide identifies the approved operator mockup as visual authority, defines canvas-first proportions, grid, typography, rules, radii, accents, motion, and forbidden generic chat or dashboard treatments, distinguishes illustrative mock data from product state, and is linked from AGENTS.md and the instructions future UI workers must follow.
- [ ] #9 A deterministic dependency and production module-graph check records the actual Base UI and helper cost and rejects unused Lucide, animation, registry, Radix, or duplicate design-system dependencies. shadcn remains a development source-delivery tool, never a browser runtime or application state owner.
- [ ] #10 bun run check enforces dependency pins, Tailwind compilation, sorting fixtures, strict lint and repository policy, frontend and root types, production build, and real-browser regression of the migrated shell interaction plus both themes, desktop and 420 pixels, focus return, and unchanged Excalidraw controls. Rendered evidence is inspected against the approved reference before acceptance.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the merged TASK-140 shell and its actual CSS, component, reset, Vite, TypeScript, and browser-test boundaries before choosing any migration seam.
2. Pin Tailwind 4, its Vite plugin, shadcn, Base UI, and only helper dependencies required by the reviewed source; record the dependency graph.
3. Add one Tailwind Vite integration and canonical stylesheet without enabling Preflight or moving Excalidraw CSS.
4. Configure components.json for Base UI, CSS variables, repository-valid aliases, and Archboard icons.
5. Map the implemented operator-shell tokens and approved mockup into one namespaced semantic token source and Tailwind theme aliases.
6. Copy and reduce the smallest Base UI interaction source required by a real existing shell interaction, expose it through a named module, and verify focus, keyboard, dismissal, and disabled behavior.
7. Configure Oxfmt Tailwind sorting for every approved class composition form and add formatter fixtures.
8. Add strict Oxlint or repository-policy guards for dynamic classes, palette drift, arbitrary colors, duplicate entrypoints, generic component buckets, and boundary bypass.
9. Write and link the Archboard aesthetic guide for future UI workers, including the reference authority and forbidden treatments.
10. Migrate only the proof interaction and the shared primitives needed by TASK-143.03, deleting replaced CSS rather than attempting a speculative whole-shell rewrite.
11. Inspect production CSS and JavaScript graphs, remove unused dependencies, and run the full type, lint, format, build, repository, and real-browser checks at both required viewports and themes.
<!-- SECTION:PLAN:END -->
