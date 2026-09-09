---
id: TASK-165
title: Clean up frontend concern placement and React ownership
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-09 12:50'
updated_date: '2026-09-09 13:59'
labels: []
dependencies:
  - TASK-164
references:
  - docs/agents/frontend.md
  - docs/agents/boundaries.md
  - TASK-149
type: enhancement
ordinal: 316000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The agreed frontend rules preserve Archboard module boundaries but existing UI mixes components and hooks in lib, uses inconsistent component names, and concentrates workflow ownership in application composition. This dedicated cleanup makes workflows easier for maintainers and agents to locate and change. Scope is all authored src/ui implementation; host files stay thin. Preserve documented generated/vendor exceptions and the current UI behavior. Coordinate with active shell work TASK-149; its remaining visual/voice acceptance is not owned here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Authored frontend modules follow docs/agents/frontend.md naming and concern placement, with intentional public entrypoints and existing test owners preserved.
- [x] #2 Application and shell compose domain owners; local state and subscriptions stay with consumers, with unnecessary mirrored state and relay-only controllers removed.
- [ ] #3 Lint enforces agreed mechanically checkable conventions without relaxing existing lint/type rules or introducing file-content or tooling-policy tests.
- [x] #4 Existing desktop, split-pane, canvas edit, library, workbench and voice behavior is preserved; relevant runtime owners and bun run check pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Survey every authored src/ui module and classify each file by concern (React component, React hook, type-only declaration, non-React helper), keeping documented vendor exceptions (shadcn src/ui/components, assistant-ui src/ui/workbench-thread, LiveKit src/ui/voice-wave) untouched.
2. Move React components out of lib/ into a private components/ folder per module and rename component files to PascalCase, including module-root component entrypoints (CanvasPane, ExcalidrawStage, Inspector, PreviewCard, ActionableAlert, WorkbenchHeaderControls, WorkbenchRuntimeProvider, ReadonlyWorkbenchThreadProvider); index.tsx entrypoints keep their conventional name.
3. Move React hooks into a private hooks/ folder with use-kebab-case names (application, board-library, voice-wave), and give module-root public hooks a use- name where they lack one.
4. Move type-only private declaration files into a private types/ folder; leave files that carry runtime values in lib/.
5. Make public entrypoints intentional: extract the generic dialog primitives that agent-settings and opener-settings reach for into a peer src/ui/dialog-parts module so board-dialogs stops re-exporting them, and stop src/ui/workbench/index.tsx from re-exporting the separate contracts entrypoint.
6. Review React ownership in application and shell composition: keep leaf state and subscriptions with their consumers, and remove any mirrored state or relay-only controller found; do not lift or invent controllers.
7. Add one Oxlint rule to tools/oxlint-plugin-archboard that enforces the mechanically checkable conventions for authored src/ui files (allowed concern folder names, PascalCase components, use- prefixed kebab-case hooks, kebab-case non-React files, no JSX outside components/root entrypoints, no hook exports outside hooks/root), turned off only for the exact vendor files already listed in the approved .oxlintrc.jsonc override. No lint or type rule is relaxed and no file-content or tooling-policy test is added.
8. Validate: focused oxlint and both tsconfig type checks, the src/ui module test owners, then the full bun run check gate; fix failures inside this scope.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation (2026-09-09):

Concern placement and naming across authored src/ui, with the documented shadcn (src/ui/components), assistant-ui (src/ui/workbench-thread) and LiveKit (src/ui/voice-wave wave renderer and shader host) files untouched:
- React components moved out of every module's lib/ into a private components/ folder and renamed to PascalCase: agent-settings (5), application (6), board-dialogs (5), opener-settings (4), shell (13), workbench (11), workbench-runtime (2).
- React hooks moved into a private hooks/ folder with use- kebab-case names: application (11), board-library, shell (roving-list -> use-roving-list), voice-wave (2, splitting the reduced-motion hook out of lib/environment.ts), workbench-runtime (useWorkbenchRuntime split out of the provider file).
- Type-only private declaration files moved into a private types/ folder: agent-settings, board-dialogs, opener-settings, shell, codex-realtime, workbench-board-status, workbench-composer, workbench-timeline, plus new application and workbench-runtime type files for the shapes their split files share.
- Module-root component entrypoints renamed to PascalCase: CanvasPane, ExcalidrawStage, PreviewCard, Inspector, WorkbenchHeaderControls. canvas/pane-contact.ts became use-pane-contact.ts so a public hook entrypoint reads as one.
- Files holding several unrelated components were split so each names its own component (section parts, opener selection fields and test section, the workbench frame's three slots, the shell presentation bar and recovery message).
- The application's React context moved to a state/ concern.

Public entrypoints:
- New peer module src/ui/dialog-parts owns the DialogError shape and the generic dialog presentation shared by board-dialogs, opener-settings, agent-settings, application, opener-settings-flow and workbench-thread-link. board-dialogs no longer re-exports them, so its entrypoint is its own dialogs again.
- src/ui/workbench/index.tsx no longer re-exports the separate contracts entrypoint; callers import the view/action types from @/ui/workbench/contracts.
- Removed src/ui/board-dialogs/actionable-alert.tsx: an unreferenced public entrypoint duplicating the shell's Notices, which already carries the persistent-actionable-feedback rule.

React ownership: leaf state and subscriptions were already with their consumers (form drafts seeded once from their reply, per-consumer voice and transport subscriptions, the pane core writing through React setters); no controller parent was introduced and no state lifted. One mirrored derivation removed: the application trimmed the active pane's doing lines and ActivityList trimmed them again, so the list now owns how much it shows and the shell entrypoint no longer exports recentDoing.

Lint: new archboard/ui-concern-placement rule in tools/oxlint-plugin-archboard enforces the allowed concern folder names, PascalCase component files, use- prefixed kebab-case hook files, scoped kebab-case elsewhere, and React markup and hook exports only in components/, hooks/ or a module-root entrypoint. It is enabled in .oxlintrc.jsonc and turned off only for the exact vendor file list already approved there. No existing lint or type rule was relaxed; no file-content, lint-policy or tooling test was added.

Two further entrypoint cleanups after the first review pass:
- src/ui/canvas/excalidraw-stage.tsx is a component only CanvasPane mounts, so it is now src/ui/canvas/components/ExcalidrawStage.tsx; CanvasPane stays the module's public component.
- Removed src/ui/voice-output-level/use-voice-output-level.ts: an unreferenced public hook superseded by voice-session's useVoiceLevel, which reads the adapter's own level subscription.

Left as they are on purpose: the module-root contract.ts/contracts.ts entrypoints (voice-context, voice-session, voice-spoken-approval, voice-transcript, workbench-transport) have no caller outside their module today, but the same convention is public in workbench, workbench-queue, workbench-approvals, workbench-thread-link and voice-controls, so making some private would make the convention less predictable, not more. src/ui/types keeps its name: renaming it would touch about fifty files for no rule this cleanup enforces.

Verification (2026-09-09):
- Full `bun run check` on 6871f21b (cleanup 7c1ed1d5 plus the cherry-picked Linux process-observation fix) exited 0. Lanes: lint:baseline and lint:policy clean; fmt:check over 1794 files; both TypeScript projects clean; build:frontend ok; test:modules 2671 pass / 0 fail; test:system 306 pass / 0 fail; test:repository 8 pass / 0 fail; test:serial-browser all 21 normal owners pass / 0 fail, ending with codex-live-voice. The browser lane covers the desktop shell layout, board navigator and drill-down, fullscreen presentation, split-pane hold and claim behaviour, canvas edit and undo/redo, typed text, opener settings, the Codex text workbench and controlled live voice, which is the behaviour this cleanup had to preserve.
- Before that run the same tree reproduced a pre-existing Linux failure that was not this task's: parseLinuxProcessStat in src/shared/process-observation/lib/linux-stat.ts refused every record whose pgrp is 0, so listLinuxProcesses threw on kernel thread pid 2 and 36 module owners failed. Reported with the exact reproduction; the maintainer fixed it as TASK-168 (9e0d53ac) and I cherry-picked it rather than touching backend code from this task.
- The lint rule was proved to fire, not merely to be registered: temporary probe files earned every message once (unknown concern folder, kebab component file, kebab module-root component file, JSX in lib, hook exported from lib, use- prefixed file in lib), and the vendor files earned none. The probes were removed.

Follow-up commit 44f92f77: docs/agents/frontend.md also asks for named React imports including types, and authored UI source still reached the React namespace for React.JSX.Element, React.ReactNode, React.ComponentProps and the event, ref and style types. All 71 authored files now import those types by name from "react"; the shadcn, assistant-ui and LiveKit vendor files keep their namespace imports. archboard/named-react-imports enforces it over authored src/ui source including tests, off only for the same approved vendor list. Verified with lint, fmt:check, both type-check projects, build:frontend, src/ui module owners (904 pass) and test:repository (8 pass); the browser and system lanes were left to their current owner.

Rule enforcement gaps (2026-09-09, found by independent standards review, fixed before closure):

Reproduced first, with disposable probes under src/ui/path-focus that were removed afterwards. Both escaped silently while the lint run itself was working, which the probe run confirmed by reporting an unrelated jsdoc(require-returns) on the same file:
1. archboard/named-react-imports matched the literal identifier React, so `import * as Reakt from "react"` and `import Reakt from "react"` bound the whole namespace under another name and evaded it.
2. archboard/ui-concern-placement inspected ExportSpecifier only, so `export function useValue()` and `export const useOther = () => ...` declared and exported in place inside lib/ escaped, while the same hook re-exported through an export clause was caught.

Fixes: named-react-imports now prohibits the import binding itself, reporting every ImportDefaultSpecifier and ImportNamespaceSpecifier on a react import whatever its local name, with a second message naming that cause; the ambient-namespace check stays for source that uses React.* with no import at all, and no longer double-reports an import's own local name. ui-concern-placement now also visits ExportNamedDeclaration and reads the names an exported function, class or variable declaration binds, so an inline hook export is caught wherever it is written.

Proof after the fix, one probe per case, all removed afterwards:
- `import * as Reakt from "react"` -> reported; `import Reakt from "react"` -> reported; ambient `React.JSX.Element` with no import -> still reported; `import { useState, type JSX } from "react"` -> silent.
- `export function useInline` and `export const useVariable` in lib/ -> both reported; the same hook in hooks/ -> silent; `export function usable` and `export type useLike` in lib/ -> silent.
- Every file of src/ui/components, src/ui/workbench-thread and src/ui/voice-wave -> silent, so the exact vendor exceptions are retained.

Revalidated: bun run lint both lanes, bun run fmt:check 1794 files, bun run type-check both projects, bun run build:frontend, bun test --isolate src/ui 904 pass / 0 fail, bun run test:repository 8 pass / 0 fail. No lint or type rule was relaxed and no repository-policy, lint or tooling test was added.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Applied docs/agents/frontend.md to the existing authored src/ui tree. Every module now keeps React components in a private components/ folder named in PascalCase after the component, React hooks in a private hooks/ folder named use-kebab-case, type-only declarations in a private types/ folder, and non-React helpers in lib/; module-root files stay the public interface, with PascalCase component entrypoints and canvas/use-pane-contact.ts reading as the hook it is. Files holding several unrelated components were split so each names its own. A new peer module src/ui/dialog-parts owns the DialogError shape and the generic dialog presentation that board-dialogs was re-exporting to six other modules, src/ui/workbench/index.tsx no longer re-exports the separate contracts entrypoint, and two unreferenced public entrypoints were removed. Leaf state and subscriptions stayed with their consumers and no controller was introduced; one mirrored derivation was removed, where the application and ActivityList both trimmed the pane's doing lines. A second pass replaced every React namespace type use in authored UI source with named imports from react. Two Oxlint rules, archboard/ui-concern-placement and archboard/named-react-imports, keep both conventions, off only for the exact shadcn, assistant-ui and LiveKit files already listed in .oxlintrc.jsonc; no existing lint or type rule was relaxed and no file-content, lint-policy or tooling test was added.

Verified by a full bun run check on the cleanup commit (exit 0): lint both lanes, fmt:check, both TypeScript projects, build:frontend, test:modules 2671/0, test:system 306/0, test:repository 8/0, and all 21 normal browser owners passing, which is where the desktop, split-pane, canvas edit, library, workbench and voice behaviour is exercised. The named-import follow-up was verified with lint, fmt:check, both type-check projects, build:frontend, the 904 src/ui module owners and test:repository, leaving the browser and system lanes to their current owner. Commits: 7c1ed1d5 (cleanup) and 44f92f77 (named React imports); 6871f21b is the cherry-picked TASK-168 fix for a pre-existing Linux failure found while verifying.
<!-- SECTION:FINAL_SUMMARY:END -->
