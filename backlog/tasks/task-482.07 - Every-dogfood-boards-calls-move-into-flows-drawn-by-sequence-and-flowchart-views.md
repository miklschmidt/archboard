---
id: TASK-482.07
title: >-
  Every dogfood board's calls move into flows, drawn by sequence and flowchart
  views
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-16 01:21'
updated_date: '2026-10-16 03:03'
labels: []
dependencies:
  - TASK-350
  - TASK-482.06
parent_task_id: TASK-482
priority: high
ordinal: 848000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0052 says a call is one exchange in an order and belongs to a flow, not to the architecture drawing. TASK-482.03 and TASK-482.04 carried this in their titles but closed with only the new structure: on 2026-10-16 the vault still held about 650 relationships of kind call and 21 flows, and Agent workbench had 41 calls and no flow. Views such as Voice on Agent workbench answer a sequence question with an architecture drawing that shows no lines. Flows written after TASK-350 can carry decisions and loops, so they are written once.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every dogfood board answers its sequence questions with flows and sequence views, and its flows carry decisions and loops where the code branches or repeats
- [ ] #2 No architecture view of a dogfood board draws its parts without the lines that its question needs
- [ ] #3 archboard check and archboard check --code report nothing new against the boards before the move
- [ ] #4 Between two parts there is at most one relationship of each kind; each exchange that a board's question needs is a step of a flow, not a further relationship
- [ ] #5 Every board in the vault of github.com/Admin-By-Request/Docs-Architecture-Design meets the same criteria
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Baseline: archboard check --code on both vaults before any draft.
2. Agents (sonnet) each take one to three boards and write a draft named TASK-482.07 per board through the CLI: one flow per exchange question the board answers, with decisions and loops where the code branches or repeats, every step anchored; a sequence view per flow and a flowchart view where the logic matters; architecture views whose question is an exchange become sequence or flowchart views; container views name the outside parts their parts work with; at most one relationship per pair and kind. Agents never adopt, never commit and never run check --code.
3. Docs-Architecture-Design: the same, skipping the three boards with someone else's uncommitted changes (Device Trust Control Plane, Device Trust Delivery, Platform Test Cluster).
4. I run check --code --variant TASK-482.07 on both vaults against the baseline, send fixes back, look at each new view's picture, adopt, and commit (in Docs-Architecture-Design only the files I changed).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope widened by the owner on 2026-10-16: every board in every repository registered with archboard. On that day only two vaults held boards: this repository (17 boards, 674 call relationships, 15 flows) and github.com/Admin-By-Request/Docs-Architecture-Design at /home/msc/Work/Docs-Architecture-Design (22 boards, 53 call relationships, 1 flow). Every other registered checkout is either empty or a worktree of this repository. The archboard skill must teach when a question is an architecture view, a sequence view or a flowchart view; that rule lands with TASK-350.

2026-10-16: 13 agents drafted the 17 archboard boards and 3 agents drafted 19 Docs-Architecture-Design boards (TASK-482.07 drafts). Code check on the archboard drafts first added 102 anchor findings; the agents fixed them, and I dropped three anchors whose code no part on the board binds. Adopted all 17; Live panes went to 27 overview lines, so Semantic context input moved into Pane connections (12/23). archboard check clean; archboard check --code equals the baseline exactly. Archboard vault now holds 119 flows, 119 sequence views, 87 flowchart views and 53 architecture views (from 15 flows). Fixed on the way: a walkthrough beat could not name a step inside a decision or loop (aboutable read only top-level steps); the skill now states the 60-character limit on step words; the installed skill at ~/.agents/skills was reinstalled so other repositories read the Which view rule.

Docs-Architecture-Design: drafts TASK-482.07 on 19 boards; code check added 69 anchor findings, fixed or anchors dropped where no bound code proves the step (OpenTofu and YAML resources, helpers no part binds); the rerun adds only 5 information-level RELATIONSHIP_UNSUPPORTED on relationships whose call goes through aliased imports. The two parts that stood for their board (Production Kubernetes runtime, Production IIS API portfolio) are gone on the drafts. Adopted the five boards with no other open proposal: Platform Phone API, Platform Public API, Platform Production Cluster Operations, Platform Test IIS Ingress, Production IIS Applications. Not adopted, for the owner: ten boards whose other open proposals adoption would leave on a superseded architecture (Auditlog Timestamp Integrity, Cloud Infrastructure, Common-WebLib Architecture, Platform Cluster, Platform Ingress Certificate Module Contracts, Platform Migration, Platform Production Azure Infrastructure, Platform Production Kubernetes Runtime, Platform Technology Choices, TASK-411 TLS Termination), and Endpoint Gateway and Endpoint Trust Sequences, whose drafts derive from proposals. TLS Termination Options has no current variant; its four options hold the flows. Untouched: Device Trust Control Plane, Device Trust Delivery and Platform Test Cluster, which hold someone else's uncommitted changes. The work is committed on branch archboard/flows-482-07 (50de733) of that repository without touching master or its working tree.
<!-- SECTION:NOTES:END -->
