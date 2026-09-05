---
id: TASK-150.02
title: Build the fresh shadcn and Tailwind foundation
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-05 00:08'
updated_date: '2026-09-05 14:27'
labels: []
dependencies:
  - TASK-150.01
references:
  - TASK-150
  - 'https://ui.shadcn.com/docs/cli'
  - 'https://ui.shadcn.com/docs/components-json'
parent_task_id: TASK-150
priority: high
type: task
ordinal: 292000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The application currently has parallel component and styling systems, so maintainers and agents cannot treat shadcn and Tailwind as the actual UI foundation. This milestone establishes one official shared component owner only after strict lint is complete. coordinator owns the visual and component specification.  Do not start an independent reviewer loop until every TASK-150 implementation child reports complete.

User-approved shadcn policy: shared official shadcn component source retains strict compiler checks, type-aware safety, React correctness and accessibility lint. It is exempt from Archboard-authored code-style, module-layout and file-length rules. This is not an all-lint ignore. Archboard-authored feature compositions, adapters, generators and tests receive the full applicable ruleset. Do not place product-specific behavior in the exempt component source to evade rules.

User-approved shadcn customization boundary: allow theme changes, Tailwind classes, size and color variants, Remix imports and import-path adjustments. Preserve official markup, focus handling, keyboard behavior and state mechanics. Product-specific behavior belongs in Archboard feature modules.

User-approved visual priority: preserve the operator reference composition, fonts and color roles, while starting from shadcn control styling. Make targeted density, sizing and usability adjustments. Do not recreate the deleted guide's detailed control geometry or legacy token/utility restriction system through Tailwind overrides.

The application shell is desktop-only, with 1920×1080 as its explicit design and rendered-acceptance target. Mobile/phone layouts, mobile navigation, mobile breakpoints and mobile test gates are out of scope. Do not introduce them during this rework.

Build a new application entry and desktop frame after TASK-150.01 fully passes. Use approved preset b3QvqlIdU and small typed presentation inputs/action callbacks grounded in actual product contracts; archived UI logic is ported only in TASK-150.07 after TASK-150.05. No legacy application CSS, presentation components or archived imports may enter the new tree. Official Excalidraw may be mounted through its vendor interface; Archboard's archived session/synchronization implementation waits for TASK-150.07. This is not an in-place restyling of the retired shell.

Browser-test execution is deferred to TASK-150.06 after all rebuild tasks report ready. Do not run browser suites, individual browser tests, browser smoke tests or aggregate commands that invoke them in this task. Continue strict lint/type checks and appropriate non-browser checks. Existing browser tests must not dictate the new UI. Any proposed browser-test replacement, behavioral/interaction rewrite, deletion or transfer to another test owner requires prior case-by-case approval by the implementation coordinator, with the protected product contract and replacement evidence recorded. This is not a worker self-approval or an interim independent review.

Retain assistant-ui as the explicit foundation for the new workbench. Use fresh official assistant-ui chat component source and primitives, its Base UI registry flavor, the approved shadcn theme and shared controls, rather than porting Archboard's old workbench JSX or rebuilding available chat components. Configure the style-aware @assistant-ui registry https://r.assistant-ui.com/styles/{style}/{name}.json with base-nova; verify source compatibility with the pinned @assistant-ui/react version and keep reproducible source provenance. Use shared shadcn dependencies and Remix icons without installing a parallel application control/theme system. Install only chat components needed by actual workflows.
Audit the assistant-ui-specific import policy and copied-source rules against this chosen architecture. Authorize only needed component owners/imports; preserve type-aware safety and avoid blanket source exemptions. Verify the generator/runtime compatibility without porting archived runtime code before TASK-150.07.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Official pinned shadcn Base UI source for only the needed components lives at the root of src/ui/components, with identifiable registry version or digest, public component entrypoints and no dependency back into shell or workbench modules.
- [ ] #2 Registry aliases, TypeScript, Vite and boundary rules agree on the shared component owner, and narrow enforcement permits it without weakening general import or module-boundary rules.
- [ ] #3 app.css is a coherent Tailwind and shadcn theme entry with approved light/dark variables, font loading, minimal base rules and reduced-motion support; normal Tailwind utilities remain available without recreating the legacy semantic-utility system.
- [ ] #4 A component generated by the pinned CLI uses Remix Icon and intended aliases while retaining official compound APIs, semantics, data attributes, accessibility and shadcn conventions.
- [ ] #5 The fresh entry, official shared controls, vendor Excalidraw mount and both themes are implemented without legacy CSS or presentation imports. Presentation uses typed inputs/callbacks grounded in actual product contracts; archived Archboard UI logic is not ported yet. Strict and applicable build/non-browser checks pass. Product integration belongs to TASK-150.07 and browser verification to TASK-150.06.
- [ ] #6 The style-aware assistant-ui registry resolves the Base UI variant for the approved preset, uses the shared shadcn controls/theme and intended icon configuration, and has verified compatibility with pinned dependencies. Obsolete headless-only restrictions are identified for scoped replacement, without introducing broad lint exemptions.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Takeover plan 2026-09-05 (Claude orchestrating):
1. Component owner: src/ui/components is the shared module. components.json aliases ui/components/lib/hooks -> @/ui/components, css -> src/ui/theme/app.css, style base-nova, iconLibrary remixicon. The registry's class merger is the pinned npm package 'cn' (0.2.5), so no local utils file exists (the CLI's generated utils.ts was removed).
2. Preset b3QvqlIdU applied with the pinned CLI (shadcn 4.21.0 after the CLI's own bump; recorded). Reference adaptations in app.css: cobalt #155eef primary/ring/sidebar-primary, lime status tokens (--status, --status-foreground, --status-subtle exposed as color-status*), chalk/pale-stone light surfaces, charcoal/black dark surfaces, radius 0.45rem, bundled Onest/DM Mono @font-face (Manrope removed), font-synthesis none, data-theme dark custom variant, color-scheme, reduced-motion rule, Excalidraw vendor CSS imported unlayered.
3. Pull only needed base-nova items with 'shadcn add': button, badge, separator, tooltip, dialog, alert-dialog, alert, input, textarea, field, label, select, combobox, input-group, checkbox, radio-group, collapsible, tabs, toggle-group, dropdown-menu, sidebar (+sheet, skeleton, use-mobile). Convert their lucide imports to @remixicon/react equivalents; keep markup/focus/keyboard/state mechanics.
4. UI lint: add an override in src/ui/.oxlintrc.jsonc listing the exact generated files, turning off only authored-style/layout/length rules (jsdoc*, jsdoc-extra/*, complexity, max-lines, archboard/no-anonymous-jsx-handlers, archboard/absolute-imports where the CLI writes package-relative forms) while keeping correctness/suspicious/perf, typescript type-aware, react, jsx-a11y and import rules. Classify every remaining diagnostic individually; statement-level suppressions only with a reason.
5. Fresh entry: frontend/index.html + frontend/main.tsx mount src/ui/application (Application) with StrictMode; window.name stays 'archboard' (library site return contract). src/ui/shell composes header (wordmark mask, board identity, connection/claim state, theme toggle), Sidebar navigator, canvas stage with vendor Excalidraw mount (src/ui/canvas/CanvasStage), optional inspector, collapsible workbench dock. Typed view inputs and callbacks only; example data lives in one clearly named presentation-example module and no fake backend.
6. Gates: bun run lint (both stages), bun run type-check, bun run build. No browser tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Browser-generated preset candidate (2026-09-05): https://ui.shadcn.com/create?preset=b3QvqlIdU. Base UI / Nova; Neutral base; Blue theme; Lime chart palette (user selected); Small radius (0.45rem); Default / Solid menus; Subtle menu accent; Remix Icon. Manrope body and heading are preview substitutes because the builder does not offer Onest or DM Mono; retain the approved bundled Onest and DM Mono in implementation. Compared Nova, Mira and Lyra previews; Nova is the proposed starting point. Builder command: bunx --bun shadcn@latest apply --preset b3QvqlIdU. Capture and use a compatible pinned CLI at implementation time, preserving existing project ownership and font assets. This is planning evidence only; no preset applied or UI migration started. Lime charts do not add chart features to scope. Keep live-status color semantic in the coherent theme; chart variables are for data series. Other theme refinements, including cobalt focus indication and touch sizing, remain part of the approved reference adaptation.

User approved preset b3QvqlIdU. The earlier candidate note is now approved; overall planning remains open.
<!-- SECTION:NOTES:END -->
