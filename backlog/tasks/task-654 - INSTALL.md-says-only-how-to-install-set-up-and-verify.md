---
id: TASK-654
title: INSTALL.md says only how to install, set up and verify
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T16:57:00Z'
updated_date: '2026-11-19T17:02:00Z'
labels:
  - ready-for-agent
dependencies: []
ordinal: 1120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner: INSTALL.md is 947 lines and 'it can't be that complicated'. It mixes the install path with reference material: how a command finds its vault, application and infrastructure checkouts, history, code bindings, per-language server setup, rendering, recording, telemetry and machine state. A person installing Archboard has to wade through all of it. The site's docs (site/src/content/docs/) are where reference material lives for readers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 INSTALL.md is under 200 lines and covers, in order: what you need, installing (release, clone, build tools), putting the CLI on PATH, setting up a repository, starting the server and signing in, checking that it works, running the check as a gate, and updating or removing
- [ ] #2 Each reference section that leaves INSTALL.md is either already covered by a page under site/src/content/docs/ (link to it) or moved there; nothing a user needs is lost, and the task notes list where each section went
- [ ] #3 Every link and error message that points into INSTALL.md still resolves: the telemetry notice's #usage-telemetry anchor (packages/telemetry), 'the tools INSTALL.md names' (packages/renderer, scripts/build-core.ts), site/src/lib/links.ts, README.md and AGENTS.md
- [ ] #4 The site builds and its audit passes (site/README.md#audit-the-site), and bun run check passes apart from check:model's known INTERFACE_WIDE and MODULE_SHALLOW findings
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite INSTALL.md as the install path only (needs, install release/clone/build tools, PATH, set up, server and sign-in, make sure it works, gate, update and remove, Usage telemetry), under 200 lines, commands checked against CLI help.
2. Move each reference section to the site page that covers it, or add it briefly to site/src/content/docs/install.mdx or concepts.mdx.
3. Repoint links into old INSTALL.md anchors (README, TESTING, PRODUCT, platform.mdx, QuickStart.astro).
4. Build the site, audit the changed pages with agent-browser, run bun run check.
<!-- SECTION:PLAN:END -->
