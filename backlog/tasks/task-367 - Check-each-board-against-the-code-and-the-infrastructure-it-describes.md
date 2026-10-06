---
id: TASK-367
title: Check each board against the code and the infrastructure it describes
status: Done
assignee: []
created_date: '2026-09-29 01:13'
updated_date: '2026-10-06 22:50'
labels:
  - code-check
dependencies: []
documentation:
  - docs/design/design-checks.md
priority: high
type: feature
ordinal: 608000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board makes claims about code: this part is implemented in that file, this part calls that one. Today nothing reads the code again after the claim is made. `archboard check` only tests that a bound path exists (`src/runtime/semantic-board-store/lib/bindings.ts`). TASK-328 put the gap in one sentence: a board can bind every part to a file that exists and still describe what those files no longer do. TASK-257 found 9 of 89 bindings dead after 141 commits with no vault update.

The consumer skill already makes an agent write one line of evidence for every relationship, a file and a symbol (evidence rule 3). The product throws that line away, because a relationship has no field for it. This effort keeps the evidence as an anchor and reads the code again: code in TypeScript, C# and .NET, Python, Swift, Objective-C, C and C++, infrastructure in Kubernetes, Terraform and OpenTofu, and docker-compose, and software dependencies in Nix. Infrastructure closes the gap that code analysis leaves: code cannot prove a call across a network, but infrastructure declares the queue, the route and the address.

The check is derived and never stored. It reads the current variant, and a draft only on request (ADR 0031). It reads files only: never Terraform state, cloud APIs or secrets. docs/design/design-checks.md holds the measurements, the evidence kinds, the engine choice and the per-language facts. The subtasks are ordered by their dependencies: decisions and the tracer bullet first, then one adapter per language or tool.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `archboard check --code` reports, on the current variant of every board, anchors and bound symbols that no longer hold, relationships the code runs the other way, and dependencies between bound parts that the board does not draw
- [x] #2 The check reads TypeScript, C# and .NET, Python, Swift, Objective-C, C and C++, Terraform and OpenTofu, Kubernetes manifests, docker-compose files and Nix flakes
- [x] #3 Every finding names the evidence kind it rests on and says whether a language server resolved it or it is a candidate
- [x] #4 The check reads files only: never Terraform state, cloud APIs, secret values, or commands that need credentials or run code
- [x] #5 The dogfood vault passes the code check, and archboard-dev closes a task with it
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard check --code holds every board against the code and the infrastructure it describes (ADR 0046). Boards carry anchors {repo, path, symbol} on relationships and steps, and a binding can name a symbol. The check reports anchors and bound symbols that no longer hold, relationships the code runs the other way or does not support, dependencies between bound parts the board does not draw, and a container's interface against what its module exposes (ADR 0044). Code facts read TypeScript, Python, Swift, C, C++, Objective-C, C# and .NET, Terraform and OpenTofu with provider tables for AWS, Google Cloud, Azure and Kubernetes, Kubernetes manifests, docker-compose and Nix flakes, and join code to infrastructure across a network hop. Language servers (tsc, pyright, csharp-ls, sourcekit-lsp, clangd) resolve candidates without running project code: a server that evaluates project files runs only from an entry the user writes, and clangd runs nothing from the checkout. Every finding names its evidence kind and whether it is resolved or a candidate. The check reads files only: never Terraform state, cloud APIs, secret values or commands. The pane marks code warnings, the inspector lists findings and opens code at the bound symbol, archboard-dev closes a task with the check, and the dogfood vault passes it with exit 0.
<!-- SECTION:FINAL_SUMMARY:END -->
