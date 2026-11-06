---
id: TASK-584
title: Every archboard checkout reads Rust through the flake's rust-analyzer
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06T17:32:00Z'
updated_date: '2026-11-06T17:39:00Z'
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
- [x] #1 After `bun install` in the main checkout or a fresh worktree, `archboard repo list` shows a Rust server for that checkout
- [x] #2 The configured server runs the rust-analyzer, cargo and RUST_SRC_PATH of this checkout's flake, whatever PATH the Archboard server started with
- [x] #3 `archboard check code` reads Rust in this checkout and skips no checkout for language-server-missing or language-server-failed
- [x] #4 A `bun install` on a machine without nix still succeeds and configures nothing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence: in the main checkout, repo list shows rust -> scripts/rust-analyzer, and check code ran rust-analyzer in 5.8 s with no language-server-missing or language-server-failed skip, after the server restarted from a fresh dev shell. A fresh detached worktree (bun install --frozen-lockfile and bun run build inside nix develop) registered itself with its own scripts/rust-analyzer, and its check code ran Rust in 9.9 s with the same skips only (exposure-unknown, unbound, text-only). With nix off PATH, the script prints that Rust gets no server and exits 0. nix develop costs about 0.15 s per start.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
bun install now runs scripts/configure-language-servers.ts, which registers the checkout and configures Rust to scripts/rust-analyzer. That wrapper runs the flake's rust-analyzer through nix develop, so the server gets the right rust-analyzer, cargo and RUST_SRC_PATH, whatever PATH started the Archboard server. Every checkout and worktree is configured on install; a machine without nix configures nothing. Risk: the postinstall writes the machine registry (~/.local/state/archboard/repos.json or ARCHBOARD_REPOS), which this repository owner asked for.
<!-- SECTION:FINAL_SUMMARY:END -->
