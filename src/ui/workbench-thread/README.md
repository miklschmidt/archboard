# Workbench thread: official assistant-ui presentation

The assistant-ui `base-nova` registry thread and the items it depends on,
generated on 2026-09-05 from the style-aware registry and placed here as root
files. This module and `src/ui/workbench-runtime` are the only owners of
`@assistant-ui/react` imports (named, from the package root); this module is
the only owner of `@assistant-ui/react-markdown`. The lint rule
`archboard/assistant-ui-imports` enforces both.

Product composition never lives here. `src/ui/workbench` renders `Thread`
inside the runtime provider that `src/ui/workbench-runtime` (TASK-150.07)
owns, and places its own intent controls beside the official composer.

## Dependencies

- `@assistant-ui/react` 0.15.17 (already pinned).
- `@assistant-ui/react-markdown` 0.14.14, added with `bun add --exact`; its peer
  range is `@assistant-ui/react ^0.15.0`.
- `remark-gfm` 4.0.1, added with `bun add --exact`.

Not added, although the registry items name them: `lucide-react` (icons are
Remix, per repository policy), `tw-shimmer` (the `shimmer` class used while a
tool or reasoning group runs is left unregistered rather than editing the
theme stylesheet; it degrades to plain text), `zustand` (transitive of
assistant-ui already), and the `avatar`, `use-attachment-src` and
attachment-related items that the removed attachment workflow needed.

## Why the files were placed by hand

`node_modules/.bin/shadcn add https://r.assistant-ui.com/styles/base-nova/thread.json -y -p src/ui/workbench-thread --dry-run`
reported that the CLI would overwrite six shared components in
`src/ui/components` (button, skeleton, tooltip, collapsible, textarea, dialog),
create `avatar`, `use-attachment-src` and `use-copy-to-clipboard` there,
edit `src/ui/theme/app.css`, and add `lucide-react`, `tw-shimmer` and `zustand`.
Each of those touches a module or dependency this task does not own, so the
CLI was not run to apply. The files below were written from the same registry
payloads the CLI resolves (fetched with `curl` from the URLs listed), byte for
byte before the rewrites recorded here, then formatted by `bun run fmt`.

## Registry digests

SHA-256 (first 16 hex) of each item's file content as served at fetch time.

| Item                    | Registry URL                                                           | Served path                                                | Content digest     | Local file                 |
| ----------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------ | -------------------------- |
| `thread`                | `https://r.assistant-ui.com/styles/base-nova/thread.json`              | `components/assistant-ui/elements/thread.aui.tsx`          | `1aaf40d76106ab11` | `thread.tsx`               |
| `markdown-text`         | `https://r.assistant-ui.com/styles/base-nova/markdown-text.json`       | `components/assistant-ui/elements/markdown-text.tsx`       | `4621787f69160d9f` | `markdown-text.tsx`        |
| `reasoning`             | `https://r.assistant-ui.com/styles/base-nova/reasoning.json`           | `components/assistant-ui/elements/reasoning.aui.tsx`       | `96738041df6542b9` | `reasoning.tsx`            |
| `elements-reasoning`    | `https://r.assistant-ui.com/base/elements-reasoning.json`              | `components/assistant-ui/elements/reasoning.tsx`           | `a9ff4fd8164f5307` | `reasoning-elements.tsx`   |
| `tool-fallback`         | `https://r.assistant-ui.com/styles/base-nova/tool-fallback.json`       | `components/assistant-ui/elements/tool-fallback.aui.tsx`   | `5e5f33f754060aa7` | `tool-fallback.tsx`        |
| `tool-group`            | `https://r.assistant-ui.com/styles/base-nova/tool-group.json`          | `components/assistant-ui/elements/tool-group.aui.tsx`      | `6fa7eb02ceefeb95` | `tool-group.tsx`           |
| `tooltip-icon-button`   | `https://r.assistant-ui.com/styles/base-nova/tooltip-icon-button.json` | `components/assistant-ui/elements/tooltip-icon-button.tsx` | `98580531a6f5a213` | `tooltip-icon-button.tsx`  |
| `use-copy-to-clipboard` | `https://r.assistant-ui.com/base/use-copy-to-clipboard.json`           | `hooks/use-copy-to-clipboard.ts`                           | `2deb9436899718f7` | `use-copy-to-clipboard.ts` |

Fetched and not placed (their workflows are not product workflows):
`attachment` (`fa1bf7d0ef55cc5c`), `file` (`e776f037ddedf6ae`), `image`
(`b80972acda7d89b2`), `follow-up-suggestions` (`ba2f213a1241f281`).

## Mechanical rewrites (every file)

- `"use client"` directives dropped (Vite, no RSC).
- `@/components/ui/<name>` → `@/ui/components/<name>`;
  `@/components/assistant-ui/elements/<name>[.aui]` →
  `@/ui/workbench-thread/<name>`; `./reasoning` →
  `@/ui/workbench-thread/reasoning-elements`; `@/hooks/use-copy-to-clipboard`
  → `@/ui/workbench-thread/use-copy-to-clipboard`; `@/lib/utils` → `cn`.
- `lucide-react` icons → `@remixicon/react`: ArrowDown→RiArrowDownLine,
  ArrowUp→RiArrowUpLine, Check→RiCheckLine, ChevronLeft→RiArrowLeftSLine,
  ChevronRight→RiArrowRightSLine, ChevronDown→RiArrowDownSLine,
  Copy→RiFileCopyLine, Download→RiDownloadLine, MoreHorizontal→RiMoreLine,
  Pencil→RiPencilLine, RefreshCw→RiRefreshLine, Square→RiStopFill,
  Loader→RiLoader4Line, AlertCircle→RiErrorWarningLine,
  XCircle→RiCloseCircleLine, Brain→RiBrainLine.

Every `@assistant-ui/react` member the placed files import was checked
against the pinned 0.15.17 package. One was missing:
`toolApprovalAcceptsText` (see `tool-fallback.tsx` below).

## Deviations by file

`thread.tsx`

- TASK-150.08 visual pass (classes, copy and one slot; primitives, data
  attributes, keyboard and scroll mechanics unchanged): the thread fills its
  column (`--thread-max-width: none`), turns are separated by one 1px rule,
  the user turn is a flat `bg-muted` `rounded-sm` block and the assistant turn
  is plain body text; the welcome reads "No turns yet" with an operator line
  instead of the consumer greeting; the composer is a 1px `border-border`
  `rounded-sm` `bg-card` block of at least 72px with control-size text, the
  placeholder "Ask the workhorse or add context…", a 28px `rounded-sm` Send or
  Stop button, and a `ComposerFooter` component slot in `ThreadComponents`
  rendered at the start of the action row (Archboard's intent controls); the
  edit composer, scroll-to-bottom, action-bar menu, error box and history
  skeleton use `rounded-sm`/`rounded-md` and the type roles; the working
  indicator is status-coloured.
- Attachment affordances removed: the `ComposerAttachmentDropzone`,
  `ComposerAttachments`, `ComposerAddAttachment` and `UserMessageAttachments`
  imports and elements, the `File`/`Image` part renderers and the `file` and
  `image` cases of the grouped-parts switch. The composer shell keeps the
  official markup and classes minus the drag-state variants.
- Dictation removed: `ComposerPrimitive.Dictate` and `StopDictation` are
  forbidden nested members because Archboard owns voice.
- Follow-up and welcome suggestions removed (`ThreadFollowupSuggestions`,
  `ThreadSuggestions`, `SuggestionPrimitive`): Archboard has no suggestion
  source.
- `autoFocus` removed from `Thread`, `ThreadRoot` and the main `Composer`: the
  dock must not take keyboard focus from the canvas on mount
  (`jsx-a11y/no-autofocus`). The edit composer keeps its `autoFocus` under a
  documented block-level suppression because the person just chose Edit.

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

`reasoning-elements.tsx`

- `initialOpenRef` is `const [initialOpen] = useState(defaultOpen)`, and joins
  the layout effect's dependency list; the `as React.CSSProperties` on the
  custom-property style is dropped (typed by
  `components/css-custom-properties.d.ts`); two early effect exits return
  `undefined` explicitly.

`reasoning.tsx`, `tool-group.tsx`, `tool-fallback.tsx`

- The compound component is built with `Object.assign(memo(Impl), {...})`
  and an explicit type annotation instead of `as unknown as`.
- `tool-fallback.tsx`: `toolApprovalAcceptsText`, `approval.display`,
  `approval.prompt` and the `{ text }` response do not exist in 0.15.17, so
  the typed-answer and question presentation (the `Textarea`, `answerField`,
  `promptText`, `isQuestion`, `submitAnswer`, `typedAnswer`) is removed;
  option buttons, confirm flow and allow/deny remain. Two `status?.type`
  chains on the required prop are plain member access.

`use-copy-to-clipboard.ts`

- The always-present `navigator.clipboard` guard is dropped and the promise
  callbacks return explicitly.

## Lint policy

These files are on the exact-file override at the end of
`src/ui/.oxlintrc.jsonc`: compiler, type-aware safety, React correctness and
accessibility checks stay on; authored-code style, JSDoc, react-perf, module
layout and file length are off. `thread.tsx` carries one documented
statement-level suppression (`jsx-a11y/no-autofocus`, edit composer).
