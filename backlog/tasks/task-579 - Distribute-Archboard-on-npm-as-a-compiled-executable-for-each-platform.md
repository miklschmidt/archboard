---
id: TASK-579
title: Distribute Archboard on npm as a compiled executable for each platform
status: To Do
assignee: []
created_date: '2026-11-05T14:57:00Z'
updated_date: '2026-11-07T04:28:00Z'
labels: []
dependencies: []
references:
  - packages/workspace/src/runtime/services/source-checkout.ts
documentation:
  - docs/adr/0076-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
priority: high
type: feature
ordinal: 1021000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Using Archboard today needs a clone, Bun, Node.js, the Rust tools and two build commands, which most architects who work with coding agents do not have. ADR 0076 decides a second way to run it: an npm release under the `@archboard` organization and the unscoped `archboard` name, made of a shell launcher and one compiled executable for each platform, with the matching Codex platform binary as an exact dependency. A checkout keeps every current rule. The Codex upgrade lands in its own PR on `chore/bump-codex` first; the platform aliases follow its pin.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A user on Linux or macOS with no Bun, Node.js, Rust, Nix or clone runs `npm i -g archboard` or `bun add -g @archboard/cli`, then `archboard start` and reads a model in the browser
- [ ] #2 A checkout behaves as before: its port, hand-off, core source-hash refusal and rebuild on restart are unchanged
- [ ] #3 ADR 0076 is accepted and PRODUCT.md names the release
<!-- AC:END -->
