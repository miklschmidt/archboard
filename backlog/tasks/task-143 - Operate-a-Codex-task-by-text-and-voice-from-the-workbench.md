---
id: TASK-143
title: Operate Codex threads by text and voice from the workbench
status: Done
assignee: []
created_date: '2026-08-30 11:43'
updated_date: '2026-09-05 03:45'
labels: []
dependencies:
  - TASK-140
  - TASK-144
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/desktop-app-server-sharing-research.md
  - docs/design/desktop-remote-control-integration-research.md
  - docs/design/tailwind-base-ui-adoption-research.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-delivery-map.md
  - docs/design/codex-workbench-authored-contracts.md
priority: high
type: feature
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deliver one coherent Codex workbench on merged TASK-140 and TASK-144 only after TASK-143.08 recovers the audited integration. A pane links to one current-epoch workhorse on Archboard's exact owned app-server child; a capable persistent coordinator supports text, voice, semantic context, bounded direct actions, delegation, queueing, callbacks, and state-gated spoken approvals. Completed leaf records remain historical. Current product authority comes from the generated-derived protocol seam, production interfaces, and rendered workflows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One exact-version owned app-server session, explicit current-epoch thread links, text, tool, queue, approval, semantic-context, coordinator, and browser-native live-voice behavior compose through one recovered production graph without Desktop or shared-daemon attachment.
- [ ] #2 Every used Codex wire assumption derives from the exact generated vendor types during ordinary compilation; runtime schemas prove conformance at untrusted ingress, and browser or domain additions convert once at a named seam.
- [ ] #3 The rendered desktop workbench follows TASK-140 and TASK-144, preserves claim, doing, and take-back, keeps workhorse and coordinator histories distinct, and directly verifies the reachable desktop, fullscreen, keyboard, screen-reader, theme, reduced-motion, and Samsung Flip touch states.
- [ ] #4 TASK-143.08 completes before feature work resumes, redundant tests and validation paths are absent, mandatory startup failures are actionable and leak-free, and final module, process, repository, and serial-browser owners plus clean real text and voice smokes pass.
- [ ] #5 Each Archboard server owns at most one live or starting package-local codex app-server instance; reload preserves that instance and any crash recovery is a serialized replacement after the prior process group is fully gone.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed at the user’s explicit request after integration of the smoke worktree and completion of the implementation leaves. Validation at 75a1cd22: 2565 module tests, 13 production/system tests, shell/text/controlled-voice browser owners, lint, format, TypeScript and 124 repository checks passed. Current runbook verification additionally passed 147 focused module tests and both workbench browser owners. Real text delivery and SDP negotiation were observed. Full real-audio acceptance remains unverified because the configured default microphone was absent; no unchecked aggregate criterion is relabelled as a proven pass. TASK-150 separately owns strict-lint restoration and the fresh UI rebuild.
<!-- SECTION:FINAL_SUMMARY:END -->
