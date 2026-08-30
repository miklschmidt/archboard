---
id: TASK-143.01.02
title: Define the closed Codex browser contract
status: To Do
assignee: []
created_date: '2026-08-30 15:06'
updated_date: '2026-08-30 17:03'
labels: []
dependencies:
  - TASK-143.01.01
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/shared/codex-browser-model
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 172000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Define the closed browser DTOs plus the exhaustive host-side server-request contract that the final composition routes. Generated protocol types do not cross this shared boundary. Delegation profile: gpt-5.6-luna, xhigh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The browser DTO union covers readiness, account/login, thread links, timelines, queue, settings, approvals/forms, text commands, semantic delivery, coordinator, voice, command leases, and delivered/not_delivered/outcome_unknown without generated imports.
- [ ] #2 A closed host request union covers all eleven 0.151.0 variants: seven broker families, item/tool/call, currentTime/read, account/chatgptAuthTokens/refresh, and attestation/generate; no default/unknown branch can silently drop a request.
- [ ] #3 The contract imports the literal InitializeCapabilities object and six-login support/refusal table from the reviewed authored contract, including exact extensions, notification opt-outs, time response, and protocol-error policies.
- [ ] #4 Round-trip/schema fixtures reject unknown identities, methods, result media, status, capability, login variant, browser command, or server request and keep secrets out of browser snapshots.
<!-- AC:END -->
