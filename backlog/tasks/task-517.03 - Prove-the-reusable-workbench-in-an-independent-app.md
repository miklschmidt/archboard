---
id: TASK-517.03
title: Prove the reusable workbench in an independent app
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24 11:38'
updated_date: '2026-10-24 14:28'
labels: []
dependencies:
  - TASK-517.02
parent_task_id: TASK-517
priority: high
type: task
ordinal: 928000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A minimal second consumer demonstrates that the extraction works without Archboard concepts. It also gives future consumers a runnable example of the supported interface.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The app starts from public interfaces without an Archboard server, board, or vault.
- [ ] #2 Fast controlled tests exercise conversation, live voice negotiation, workhorse completion, approval handling, session isolation, and distinct stop actions.
- [ ] #3 Usage documentation names the host inputs and startup requirements, and the complete normal gate passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
This delivery contributes the independent consumer to Archboard@TASK-517 and the shared interfaces on the other parent proposals.
1. Add a minimal apps/workbench-example host with its own storage, instructions, context, tools, and admitted checkout.
2. Connect a small browser consumer to the public browser entry. Keep process entry files thin.
3. Exercise the production factory and shared media interface with controlled protocol fixtures and a checkout without a vault.
4. Cover conversation, voice negotiation, long work completion, approval handling, isolation, and distinct stop actions at their cheapest credible owners.
5. Document startup prerequisites and host responsibilities. Keep generated output ignored.
6. Run the complete normal gate and record any required live microphone acceptance as a limitation of automated evidence.
7. Simplify the result and commit with Refs: TASK-517.03.
The parent owns parallel review, board adoption, and final acceptance evidence.

The backend implementer owns only the new example server, controlled backend tests, package manifest, and usage documentation. The parent owns the browser consumer, app-entry/layer/browser-safety policies, build integration, and final QA. The example uses a localhost HTTP/WebSocket host around createCodexWorkbench, with one admitted checkout and its own private state root. It forwards socket metadata through factory.browser.accept/handle/close and uses the same public transport/media factories in the browser. No board, vault, Archboard server, duplicated authority logic, or synthetic host callbacks. Keep account sign-in, conversation creation, text, voice, approvals, and separate voice/workhorse stops usable. Reuse the existing controlled Codex executable through an appropriate public test boundary rather than copying its protocol implementation. Add only meaningful fast contract owners, then use the complete gate and scoped fixing review before closure.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Independent backend dc8075788 uses only the public shared factory. Parent browser uses the public transport and media owners, with separate stop actions and exact displayed approval intent. Three fast rendered cases pass, including retained drafts on failed delivery. Both type projects, scoped lint, build, and 28 repository policy cases pass. Manual controlled browser QA at 1920x1080 delivered text, settled the offered command approval, interrupted work, retained the tab conversation on reload, and recovered microphone denial through Reconnect. Live microphone audio remains outside controlled evidence. New backend and public-interface boundary reviews are active before the final full gate.
<!-- SECTION:NOTES:END -->
