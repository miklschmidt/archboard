---
id: TASK-019
title: 'App-server client: inject board changes into a live Codex thread'
status: To Do
assignee: []
created_date: '2026-08-19 18:37'
updated_date: '2026-08-19 19:24'
labels:
  - needs-triage
dependencies:
  - TASK-018
ordinal: 19000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Quiet injection via thread/inject_items is the default
- [ ] #2 Loud injection via turn/steer exists but is OFF by default and switchable on for testing
- [ ] #3 Injection is loopback-only and behind an explicit switch, per ADR 0005 security section
- [ ] #4 Debounced; a drag does not produce a stream of injections
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 18:38
---
User on loud injection: 'quiet injection is the obvious default. I'm not sure if loud is ever a good idea, but I'd like the option to turn it on for testing.' So build it, default it off, make it switchable — do not make the case for it in the UI or docs. Treat loud as an experiment, not a feature.
---

author: @claude
created: 2026-08-19 19:24
---
Open design question the implementer must answer: which Codex thread does archboard inject into? The app-server socket is multi-client and there may be several loaded threads. Options include an env var, discovery via thread/loaded/list, or attaching to whichever thread most recently called an archboard tool. The last is appealing — it needs no configuration and is almost always right — but decide deliberately and document it.
---
<!-- COMMENTS:END -->
