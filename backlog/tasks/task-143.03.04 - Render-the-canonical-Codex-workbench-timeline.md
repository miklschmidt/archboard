---
id: TASK-143.03.04
title: Render the canonical Codex workbench timeline
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-03 18:31'
labels: []
dependencies:
  - TASK-143.03.02
  - TASK-144.14
  - TASK-143.08.05
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-timeline
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Render the complete decoded Codex 0.151.0 ThreadItem union as bounded, escaped, accessible timeline content. This leaf alone may directly import the reviewed assistant-ui message primitives; it copies no Elements. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The module's only assistant-ui imports are named root ThreadPrimitive, MessagePrimitive, and MessagePartPrimitive; every rendered item, fallback, disclosure, class, and semantic state is Archboard-owned.
- [ ] #2 User/assistant/reasoning/plan/command/file/MCP/web/image/tool/approval/error/interruption items render by stable thread/turn/item identity with bounded expandable raw details and no copied Elements.
- [ ] #3 The timeline is a named focusable role=log with aria-relevant additions and aria-busy only while streaming; token deltas do not cause repeated live announcements or steal focus.
- [ ] #4 Unknown item variants, malformed markdown/media, long output, streaming completion, delayed arrival, and prior-epoch history have safe deterministic renderers and module tests.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define the workbench-timeline public contract and one Archboard-owned normalization boundary for authoritative thread, turn, and item identities, canonical item variants, malformed values, bounded text, safe URLs, and escaped expandable JSON details.
2. Compose only ThreadPrimitive, MessagePrimitive, and MessagePartPrimitive from the assistant-ui root. Keep every renderer, fallback, disclosure, semantic state, and static Tailwind class in src/ui/workbench-timeline, with a focusable named role=log that announces additions and marks only active streaming as busy.
3. Add focused module tests through the public entrypoint for all recovered item families, stable identity and order, streaming completion and delayed history, prior-epoch presentation, malformed markdown and media, unknown variants, long-output bounds, focus and live-region semantics, and primitive import ownership.
4. Render the component through the real workbench runtime provider in the supported desktop composition, inspect keyboard focus and light and dark output, then run only the focused module and policy tests plus exact type, lint, format, frontend build, and diff checks requested for this leaf.

5. Add one provider-backed public-component render owner for the log semantics, keyboard reachability, streaming busy state, terminal and prior-epoch presentation, representative items, hostile media and text, bounded disclosure, and native keyboard disclosure semantics. Run it red before implementation changes.
6. Make item identities injective across literal suffix-like ids and occurrences, make repeated rendered link keys occurrence-aware, and add only the collision regressions.
7. Consolidate the private bounded-details hash, type the canonical status variants with an explicit unknown fallback, compose them through cn, and replace the arbitrary inward outline offset with existing semantic focus utilities.
8. Run only the focused timeline and assistant-ui import-policy owner, typecheck, targeted lint and format, frontend build, and git diff checks; append remediation evidence, keep the task In Progress, and commit separately for rereview.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Started from clean detached canonical base 23cc54fbc3405a7c5b80bb8de796ae2b53bd5e25. Confirmed TASK-143.03.02, TASK-144.14, and TASK-143.08.05 are Done. Normal validation topology is one Archboard server, one package-local bound Codex app-server session, and one human user/editor; no stress, performance, tooling, or competing browser lane will be added.

Implemented src/ui/workbench-timeline as the canonical Codex workbench timeline. The public contract derives thread/turn/item types from the generated Codex app-server contract, normalization covers the complete recovered 19-arm ThreadItem union plus browser approval events, identities are deterministic from authoritative thread/turn/item ids, and malformed or duplicate input gets deterministic bounded fallback identities. Archboard owns all item presentation, disclosure, state, ordering, and accessibility; the only assistant-ui root import is the policy-mandated ThreadPrimitive, MessagePrimitive, and MessagePartPrimitive bridge. Visible text and inert JSON details are bounded, React performs escaping, and media becomes a link only for http/https URLs.

Focused red/green evidence: targeted Oxlint initially rejected a TSX test, a forbidden children prop, and index keys; those were replaced by a pure TypeScript contract test and stable owned list wrappers. Direct browser rendering initially crashed because ThreadPrimitive.Viewport requires the unavailable threads scope under ReadonlyWorkbenchThreadProvider; ThreadPrimitive.ViewportProvider now supplies the message viewport context while Archboard keeps the native focusable role=log. The real provider then rendered successfully in light and dark themes, the named log was keyboard reachable, and the native Raw details disclosure expanded by keyboard. The temporary probe tab, Vite process, and probe files were removed.

Verification: focused timeline plus assistant-ui policy tests: 18 pass, 0 fail, 322 assertions in 6.11 s. bun run type-check passed in 2.57 s. bunx oxlint src/ui/workbench-timeline --deny-warnings passed. bunx oxfmt --check src/ui/workbench-timeline passed on 10 files in 134 ms. bun run build:frontend passed (Vite build 433 ms; existing large-chunk warning remains). git diff --check passed. No broad test, browser, system, stress, or performance lane was run. Task remains In Progress for independent review.

Review remediation started from HEAD 4be1c217b0d1bd2b306c61a512c4b449c27e0b4c on the fixed canonical base. The six findings stay within src/ui/workbench-timeline and its Backlog record. No broad browser, system, repository, stress, or performance lane will be added.

Review remediation implemented. The module test now loads the literal public index.tsx entry with Bun and renders WorkbenchTimeline inside the actual ReadonlyWorkbenchThreadProvider. Compact provider-backed cases own the named focusable log, aria-relevant additions, streaming-only aria-busy, inward semantic focus ring, current/prior history, failed and interrupted terminal states, every recovered item family, an unknown future item and status, escaped hostile text, rejected javascript media, repeated safe links, bounded long output and details, and native details/summary keyboard semantics.

Red/green evidence: the new injectivity regression failed first with four items but only three identities in 164 ms. Item identities now serialize the structured [threadId, turnId, rawItemId, occurrence] tuple, so a literal id such as item-x:duplicate-1 cannot collide with a duplicate occurrence. The first combined rendered run then caught cn/tailwind-merge dropping the custom text-body class when it composed a semantic status color; switching the two composed size/color sites to the repository's existing !text-body convention made the rendered owner green. Repeated URL lists now use occurrence-aware keys. normalize.ts and render-item.tsx share one private stableBoundedKey helper, leaving one FNV implementation. Canonical status tones are an exhaustive Record over the typed BrowserTimeline item-status union with a separate unknown fallback, and all conditional tone composition uses cn. The arbitrary negative outline offset is gone; the log uses the existing semantic inset ring utilities.

Focused verification: timeline plus assistant-ui import policy, 21 pass, 0 fail, 349 assertions in 6.07 s. bun run type-check passed in 2.44 s. Targeted Oxlint passed. Targeted Oxfmt check passed on 11 files in 189 ms. Frontend build passed in 525 ms with the existing large-chunk warning. git diff --check passed. The provider-backed automated render proved the changed visual and semantic points, so no additional browser, system, repository, stress, or performance lane ran. Task remains In Progress for rereview.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:39
---
Course correction, 2026-09-02: this not-yet-started UI leaf is frozen behind TASK-143.08.05 so it cannot build on the rejected protocol and browser contracts.
---
<!-- COMMENTS:END -->
