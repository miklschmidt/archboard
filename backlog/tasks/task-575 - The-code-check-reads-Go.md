---
id: TASK-575
title: The code check reads Go
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-04T18:46:00Z'
updated_date: '2026-11-04T19:06:00Z'
labels: []
dependencies: []
ordinal: 1019000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard check code has syntax adapters for TypeScript, Python, C, C++, Objective-C, Swift, C#, Rust, Nix, Terraform, Kubernetes, Helm and Compose (packages/code-intel/src/runtime/operations/code-facts), but none for Go. A Go file is read as text: an anchor on a Go symbol is matched by name only, the check cannot tell what a package exports, and it cannot see a call between two bound Go packages. Go is common in cloud and infrastructure services, which are the systems archboard users model. A Go package is a directory whose files see each other without an import, and an import names a package by its module path from go.mod, so the adapter follows the Swift shape (inModule lookup) more than the TypeScript one. The user asked for the adapter on 2026-11-04.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An anchor or binding symbol on a Go function, method (Type.Method), type, constant or variable resolves to its definition, and a missing one is reported as for the other languages
- [ ] #2 The check knows what a Go package exports (capitalized names, and the exported methods and fields of exported types), and a part bound to a package directory reads its exposure
- [ ] #3 A call from one bound Go package to another that the model does not draw is reported as RELATIONSHIP_UNDRAWN, resolving import paths through go.mod module paths, go.work members, local replace directives and import aliases
- [ ] #4 gopls is a configurable language server for Go (archboard repo language-server go gopls), with go.work or go.mod as its project and a file no go.mod holds reported as unready
- [ ] #5 Tests own the adapter on a small Go fixture module, as the other languages fixtures do
- [ ] #6 The archboard skill, INSTALL.md, README, check help and ADR 0046 name Go as a supported language, the grammar package and what gopls runs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Grammar: pin tree-sitter-go 0.25.0 (MIT, tree-sitter org, ships tree-sitter-go.wasm, ABI 15, loads in web-tree-sitter 0.27.0). The user asked for the adapter, which needs it; record it in ADR 0046 package table.
2. Adapter code-facts/go/: go.scm, go-adapter.ts (uses, imports, package clause, scoped names), go-definitions.ts (functions, Type.Method, struct fields, interface methods, const/var; exported = capitalized), go-mod.ts (require lines as build-dependency evidence), go-resolution.ts (inModule: package = files directly in a directory with one clause; import paths through every go.mod module path of the checkout, so go.work members and local replaces resolve), go-exposure.ts (root files = non-test files of the directory, package main exposes nothing). One AdapterName, one adapters.ts entry, one ExposureRule.
3. Language server: go row in languages.ts (opensFiles), go-workspace.ts (nearest go.work, else go.mod, else unready), go in CONFIGURABLE_LANGUAGES (gopls runs the go command, which can download modules/toolchains and run cgo). go and gopls in the flake dev shell (user request).
4. Tests: go-shop fixture (go.work, two modules, replace, alias, subpackage, build-constraint duplicates, external test package, package clause differing from directory); go-facts.test.ts, go-check.test.ts, go-server.test.ts with a stand-in and the real gopls.
5. Docs: INSTALL.md, README, check and repo language-server help, setup.md, design-checks.md, ADR 0046, protocol comment.
6. Model: no proposal (see notes). Gate: bun run check in nix develop.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Architecture model: no proposal. The change adds one row to the adapter table (adapters.ts) and one to the language-server table (languages.ts) and changes no module, relationship, flow or responsibility. Fact analysis (vKEsyHFk/6E6hL0Zk#3CaBjhIM) says "each supported language or format", which stays true. Language servers (vKEsyHFk/6E6hL0Zk#1aoB46lM) names example rows of languages.ts, and its rule that every language but TypeScript runs only a configured server covers gopls; the canonical description already leaves Rust out of its examples.

Decisions: a Go import is build-dependency evidence, as a Swift import is, because the go command compiles every imported package and a blank import (_ "driver") has no other evidence. Dot-imported names lead nowhere (no fixture case, mostly external test libraries). go.mod gets a reading so a bound Go directory is not reported text-only for .mod, and its require lines give build-dependency evidence for local modules, as Cargo.toml does. go.sum stays text. gopls is configurable only (no default server), as rust-analyzer is. go and gopls joined the nix dev shell at the user request, so the real gopls test runs in CI.

Evidence so far: the fixture passes go vet, go test and go run with go 1.26.9, also go vet with GOOS=darwin. The real gopls 0.24.0 resolves book.Post (shop/main.go:14) to ledger/ledger.go:18 across the modules of the go.work.

Standard library probe (go 1.26.9 GOROOT/src, testdata left out): 6,496 files, 2.77 M lines, 364,798 definitions, no error; net/http (111 files, 78 k lines) read in 1.1 s. Two files hold unparsed parts, which the check reports as unknown, never missing: runtime/secret/secret_test.go:58 uses new(expr) (Go 1.26), and encoding/json/v2/arshal_test.go:2049-2083 calls a local function named make with one argument. Both are limits of tree-sitter-go 0.25.0.
<!-- SECTION:NOTES:END -->
