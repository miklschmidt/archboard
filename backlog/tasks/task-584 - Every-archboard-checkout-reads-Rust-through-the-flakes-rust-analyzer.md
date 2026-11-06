---
id: TASK-584
title: Every archboard checkout reads Rust through the flake's rust-analyzer
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T17:32:00Z'
labels:
  - tooling
dependencies: []
ordinal: 1028000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check skipped Rust in this repository: no checkout had a Rust server configured, and the configuration lives per checkout in the machine registry, so each new worktree started without one. Configuring `rust-analyzer` by name was not enough either. The Archboard server runs the command with the PATH of the shell that started it. A shell older than the flake's rust-analyzer finds the rustup proxy in ~/.nix-profile, which has no toolchain, and the check reports language-server-failed. ADR 0046 (TASK-433) keeps servers that run code opt-in per checkout; this repository opts in for its own checkouts through its own setup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After `bun install` in the main checkout or a fresh worktree, `archboard repo list` shows a Rust server for that checkout
- [ ] #2 The configured server runs the rust-analyzer, cargo and RUST_SRC_PATH of this checkout's flake, whatever PATH the Archboard server started with
- [ ] #3 `archboard check code` reads Rust in this checkout and skips no checkout for language-server-missing or language-server-failed
- [ ] #4 A `bun install` on a machine without nix still succeeds and configures nothing
<!-- AC:END -->
