# UI libraries for a Codex agent workbench

Date: 2026-08-30

## Decision

Use one agent UI runtime, not an agent transport SDK:

1. Keep Codex app-server JSON-RPC as the source of truth. Start one private stdio child from the configured binary; do not attach the workbench to the existing Unix control socket or a Desktop/shared process.
2. Generate TypeScript protocol definitions with `codex app-server generate-ts --experimental` from that exact binary, then add an app-owned adapter that reduces app-server threads, turns, items, approvals, dynamic tool calls, and realtime events into UI state.
3. Use [`@assistant-ui/react`](https://github.com/assistant-ui/assistant-ui/blob/main/packages/react/package.json), specifically `ExternalStoreRuntime` and its headless primitives, for conversation composition and composer actions. Build the initial Archboard renderers as owned modules rather than copying assistant-ui Elements. Do not use `AssistantTransport`; it would create a second snapshot-streaming protocol beside app-server.
4. Adopt Tailwind 4 and shadcn configured for Base UI as the component delivery layer. Map Archboard's existing semantic tokens and the reference mockup's aesthetics into that layer, and copy only the components that save meaningful interaction work. The detailed adoption constraints are recorded in [Tailwind 4 and shadcn/Base UI adoption research](./tailwind-base-ui-adoption-research.md).
5. Implement mic capture, waveform/level display, permission state, and app-server realtime coordination as a private browser workspace package with one framework-neutral public API. Its current consumer is Archboard; publication and compatibility promises remain out of scope. Exclude Archboard, React, assistant-ui, generated protocol, and Node imports so the media lifecycle remains a deep browser module. Add a VAD package only if automatic speech segmentation becomes a measured need.
6. Defer diff UI until the workflow requires it. If needed, start with assistant-ui's copied `CodeDiff` as a read-only presentation component. Keep Codex file-change approval at the request level rather than inventing unsupported per-hunk semantics.

This leaves one canonical state machine, one process owner, and one wire protocol. The main gap is intentional: no reviewed library covers the complete Codex app-server lifecycle, especially bidirectional approvals and realtime voice, in a Vite-ready React component.

## Existing constraints

Archboard is a Vite 8, React 19, strict TypeScript application run with Bun. It has no Tailwind, Radix, Lucide, AI SDK, or existing design-system dependency. The current UI uses semantic HTML, a native `<dialog>` wrapper, explicit focus behavior, `aria-live`, real buttons, and a large token-driven stylesheet. A new component set should fit that convention rather than require a parallel styling system.

`src/runtime/engine/app-server-control.ts` already connects to the Codex control socket for the legacy injection feature. It is evidence about framing and event correlation, not the workbench transport. The workbench needs a new owner for a private stdio child, generated protocol decoding, server-initiated requests, approvals, dynamic tools, and realtime. ADR-0019 records why the legacy control-socket injector is removed instead of expanded into a second client.

The intended boundary is:

```text
Codex app-server JSON-RPC
        |
owned stdio child + exact-binary experimental protocol types
        |
app-owned reducer and command adapter
        |
assistant-ui ExternalStoreRuntime
        |
Archboard-styled thread, activity, composer, approval, stop, and optional diff UI
```

The reducer owns ordering, request IDs, approval expiry, interruption, same-child reconnect recovery, child-exit invalidation, and exactly-once responses. The UI library owns rendering and interaction composition. Neither should own the other's protocol.

## Candidate comparison

Versions are those inspected on 2026-08-30. A registry entry is copied source, but any packages imported by that source remain runtime dependencies.

| Candidate                                                               | License and delivery                                                                                                               | What it actually supplies                                                                                                                                                           | Vite and app-server fit                                                                                                                                                                                                                               | Decision                                                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui)            | MIT. `@assistant-ui/react` is a runtime package; [Elements](https://www.assistant-ui.com/elements) are shadcn-style copied source. | Headless conversation/thread primitives, external-store integration, composer cancellation, tool UI, approvals, thread list, stopped state, voice visualization, and diff elements. | React 18/19 and bundler-neutral. `ExternalStoreRuntime` is designed for an existing external state store. Copied elements assume Tailwind and often Radix/Lucide.                                                                                     | Adopt the runtime and a very small, restyled element subset.                                   |
| [Vercel AI Elements](https://elements.ai-sdk.dev/docs/setup)            | Apache-2.0. Components are copied through its CLI or shadcn registry.                                                              | Polished message, tool, confirmation, task, prompt, speech-input, transcription, and agent parts.                                                                                   | Official prerequisites include React 19, Next.js 14+, AI SDK, shadcn, and Tailwind 4. Tool state is expressed as AI SDK `ToolUIPart`, not Codex app-server items and requests.                                                                        | Do not adopt its runtime assumptions. Use only as a visual/source reference.                   |
| [shadcn/ui](https://ui.shadcn.com/docs/registry/getting-started)        | MIT. Registry source is copied into the app; declared registry and package dependencies are then installed.                        | General primitives and blocks, plus an installation format. It is not an agent runtime.                                                                                             | Vite is supported, and the selected Base UI source fits the adopted Tailwind 4 delivery layer.                                                                                                                                                        | Initialize one shadcn/Base UI layer and add only components that remove real interaction work. |
| [OpenAI Apps SDK UI](https://github.com/openai/apps-sdk-ui)             | MIT. `@openai/apps-sdk-ui` is a runtime package.                                                                                   | The ChatGPT Apps design system: general controls, typography, markdown, overlays, and related styles.                                                                               | React 18/19 and technically usable with Vite, but requires Tailwind 4/global styles and has no threads, tool lifecycle, approvals, or app-server transport.                                                                                           | Reject unless matching the ChatGPT Apps visual language becomes a product requirement.         |
| [OpenAI ChatKit](https://developers.openai.com/api/docs/guides/chatkit) | MIT React package and hosted/custom ChatKit integration.                                                                           | A web-component chat surface with a ChatKit protocol and server/store model.                                                                                                        | A [custom backend](https://developers.openai.com/api/docs/guides/custom-chatkit) still implements ChatKit's server and event protocol. That would wrap Codex app-server in another state and transport layer and provides less workbench composition. | Reject for direct app-server use.                                                              |
| [prompt-kit](https://github.com/ibelick/prompt-kit)                     | MIT, copied shadcn registry source.                                                                                                | General AI-chat components.                                                                                                                                                         | Its own package/application stack includes Next, Tailwind, Radix, and AI SDK dependencies, with less thread/approval/runtime coverage than assistant-ui.                                                                                              | Reject as a redundant second registry.                                                         |
| [shadcn-chatbot-kit](https://github.com/Blazity/shadcn-chatbot-kit)     | MIT, copy-and-paste component source.                                                                                              | Chat UI and examples.                                                                                                                                                               | The upstream examples use the older `ai/react` integration and describe voice as work in progress. It does not cover Codex approvals or app-server state.                                                                                             | Reject.                                                                                        |

## assistant-ui

### Runtime and state boundary

The custom-runtime documentation distinguishes two integration modes. [`ExternalStoreRuntime`](https://www.assistant-ui.com/docs/runtimes/custom/external-store) consumes messages and state already owned elsewhere, and accepts callbacks such as new-message and cancel actions. [`AssistantTransport`](https://www.assistant-ui.com/docs/runtimes/custom/assistant-transport) sends commands to a backend that returns conversation snapshots. Archboard already has a richer bidirectional event protocol, so the external-store mode is the appropriate seam.

The runtime can represent [multiple threads](https://www.assistant-ui.com/docs/runtimes/concepts/threads), [tool UIs](https://www.assistant-ui.com/docs/tools/tool-ui), and adapter-supplied capabilities. The app-owned adapter should map:

- app-server thread metadata to assistant-ui thread state;
- turns and streamed item deltas to ordered message/content parts;
- command, file-change, MCP, and dynamic-tool items to explicit tool renderers;
- app-server approval requests to pending approval state keyed by JSON-RPC request ID;
- composer submit to `turn/start` or the appropriate active-turn action;
- cancel/stop to [`turn/interrupt`](https://developers.openai.com/codex/app-server/);
- disconnect and interrupted turns to visible terminal states, not an indefinitely running message.

The package inspected was `@assistant-ui/react` 0.15.17, licensed under the repository's [MIT license](https://github.com/assistant-ui/assistant-ui/blob/main/LICENSE) with React 18/19 peer support. Its package manifest includes `@assistant-ui/core`, `@assistant-ui/store`, `@assistant-ui/tap`, `assistant-stream`, `assistant-cloud`, Radix, `react-textarea-autosize`, `safe-content-frame`, Zod, and Zustand. Cloud is not required by `ExternalStoreRuntime`, but it is still a package dependency and should be included in a bundle-size inspection before acceptance.

### Components worth reusing

The strongest candidates are:

- [`ThreadList`](https://www.assistant-ui.com/elements/thread-list) for the thread picker, provided Archboard remains the owner of list, rename, archive, active, and reconnect state.
- [`Composer`](https://www.assistant-ui.com/elements/composer) and [`StoppedRun`](https://www.assistant-ui.com/elements/stopped-run) for submit, cancel, attachment affordances if needed, and a clear interrupted state.
- [`ToolFallback`](https://www.assistant-ui.com/elements/tool-fallback) plus [`ApprovalCard`](https://www.assistant-ui.com/elements/approval-card) for progressive tool details and approve/reject controls. The app must supply exact Codex request semantics and disable a card immediately after response, expiry, interruption, or disconnect.
- The activity/tool timeline elements for streamed command output and status. Codex item IDs, state transitions, and raw details should remain inspectable even if the visual grouping changes.
- [`CodeDiff`](https://www.assistant-ui.com/elements/code-diff) only if read-only file review becomes part of the first release.

These elements are copied source, not a hosted service. Their default source uses Tailwind utilities and, depending on the element, Lucide and shared registry helpers. Copying all of them would quietly create a second design system. The smaller choice is to install the runtime, copy only interaction-heavy elements, replace their class recipes with Archboard tokens, and delete unused variants and dependencies.

The [`ReviewableDiff`](https://www.assistant-ui.com/elements/reviewable-diff) exposes per-hunk keep/discard actions. Codex app-server's file-change approval is a request-level accept/decline interaction, while `turn/diff/updated` is a presentation update. Per-hunk buttons would promise a capability the protocol does not provide, so they should not be shown unless Archboard later implements a real patch-editing workflow.

### Accessibility evidence and limits

assistant-ui's primitives expose semantic controls, and its published element source includes labeled buttons, disclosure state, and keyboard-operable actions. That is useful evidence, but it is not proof that an Archboard composition is accessible. Streaming text also needs deliberate live-region behavior. The current [shadcn Message Scroller](https://ui.shadcn.com/docs/components/aria/message-scroller) is a good pattern: a named, focusable `role="log"` region with `aria-relevant="additions"` and `aria-busy` while streaming so a screen reader is not forced to announce every token.

Any copied approval or composer element must preserve visible focus, accessible names, focus return after dialogs, logical reading order, and keyboard access after restyling.

## Vercel AI SDK and AI Elements

AI Elements has useful visual precedents but the wrong state boundary for this application. Its [`Tool`](https://elements.ai-sdk.dev/components/tool) accepts AI SDK tool parts and models states such as input streaming, approval requested, output available, denied, and error. [`Confirmation`](https://elements.ai-sdk.dev/components/confirmation) handles approve/reject presentation; [`Task`](https://elements.ai-sdk.dev/components/task) presents progress; and [`Prompt Input`](https://elements.ai-sdk.dev/components/prompt-input) is a capable composer. Converting Codex items and requests into AI SDK parts would add an avoidable intermediate model beside the assistant runtime.

The official setup requires React 19, Next.js 14 or later, AI SDK, an initialized shadcn project, and Tailwind 4. Components are copied by the AI Elements CLI or as `@ai-elements/*` shadcn registry items, while their imported packages remain runtime dependencies. Archboard satisfies React but not the Next/Tailwind/AI SDK assumptions. The [Apache-2.0 license](https://github.com/vercel/ai-elements/blob/main/LICENSE) permits reuse, but licensing does not remove the integration cost.

Its voice components also do not close the workbench gap. [`SpeechInput`](https://elements.ai-sdk.dev/components/speech-input) uses browser speech recognition where available and a `MediaRecorder` fallback elsewhere; that creates a second transcription path instead of presenting Codex realtime state. [`Transcription`](https://elements.ai-sdk.dev/components/transcription) synchronizes segments with playback rather than displaying an in-progress app-server transcript. Neither is a live mic waveform.

The Vercel AI SDK's [transport abstraction](https://ai-sdk.dev/docs/ai-sdk-ui/transport) is a state/transport SDK, not a copied visual primitive. It should not sit between Archboard and app-server.

## shadcn registries

A shadcn registry is a source-distribution mechanism. The registry schema separates copied files from `registryDependencies` and package `dependencies`; the latter still become runtime code. The official [registry documentation](https://ui.shadcn.com/docs/registry/getting-started) makes this explicit. The [directory](https://ui.shadcn.com/docs/directory) also warns that third-party registry code must be reviewed before installation.

The official [blocks](https://ui.shadcn.com/docs/_blocks) provide application shells and sidebars, but not a Codex item/approval state machine. The official chatbot template is a [Next.js AI SDK application](https://github.com/shadcn-ui/chatbot-template), not a portable Vite workbench block. shadcn now defaults new work to [Base UI while retaining Radix support](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default), so indiscriminate registry installation can also introduce two primitive families.

If an overlay, disclosure, menu, or tooltip primitive is needed, Radix has the clearest concrete accessibility basis: its documentation describes adherence to WAI-ARIA patterns, keyboard and focus handling, semantic roles, and testing with assistive technologies ([Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility)). That supports a narrow primitive dependency. It does not justify replacing Archboard's native dialog and existing semantic controls wholesale.

No third-party registry reviewed improves the smallest product. prompt-kit and shadcn-chatbot-kit overlap with assistant-ui, bring similar styling assumptions, and have weaker coverage for threads, approvals, interruption, and realtime state.

## OpenAI-maintained UI packages

[`@openai/apps-sdk-ui`](https://github.com/openai/apps-sdk-ui/blob/main/package.json) 0.2.2 is a React 18/19 design-system package under the repository's [MIT license](https://github.com/openai/apps-sdk-ui/blob/main/LICENSE). Its key dependencies include Radix, `react-markdown`, syntax highlighting, Luxon, and Tailwind-oriented styling. It is appropriate for interfaces rendered as ChatGPT Apps. It does not provide an agent runtime, thread picker, tool-call lifecycle, approval correlation, interrupt semantics, or app-server transport. Adding it would duplicate Archboard's UI conventions without solving a workbench-specific problem.

[`@openai/chatkit-react`](https://developers.openai.com/api/docs/guides/chatkit) supplies a packaged chat surface, but custom integrations implement ChatKit's server, store, and streamed event protocol. That is valuable when ChatKit is the product boundary. Here it would place a ChatKit gateway over an already suitable Codex app-server protocol and reduce composability for task navigation, canvas actions, and detailed agent activity.

Neither package belongs in the recommended set.

## Voice and realtime

No candidate provides the complete required chain: browser permission, device selection and loss, mic capture, encoded audio chunks, Codex realtime session commands and events, live level or waveform, partial/final transcript, mute, interruption, reconnect, and accessible status.

The smallest implementation is browser-native:

- `navigator.mediaDevices.getUserMedia` owns permission and capture;
- `AudioContext` and `AnalyserNode` provide a level/waveform for a small canvas or CSS visualization;
- the app-server adapter owns realtime session state, audio transport, transcript events, interruption, and recovery;
- a text status remains the accessible equivalent of the visual waveform.

The assistant-ui [`Orb`](https://www.assistant-ui.com/elements/orb) can render a supplied state and normalized volume, but its copied implementation uses a WebGL canvas and does not capture, transport, or transcribe audio. It is optional polish, not voice infrastructure.

Voice-oriented packages were checked as gap-fillers:

| Package                                                                               | License and dependencies                                         | Fit                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@ricky0123/vad-react`](https://github.com/ricky0123/vad) 0.0.36                     | ISC; depends on `onnxruntime-web` and the companion VAD package. | Useful only if automatic speech-boundary detection is required. It is not a waveform or transcription library, and its model/runtime cost is unjustified for push-to-talk. |
| [`react-audio-visualize`](https://github.com/samhirtarif/react-audio-visualize) 1.2.0 | MIT; React wrapper for live/blob visualizers.                    | Can draw a mic visualizer, but the wrapper saves little over the browser APIs and still leaves every meaningful voice state to Archboard.                                  |
| [`@wavesurfer/react`](https://github.com/katspaugh/wavesurfer-react) 1.0.12           | BSD-3-Clause; React wrapper around `wavesurfer.js`.              | Stronger for recorded-audio playback and seeking than for a low-latency live mic status. Do not add it unless playback becomes a requirement.                              |

Transport-bound voice stacks such as conferencing or voice-agent frameworks should not be introduced. Codex app-server remains the realtime authority.

## Diff review

Diff rendering is optional and should not block the workbench. The app-server emits file-change items and diff updates, so the first useful surface can be a read-only unified diff attached to the corresponding item, followed by request-level approve/reject controls.

assistant-ui's copied [`CodeDiff`](https://www.assistant-ui.com/elements/code-diff) is the smallest candidate because the project can remove irrelevant styling and keep the data mapping local. Two standalone runtime alternatives are less attractive:

- [`react-diff-viewer-continued`](https://github.com/Aeolun/react-diff-viewer-continued) 4.4.0 is MIT and supports React 19, but adds Emotion, diff parsing, YAML, and syntax-highlighting dependencies for a feature that may not ship initially.
- [`@pierre/diffs`](https://github.com/pierrecomputer/pierre) is Apache-2.0 and provides a richer diff stack, but brings Shiki and a substantially larger syntax-rendering surface.

Do not expose per-hunk accept/reject until the backend contract can perform that exact operation. A button that looks like patch review but merely approves the whole Codex request violates the interface's predictability.

## App-server client and SDK boundary

### Official Codex SDK

The official [`@openai/codex-sdk`](https://www.npmjs.com/package/@openai/codex-sdk) inspected at 0.151.0 is Apache-2.0, requires Node 18 or later, and depends on the matching `@openai/codex` package. Its [`exec.ts`](https://github.com/openai/codex/blob/main/sdk/typescript/src/exec.ts) spawns `codex exec --experimental-json`; its [`Thread`](https://github.com/openai/codex/blob/main/sdk/typescript/src/thread.ts) is a server-side prompt wrapper offering run and streamed-run operations around that process.

It does not expose the full long-lived, bidirectional app-server contract: server-initiated approval requests, task listing and mutation, dynamic tools, queue methods, or realtime methods. It is therefore not a workbench client SDK.

The official [app-server documentation](https://developers.openai.com/codex/app-server/) is the authoritative contract for a rich client. It describes the JSON-RPC-like protocol, stdio/WebSocket transports, threads, turns, streamed item events, server requests and approvals, interruption, review, and realtime features. Crucially, it tells clients to generate TypeScript or JSON Schema definitions from the installed Codex version with `codex app-server generate-ts` or `generate-json-schema`. Archboard should follow that version-coupled path rather than trust a separately released binding.

Generated definitions are reproducible derived artifacts. Prefer a deterministic generation/check command against the installed Codex version and ignore the output unless a checked-in protocol snapshot is needed for a documented build or review reason.

### Third-party client candidates

[`codex-app-server-client`](https://github.com/BrandonMJohnson/codex-client) 0.1.5 is the closest functional candidate. It is an MIT, ESM-only package with no runtime dependencies and a Node 24-or-later engine policy. It supplies a typed client, event handling, approval helpers, thread/turn methods, and stable stdio process management. A disposable Bun 1.4 probe successfully imported `createClient`, spawned the local app-server over stdio, initialized it, and closed it. That is evidence of basic runtime compatibility, not evidence of support under its Node engine policy.

It is not suitable for adoption now:

- the generated [protocol manifest](https://github.com/BrandonMJohnson/codex-client/blob/main/src/generated/manifest.json) records `codex-cli 0.120.0`, behind the installed/current line inspected here;
- its [README](https://github.com/BrandonMJohnson/codex-client/blob/main/README.md) identifies stdio as the stable transport, which matches the chosen transport but not the required 0.151 experimental surface;
- its [implementation plan](https://github.com/BrandonMJohnson/codex-client/blob/main/IMPLEMENTATION_PLAN.md) explicitly leaves WebSocket, experimental client methods, and realtime on hold;
- adopting it would still require local code for the workbench's newest protocol surface while coupling the client to a separately released generated manifest.

[`@usetemi/codex-sdk`](https://github.com/usetemi/codex-sdk/blob/main/packages/typescript/README.md) 0.133.0 is MIT and adds low-level app-server helpers around the official exec SDK, with Node 24 or later and dependencies on matching older Codex packages plus the MCP SDK. It does not improve on an exact-binary generated stdio boundary and would add version and dependency coupling.

[`@xcodexai/sdk`](https://github.com/olegische/xcodex/tree/wasm/codex-rs/wasm/ts/xcodex-sdk) 0.1.2 is Apache-2.0, requires Node 22 or later, and depends on OpenAI and A2A SDKs. It adapts an existing app-server connection to OpenAI Responses/A2A concepts and documents a lossy mapping for internal events; it does not establish the transport Archboard needs. Those extra protocol layers are counterproductive for a direct workbench.

Recommendation: adopt none of these client SDKs. Start the configured binary as an Archboard-owned stdio child, generate definitions from that exact binary with `--experimental`, and implement the narrow session boundary needed for server requests, approvals, dynamic tools, workbench thread methods, interruption, and realtime. The current automatic decline of server requests becomes an explicit lifecycle with a single UI owner before approvals are enabled.

## Smallest composable set

The recommended initial dependency and source surface is:

| Need                                                               | Choice                                                                                                                              | Ownership                               |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Canonical protocol and state                                       | Owned stdio app-server child plus exact-binary experimental types and an app reducer                                                | Archboard                               |
| Conversation, thread, tool, approval, and cancellation composition | `@assistant-ui/react` with `ExternalStoreRuntime`                                                                                   | Runtime package, with Archboard adapter |
| Visual components                                                  | Archboard-owned modules using assistant-ui headless primitives plus one Tailwind 4 shadcn/Base UI layer, mapped to Archboard tokens | Archboard source                        |
| Activity accessibility                                             | Semantic log/list markup and batched live-region behavior based on the Message Scroller pattern                                     | Archboard                               |
| Voice                                                              | Browser media/audio APIs and app-server realtime events                                                                             | Archboard                               |
| Diff                                                               | None initially; copied assistant-ui CodeDiff if a real workflow requires it                                                         | Optional copied source                  |

Do not initially add AI SDK, AI Elements, Apps SDK UI, ChatKit, a broad shadcn component catalogue, a second primitive family, a third-party chat registry, a voice framework, a diff runtime, or a Codex client SDK.

## Uncovered product work

Libraries do not remove these responsibilities:

- lossless, ordered reduction of all reachable Codex item and delta types;
- server-request correlation, approval expiry, exactly-once response, and recovery after reconnect;
- defining which approval and user-input requests can arrive while another task is selected;
- interruption races, late events, and visible terminal state;
- task list pagination, rename/archive semantics, unread/running indicators, and active-task recovery;
- safe rendering and truncation of command output, paths, URLs, patches, images, and unknown future item types;
- mic permission denial, device loss, mute, reconnect, audio backpressure, partial/final transcript, and a nonvisual status equivalent;
- the relationship between a Codex task and the currently open Archboard board;
- the linked workhorse and persistent fast-coordinator relationship, including
  model, priority fallback, intervention policy, queue, callback, and spoken
  approval state;
- a truthful patch-review contract if editing or per-hunk decisions are ever offered.

These are the workbench's domain behavior, not generic chat-widget behavior.

## Acceptance checks for a later implementation

Direct verification should cover the states the protocol can actually reach:

- streamed assistant text, reasoning summaries, tool start/progress/success/failure, and unknown item fallback;
- pending, accepted, declined, expired, and disconnected approvals, including exactly one response on rapid activation;
- stop during text, command execution, file change, approval wait, and realtime voice;
- task switch while another task runs, reconnect with a running task, empty and paginated task lists;
- keyboard-only task selection, composer submission, disclosure, approval, stop, modal focus return, and visible focus;
- screen-reader names and state, with batched streaming announcements rather than token-by-token output;
- mic permission denied, device removed, mute, app-server disconnect, partial transcript, final transcript, and recovery;
- a diff that matches the app-server item and whose actions match the backend's actual granularity;
- a repository check that regenerates or verifies protocol types against the Codex version used by the application.

Bundle inspection should also confirm that unused assistant-cloud, syntax-highlighting, voice, and diff code does not enter the initial workbench bundle.
