# Workbench thread: the conversation as a person reads it

`Conversation.tsx` renders the agent's turns over the
assistant-ui runtime that `packages/workbench/src/ui/components/runtime` provides: each prompt,
the work between prompts as rows that open to their evidence, the plan's
progress, approvals and how the turn ended. A turn of the voice coordinator
stands among the workhorse's turns with its own head and rule, and a workhorse
turn that the coordinator delegated says so. The `thread/` and `runtime/` folders
below each role folder of `packages/workbench/src/ui` are the only owners of
`@assistant-ui/react` imports (named, from the package root); the `thread/`
folders are the only owner of `@assistant-ui/react-markdown`. The lint rule `archboard/assistant-ui-imports`
enforces both.

The agent's answer is markdown, drawn by the official assistant-ui
`base-nova` `markdown-text` registry item and the two items it depends on,
placed here on 2026-09-05. The registry's `thread`,
`reasoning`, `tool-fallback` and `tool-group` items were placed then too and
removed when the conversation got its own rows (TASK-302.04).

## Dependencies

- `@assistant-ui/react` 0.15.17 (already pinned).
- `@assistant-ui/react-markdown` 0.14.14, added with `bun add --exact`; its peer
  range is `@assistant-ui/react ^0.15.0`.
- `remark-gfm` 4.0.1, added with `bun add --exact`.

Not added, although the registry items name it: `lucide-react` (icons are
Remix, per repository policy).

## Why the files were placed by hand

`node_modules/.bin/shadcn add https://r.assistant-ui.com/styles/base-nova/thread.json -y -p src/ui/workbench-thread --dry-run`
(run when the module was `src/ui/workbench-thread`) reported that the CLI would overwrite six shared components in
`src/ui/components` (button, skeleton, tooltip, collapsible, textarea, dialog),
create `avatar`, `use-attachment-src` and `use-copy-to-clipboard` there,
edit `apps/web/src/ui/theme/app.css`, and add `lucide-react`, `tw-shimmer` and `zustand`.
Each of those touches a module or dependency this task does not own, so the
CLI was not run to apply. The files below were written from the same registry
payloads the CLI resolves (fetched with `curl` from the URLs listed), byte for
byte before the rewrites recorded here, then formatted by `bun run fmt`.

## Registry digests

SHA-256 (first 16 hex) of each item's file content as served at fetch time.

| Item                    | Registry URL                                                           | Served path                                                | Content digest     | Local file                                    |
| ----------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------ | --------------------------------------------- |
| `markdown-text`         | `https://r.assistant-ui.com/styles/base-nova/markdown-text.json`       | `components/assistant-ui/elements/markdown-text.tsx`       | `4621787f69160d9f` | `markdown-text.tsx`                           |
| `tooltip-icon-button`   | `https://r.assistant-ui.com/styles/base-nova/tooltip-icon-button.json` | `components/assistant-ui/elements/tooltip-icon-button.tsx` | `98580531a6f5a213` | `tooltip-icon-button.tsx`                     |
| `use-copy-to-clipboard` | `https://r.assistant-ui.com/base/use-copy-to-clipboard.json`           | `hooks/use-copy-to-clipboard.ts`                           | `2deb9436899718f7` | `../../hooks/thread/use-copy-to-clipboard.ts` |

Fetched and not placed (their workflows are not product workflows):
`attachment` (`fa1bf7d0ef55cc5c`), `file` (`e776f037ddedf6ae`), `image`
(`b80972acda7d89b2`), `follow-up-suggestions` (`ba2f213a1241f281`).

## Mechanical rewrites (every file)

- `"use client"` directives dropped (Vite, no RSC).
- `@/components/ui/<name>` → `@archboard/ui-kit/components`, through the
  composite that holds the part (`TooltipContent` → `Tooltip.Content`);
  `@/components/assistant-ui/elements/<name>[.aui]` →
  `#ui/components/thread/<name>.tsx`; `@/hooks/use-copy-to-clipboard`
  → `#ui/hooks/thread/use-copy-to-clipboard.ts`; `@/lib/utils` → `cn`.
- `lucide-react` icons → `@remixicon/react`: ArrowDown→RiArrowDownLine,
  ArrowUp→RiArrowUpLine, Check→RiCheckLine, ChevronLeft→RiArrowLeftSLine,
  ChevronRight→RiArrowRightSLine, ChevronDown→RiArrowDownSLine,
  Copy→RiFileCopyLine, Download→RiDownloadLine, MoreHorizontal→RiMoreLine,
  Pencil→RiPencilLine, RefreshCw→RiRefreshLine, Square→RiStopFill,
  Loader→RiLoader4Line, AlertCircle→RiErrorWarningLine,
  XCircle→RiCloseCircleLine, Brain→RiBrainLine.

Every `@assistant-ui/react` member the placed files import was checked
against the pinned 0.15.17 package.

## Deviations by file

`markdown-text.tsx`

- The `@assistant-ui/react-markdown/styles/dot.css` side-effect import is
  dropped: package subpath imports are outside the lint contract, and the
  theme stylesheet belongs to another module. The deferred-render dot cursor
  is therefore unstyled.
- `useShallowStable` keeps its comparison but stores the stable value in
  `useState` (derived state) instead of reading a ref during render
  (`react/refs`).
- Heading and anchor components destructure `children` explicitly so the
  accessibility rules can see the content they render.

`use-copy-to-clipboard.ts`

- The always-present `navigator.clipboard` guard is dropped and the promise
  callbacks return explicitly.

## Lint policy

These files are on the exact-file override at the end of
`.oxlintrc.jsonc`: compiler, type-aware safety, React correctness and
accessibility checks stay on; authored-code style, JSDoc, react-perf, module
layout and file length are off.
