---
id: TASK-143.03.04
title: Render the canonical Codex workbench timeline
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-03 19:48'
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
- [x] #1 The module's only assistant-ui imports are named root ThreadPrimitive, MessagePrimitive, and MessagePartPrimitive; every rendered item, fallback, disclosure, class, and semantic state is Archboard-owned.
- [x] #2 User/assistant/reasoning/plan/command/file/MCP/web/image/tool/approval/error/interruption items render by stable thread/turn/item identity with bounded expandable raw details and no copied Elements.
- [x] #3 The timeline is a named focusable role=log with aria-relevant additions and aria-busy only while streaming; token deltas do not cause repeated live announcements or steal focus.
- [x] #4 Unknown item variants, malformed markdown/media, long output, streaming completion, delayed arrival, and prior-epoch history have safe deterministic renderers and module tests.
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

9. Make userContent the sole user-message media renderer and change the provider-backed repeated-media assertion from four links to the two supplied links.
10. Index runtime approval events by item identity, consume each match while walking canonical items, and append only unmatched approvals in their runtime order; add a mixed command/approval/later-item regression before changing normalization.
11. Run only the focused timeline and assistant-ui policy owner, typecheck, targeted lint, format, and diff checks, then record evidence and commit this second remediation separately.

12. Replace the timeline test's runtime cast with a static public WorkbenchTimeline import, add the root JSX typecheck option needed for that direct TS-to-TSX edge, and make valid generated user-message fixtures satisfy the generated type including text_elements. Keep casts only at deliberately invalid fallback inputs.
13. Add one exact mixed BrowserTimeline owner containing command, matching approval, and later text with the shared authoritative itemId. Pass it through createReadonlyWorkbenchView, ReadonlyWorkbenchThreadProvider, and WorkbenchTimeline and capture the current Duplicate Codex item identity failure.
14. At the workbench-runtime adapter, mint structured assistant message and part runtime IDs from thread, turn, Codex itemId, media kind, and occurrence. Preserve Codex itemId on the part/data metadata, keep runtime-ID collision checks, and let WorkbenchTimeline resolve the structured message ID through the same public runtime identity function.
15. Run only the focused timeline and affected workbench-runtime owners, assistant-ui policy, root typecheck, targeted lint, format, and diff checks, then record evidence and commit separately.

16. Replace variable per-item assistant-ui parts with one stable turn shell message and keep timeline-item reconciliation in the Archboard-owned normalized keyed list. Use assistant-ui public ThreadMessageLike.id as the supported message identity; retain BrowserTimeline item identity and kind in the turn payload metadata.

17. Define the fail-closed BrowserTimeline duplicate as one repeated [threadId, turnId, itemId, media] tuple. Keep shared itemId across different media legal, remove occurrence-masked and structurally impossible runtime collision checks, and add provider-backed duplicate coverage.

18. Normalize runtime-only turns and items into the same Archboard TimelineTurn/TimelineItem model so MessagePrimitive.Root supplies turn context while Archboard owns keyed item DOM and visual grouping. Add a mounted delayed-approval owner that marks the later DOM node, publishes the provider update, and proves the mark and node identity move with the later item rather than the inserted approval.

19. Delete the timeline adapter.ts re-export and make tests import helpers only from the public index.tsx.

20. Run only the focused mounted runtime/timeline/public-provider/import-policy owners, root typecheck, targeted lint/format, and diff checks; record the assistant-ui public source evidence and red/green result, keep the task In Progress, and commit separately.

21. Derive the workbench assistant message from ReadonlyThreadProvider's public messages prop with Extract and Omit intersections, refine only the fixed text tuple and Archboard metadata, and derive mapStatus from that assistant status; run the focused runtime/timeline/provider/policy and exact static gates without adding behavior tests.

22. Derive runtime text, reasoning, and data renderer props from assistantTimelinePrimitives.MessagePrimitive.Content component slots, close over the existing Archboard fallback identities, and derive TimelineMessageList's children callback and render contract from assistantTimelinePrimitives.ThreadPrimitive.Messages. Remove ElementType and vendor-shaped local prop declarations, then run the focused owners and exact static gates without adding tests.

23. Derive WorkbenchTimelineProps.threadId from CodexWorkbenchThread.id and carry that indexed type through normalization identities. Resolve matching decoded/runtime turn status so runtime terminal state replaces decoded progress while stale runtime progress cannot replace a decoded terminal state. Bound visible nested source collections to 32 entries with stable occurrence keys and an omitted-count line, preserving full raw details. Add one status mismatch owner and one compact provider-rendered collection table, then run only the focused timeline/runtime/provider/policy and exact static gates.

24. Carry a required private prose/technical kind from each named-source item-family mapping into SafeSource, use an exhaustive semantic class map, and require technical kind at media/link call sites. Add inline-flex, max-width, centering, and min-h-touch-target to safe HTTP anchors while retaining wrapping and focus styles. Extend the existing provider-rendered owner with focused touch-target and typography assertions, then run only the requested timeline/provider/import-policy and static gates.

25. Preserve a required prose or technical presentation on every text section, classify file-change paths as technical and diffs as prose, render the kind through BoundedCopy, and extend the existing provider-rendered owner with one nonempty file change before rerunning only the focused timeline/provider/static gates.
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

Second rereview remediation started from clean HEAD 48d4de7c8ee2860933479c10e4efcb9b2b094f0b on the fixed base. Scope is limited to duplicate user media and approval chronology. Provider-backed rendering remains the direct verification seam.

Second rereview remediation implemented. userContent now owns user-message media end to end; itemLinks handles only web-search and image-generation URLs. Two repeated user media inputs render exactly two safe links, while javascript media remains inert text. Approval projection now walks recovered canonical items in their original order, inserts each matching runtime approval directly after the canonical item with the same real item id, and appends only unmatched approvals in their original runtime order. Matching command and approval records retain distinct occurrence identities. Missing canonical ids cannot consume a runtime approval.

Red/green evidence: the focused owner initially reported both defects in 164 ms, with command, later assistant item, approval order and four rendered links for two media inputs. After the change it proves command, approval, later assistant order in normalized data and provider-rendered markup, the shared command/approval item id with distinct structured identities, and exactly two links. Final focused timeline plus assistant-ui policy run: 22 pass, 0 fail, 355 assertions in 5.87 s. bun run type-check passed in 2.54 s. Targeted Oxlint passed. Targeted Oxfmt check passed on 11 files in 171 ms. git diff --check passed. No browser rerun was needed because the provider-backed owner exercises both changed output paths. No broad browser, system, module, repository, check, stress, or performance lane ran. Task remains In Progress for rereview.

Third rereview remediation started from clean HEAD fa276cafc5232eb93941497fa14a069eaa6a0bf2 on the fixed base. The affected boundary is the workbench-runtime BrowserTimeline adapter plus the existing timeline provider owner. No duplicate check will be disabled.

Third rereview remediation implemented. The timeline owner statically imports WorkbenchTimeline from its public entrypoint; root TypeScript now enables JSX for that direct TS-to-TSX typechecked edge. Complete generated ThreadItem fixtures use satisfies, function-call output matches the generated input-content array, and the hostile but valid user text part supplies text_elements: []; unchecked CodexWorkbenchItem casts remain only for deliberately unknown future variants.

The exact mixed BrowserTimeline owner failed red with Duplicate Codex item identity: item-approval before the runtime change. The workbench-runtime adapter now preserves the authoritative Codex itemId as part/data metadata while assigning structured message IDs [message, threadId, turnId] and structured part IDs [part, threadId, turnId, itemId, media, occurrence]. A legal command and approval sharing one itemId therefore remain distinct runtime parts, while duplicate authoritative turn identities and any true structured runtime-ID collision still fail closed. WorkbenchTimeline resolves the provider message through the same exported message identity helper, so rendered turn metadata remains the authoritative turnId.

Final focused verification: timeline, runtime projection, mounted provider, and assistant-ui policy owners passed 36 tests, 0 failures, 463 assertions in 5.87 s. The exact provider-backed owner proves command, matching approval, and later text order through createReadonlyWorkbenchView, ReadonlyWorkbenchThreadProvider, and WorkbenchTimeline; it checks the two preserved itemId values and all three exact distinct structured runtime IDs. bun run type-check passed in 2.6 s. Targeted Oxlint passed with --deny-warnings. Targeted Oxfmt check passed on 19 files in 144 ms. git diff --check passed. No broad or browser lane ran. Task remains In Progress for rereview.

Fourth rereview remediation started from clean HEAD a7f07d5a682a6d00fa168627d35860a0ac49a215 on fixed base 23cc54fbc3405a7c5b80bb8de796ae2b53bd5e25. Installed @assistant-ui/react 0.15.17 publicly exports ThreadMessageLike; its public type defines optional message id, while TextMessagePart, ReasoningMessagePart, and DataMessagePart define no part id. The installed client keys every non-tool part as index-N. The remediation will use the supported message id for the stable turn shell and keep variable timeline-item DOM keyed by Archboard normalization, outside assistant-ui part reconciliation.

Fourth rereview remediation implemented. Installed @assistant-ui/react 0.15.17 publicly re-exports ThreadMessageLike from its package root (node_modules/@assistant-ui/react/src/index.ts). The public ThreadMessageLike type defines id as the supported message identity (node_modules/@assistant-ui/core/src/runtime/utils/thread-message-like.ts). Its public TextMessagePart, ReasoningMessagePart, and DataMessagePart types have no stable part-id member, and the installed public client implementation keys every non-tool part as index-N (node_modules/@assistant-ui/core/src/store/clients/thread-message-client.ts). The custom runtimeId field was therefore removed rather than treated as a library contract.

The workbench-runtime adapter now gives each authoritative turn one structured ThreadMessageLike id and one fixed summary text part. Variable BrowserTimeline items do not enter assistant-ui part reconciliation. Their authoritative itemId, media kind, support state, and value remain in Archboard metadata. WorkbenchTimeline normalizes runtime-only turns into the same TimelineTurn/TimelineItem model as decoded turns, preserves one visible turn group, and reconciles rendered items by the existing injective Archboard item identity. The impossible seenMessages/seenParts checks and occurrence-masked runtime IDs are gone.

The authoritative BrowserTimeline duplicate is now the exact [threadId, turnId, itemId, media] tuple. The mounted provider owner proves command and approval may share itemId because their media differs, then proves two command records with the same tuple demote the provider to runtime_failure and expose the exact duplicate identity. Duplicate turn identities remain fail-closed.

Mounted red/green evidence: the delayed-approval owner renders runtime-only command and later activity through createReadonlyWorkbenchView, ReadonlyWorkbenchThreadProvider, and WorkbenchTimeline, marks the later article with DOM-owned state, then inserts the matching approval. With index-key reconciliation it failed because the later DOM node was replaced after moving from position two to three (1 test failed in 1.39 s). With item.identity keys it passed in 117 ms; final focused execution passed in 16 ms and proves the same later DOM node and mark survive, the approval does not inherit the mark, order is command/approval/later, and all items remain in one visual turn group. Mounted updates settled deterministically, so no browser lane ran.

The redundant src/ui/workbench-timeline/adapter.ts entrypoint is deleted. Timeline tests import component, helpers, and public types from index.tsx only. Final focused runtime, mounted runtime, mounted timeline, public timeline/provider, assistant-ui import policy, and test-observer policy run: 38 pass, 0 fail, 479 assertions in 6.79 s. bun run type-check passed. Targeted Oxlint passed with --deny-warnings. Targeted Oxfmt check passed on 19 files in 140 ms. git diff --check passed. No broad module, system, repository, browser, stress, or performance lane ran. Task remains In Progress for rereview.

Fifth rereview remediation started from clean HEAD 87fbfbddaa99e0ed50b4ffe89f452d27543707e4 on fixed base 23cc54fbc3405a7c5b80bb8de796ae2b53bd5e25. Installed ReadonlyThreadProvider publicly declares messages as readonly ThreadMessage[]; this remediation will derive the assistant arm, text part, metadata base, and status through its existing imported component signature, with no new assistant-ui import and no runtime behavior change.

Fifth rereview remediation implemented as a type-only provider-boundary correction. WorkbenchAssistantMessage now derives the provider message union from ComponentProps<typeof ReadonlyThreadProvider>["messages"][number], selects its assistant arm with Extract, preserves all provider-owned fields through Omit/intersection, narrows content to one provider-derived text part, and replaces only metadata.custom with the Archboard timeline payload. mapStatus returns the same derived assistant status; the locally redeclared WorkbenchMessageStatus and copied assistant id/role/createdAt/status/metadata field types are deleted. The @assistant-ui/react import remains exactly AssistantRuntimeProvider, MessageNotSentError, ReadonlyThreadProvider, and useExternalStoreRuntime; no timeline import changed and no casts, suppressions, behavior, or tests were added. Focused runtime/timeline/provider/policy validation: 38 pass, 0 fail, 479 assertions across 6 files in 6.34 s. bun run type-check passed both root and frontend. Targeted Oxlint passed with --deny-warnings. Targeted Oxfmt check passed on 20 files in 154 ms after the single mechanical wrap. git diff --check passed. No broad or browser lane ran. Task remains In Progress for rereview.

Sixth rereview remediation started from clean HEAD 3cd9ca80832978401893ecdf710c87d35dc01ae6 on fixed base 23cc54fbc3405a7c5b80bb8de796ae2b53bd5e25. Scope is limited to type derivation in WorkbenchTimeline.tsx and message-list.tsx. The existing runtime-text and runtime-reasoning fallback identities will remain Archboard-owned closure inputs so provider props no longer claim an itemId and rendered behavior does not change.

Sixth rereview remediation implemented as a type-only renderer and message-list correction. WorkbenchTimeline derives the MessagePrimitive.Content component arm with ComponentProps, Extract, NonNullable, and indexed access; it derives Text, Reasoning, and data.Fallback renderer props with React ComponentProps. Text and reasoning no longer claim a provider itemId. Their unchanged runtime-text and runtime-reasoning identities are Archboard-owned values passed into renderer factories and captured by closure. RuntimeDataPart now receives the provider-derived data renderer props. PART_RENDERERS satisfies the derived Content components contract. TimelineMessageList imports the existing assistantTimelinePrimitives bridge, derives ThreadPrimitive.Messages props through ComponentProps, selects the children arm with Extract and NonNullable, and derives the message parameter and React return from Parameters and ReturnType. ElementType, ReactNode, and the handwritten { message: { id: string } } callback shape are deleted from message-list.tsx. No assistant-ui import, cast, suppression, runtime behavior, or test changed. Focused runtime/timeline/provider/import-policy validation: 38 pass, 0 fail, 479 assertions across 6 files in 6.38 s. bun run type-check passed root and frontend. Targeted Oxlint passed with --deny-warnings. Targeted Oxfmt check passed on 20 files in 164 ms after one mechanical format. git diff --check passed. No browser or broad lane ran. TASK-143.03.04 remains In Progress for rereview.

Seventh rereview remediation started from clean HEAD 69dc78f19afa21be0e5ac32b34f20bdc86691cf4 on fixed base 23cc54fbc3405a7c5b80bb8de796ae2b53bd5e25. The UI authority and module boundary documents were reviewed. Scope is generated thread identity, matching runtime terminal-status precedence, and bounded nested presentation collections. No pagination, virtualization, configuration, browser lane, broad lane, or authoritative-data truncation will be added.

Seventh rereview remediation implemented. WorkbenchTimelineProps.threadId now uses CodexWorkbenchThread["id"], and every normalization helper that carries the same thread identity uses WorkbenchTimelineProps["threadId"] rather than string. The focused status owner failed red because decoded inProgress stayed streaming against matching runtime completed. Matching runtime status now constructs a decoded nonterminal turn; completed, interrupted, and failed decoded turns remain terminal when stale runtime progress arrives. Global aria-busy derives only from the normalized turns, including runtime-only turns. The owner proves matching runtime completed yields status completed and no aria-busy, while the existing terminal owner now pins interrupted against runtime inProgress. A private 32-entry presentation cap now bounds user text/media, hook fragments, combined reasoning summary/content, file-change source entries, and the equivalent link list. Each collection retains occurrence-aware keys, shows an explicit singular/plural omitted-count line, and leaves the input object unchanged; Raw details continues to receive the original value. The compact provider-rendered table failed red with all 35 entries visible, then passed for all four named collection families with 3 omitted and the hidden sentinel absent from the visible article. Focused runtime/timeline/provider/import-policy validation: 39 pass, 0 fail, 493 assertions across 6 files in 6.34 s. bun run type-check passed root and frontend. Targeted Oxlint passed with --deny-warnings, including the 500-line timeline owner. Targeted Oxfmt check passed on 20 files in 184 ms. git diff --check passed. No browser or broad lane ran. TASK-143.03.04 remains In Progress for rereview.

Final seventh-remediation rerun after bounding before key derivation: focused runtime/timeline/provider/import-policy owners passed 39 tests, 0 failures, and 493 assertions in 6.42 s. Root and frontend typecheck passed. Targeted Oxlint --deny-warnings passed. Targeted Oxfmt check passed on 20 files in 180 ms, and git diff --check passed. The task remains In Progress.

Eighth rereview remediation started from clean HEAD 25ac1624c4a03f6aac47ef012062e268519a04b9 on fixed base 23cc54fbc3405a7c5b80bb8de796ae2b53bd5e25. The UI authority, operator reference, Tailwind adoption record, and module boundary contract were reviewed. Scope is limited to SafeSource touch geometry and explicit prose-versus-technical source presentation; no generic component, arbitrary size, screenshot, browser, performance, or broad lane will be added.

Eighth rereview remediation implemented. namedSource now returns a private SourcePresentation with a required kind of prose or technical. SOURCE_KIND_CLASSES is an exhaustive Record over that union. Web-search queries and human-facing file counts map to prose and render with font-sans text-body break-words. Commands, MCP and dynamic tool identifiers, collaboration tool names, agent paths, image paths/results, function-call identifiers, durations, approval IDs, user media sources, and item links map to technical and render with font-mono text-technical break-all. SafeSource no longer assigns DM Mono unconditionally. Safe HTTP anchors now use inline-flex min-h-touch-target max-w-full items-center while retaining the existing safe http/https parser, wrapping class chosen by source kind, underline, new-tab rel, and focus-visible outline. The provider-rendered owner failed red because the safe anchor lacked inline-flex. It now proves the complete display/touch class sequence, Onest for the Archboard web query and 0 files count, DM Mono for bun test, two repeated safe hrefs, and continued rejection of javascript hrefs. No screenshot or browser run was needed because the requested semantic and class contract is visible in the provider-rendered markup. Final focused runtime/timeline/provider/import-policy validation: 39 pass, 0 fail, 497 assertions across 6 files in 6.42 s. bun run type-check passed root and frontend. Targeted Oxlint passed with --deny-warnings, including the 500-line owner. Targeted Oxfmt check passed on 20 files in 182 ms. git diff --check passed. No broad or browser lane ran. TASK-143.03.04 remains In Progress for rereview.

Ninth rereview remediation started from clean HEAD 52826f6909c928c2b8bf53c221956ebde9a19c88 on fixed base 23cc54fbc3405a7c5b80bb8de796ae2b53bd5e25. Scope is only file-change section typography and its existing provider-rendered owner; TASK-143.03.04 stays In Progress and no broad or synthetic test lane will run.

Ninth rereview remediation implemented. Text sections now retain a required private prose or technical presentation kind through rendering. File-change paths render with font-mono text-technical; diffs render with font-sans text-body. Existing user, agent, reasoning, command-output, tool-error, prompt, review, and revised-prompt copy stays prose. The existing provider-rendered owner now supplies one nonempty file change and asserts both class families. Red evidence: 10 pass, 1 fail, 89 assertions on the missing technical path class. Green timeline evidence: 11 pass, 0 fail, 97 assertions. Final focused runtime, timeline, provider, and import-policy set: 39 pass, 0 fail, 499 assertions across 6 files in 6.25s. Root and frontend typechecks passed; targeted Oxlint, Oxfmt, and git diff checks passed. The test remains at 500 lines. No broad, browser, synthetic concurrency, or product-topology lane ran. TASK-143.03.04 remains In Progress.

Canonical integration validation on 2026-09-03: the focused runtime, timeline, mounted provider, and assistant-ui import-policy owners passed 39 tests with 499 assertions. Root and frontend TypeScript checks, targeted Oxlint with warnings denied, targeted Oxfmt over the changed supported TypeScript paths plus tsconfig.json, and git diff --check over the canonical integration range passed. Dependencies were restored with lockfile-pinned bun install before validation. No broad module, system, repository, browser, topology, stress, capacity, performance, tooling, or runner-concurrency lane ran.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:39
---
Course correction, 2026-09-02: this not-yet-started UI leaf is frozen behind TASK-143.08.05 so it cannot build on the rejected protocol and browser contracts.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Integrated the reviewed canonical workbench timeline replay. Focused provider-backed coverage verified all item families, stable ordering and identities, bounded safe details, file-change prose and technical typography, and accessible streaming log behavior. The focused owners passed 39 tests with 499 assertions; both TypeScript projects, targeted Oxlint, targeted Oxfmt, and diff checks passed.
<!-- SECTION:FINAL_SUMMARY:END -->
