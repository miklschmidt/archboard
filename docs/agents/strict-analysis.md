# Strict analysis policy

TASK-150 restores an enforced baseline for maintainers and agents: every retained
TypeScript source class is discoverable, compiler checked and type-aware linted.
The quarantined frontend is deliberately incomplete. Diagnostic enforcement is
not a claim that the strict baseline or complete product gate passes.

## Ordinary commands and source inventory

`bun run lint` invokes pinned Oxlint 1.80.0 with oxlint-tsgolint 7.0.2001 once.
It uses `--type-aware`, checks the normal authored tree, and supplies explicit
physical generated declaration file arguments. Oxlint directory traversal honors
Git ignores even with `--no-ignore`; removing the old config ignore alone did not
include generated declarations. The explicit arguments address that measured gap.
`bun run fix` fixes authored source only, then verifies all source through the
ordinary lint command. It never auto-fixes vendor declarations.

The root TypeScript program includes TS, TSX, MTS, CTS and declarations throughout
the retained repository, including root configuration, tests, fixtures, scripts,
tooling and locally generated source. The frontend program extends the same
strict options and supplies browser libraries. Both compiler invocations remain
ordinary and sequential, and either failure propagates. No analyzer supervisor,
per-slice compiler, parallel compiler orchestration or alternative engine exists.

The repository coverage owner independently discovers physical TypeScript files
and compares them with `tsc --showConfig` roots and the actual normal lint command's
`--debug files` output. A new source extension/location or generated directory depth
cannot silently miss a gate: the failure names its path. Dist, dependencies and the
inert local archive are not authored repository source. No generated source class
is excluded. Imported declarations remain checked with `skipLibCheck: false`.

Excalidraw 0.18.1 ships several authoritative declaration trees behind stale
package names and omits type-only locale/style targets. Exact TypeScript path
mappings resolve the shipped math, utility, transform and browser-fs-access
declarations without changing runtime resolution. The registered Bun patch adds
the missing declaration assets and changes only three relative import literals
in two `.d.ts` files. Its locale is the exact `v0.18.1` source from commit
`a2ec2889babf7d2295469c6d90ebe77fae57df84`, SHA-256
`c8c9c8a50a14cd2d5c53703a273ce134608712f84335d9c4e2613b6d3b5bb6f5`.
Root-level placement of that locale and two stylesheet companions works around
Bun 1.4.0's new-patch-directory mode bug; no JavaScript or runtime CSS changes.
The offline repository owner locks the patch paths, import edits, package
integrity, locale hash and declaration contents.

`analysis-safety.test.ts` proves a passing typed consumer and a failing consumer of
an imported declaration through the pinned engine. `generated-declarations.test.ts`
regenerates the pinned upstream contract into a disposable directory and compares
its entire file set against the exempt files. Recipe 2 applies exactly two
shape-checked, semantics-preserving corrections: it collapses duplicated `null`
constituents in `ThreadRealtimeStartParams.prompt` and
`ThreadForkParams.serviceTier`. Every other byte must match raw Codex 0.151.0
output, and generation rejects either source shape if it changes.

## Catalogue and exceptions

[strict-analysis-policy.json](strict-analysis-policy.json) is the authored audit
record for the full pinned catalogue, including its normalized digest, every
inactive plugin/rule reason, and each vendor structural/style exception. All seven
categories are enabled. Bun is Jest-compatible, but the pinned analyzer's
[import/global binding collector](https://raw.githubusercontent.com/oxc-project/oxc/oxlint_v1.80.0/crates/oxc_linter/src/utils/jest.rs)
recognizes `@jest/globals`, `vitest`, `vite-plus/test` and `@effect/vitest`, not
the repository's imported `bun:test` bindings. Its unresolved-global fallback
does not select those imports either. This concrete detection limitation is the
Jest/Vitest plugin exclusion; unused Next.js/Vue frameworks are also inapplicable.
JSDoc checks are enabled, with
TypeScript signatures authoritative rather than duplicated JSDoc type spellings.

The seven named rules are explicit errors: `no-await-in-loop`,
`typescript/no-unsafe-type-assertion`, `typescript/no-unnecessary-type-assertion`,
`typescript/no-base-to-string`, `typescript/no-unnecessary-condition`,
`typescript/no-unnecessary-type-conversion`, and `typescript/consistent-return`.
All authored code has a 500 physical-line limit, counting comments and blank lines.
Existing complexity 60 remains an additional bound; zero warnings and unused
suppression reporting are mandatory.

Oxlint 1.80.0 with oxlint-tsgolint 7.0.2001 incorrectly reports an immutable
branded string when that primitive is nested inside an otherwise readonly
record. The readonly-parameter rule therefore allows only the nine named
string aliases at their exact defining source files. Request correlation exposes
the same analyzer defect through its nested `JsonRpcRequestId`, so that exact
nominal string alias is allowed, as is the exact `ItemId` nested throughout
otherwise readonly retained thread data. Type fixtures enforce that
each remains a nominal string, while the policy test freezes the source-specific
allowlist; mutable records and nested protocol collections remain errors.
Re-audit this narrow analyzer workaround on either pinned linter upgrade.

The retained Zod record branch in `codex-session/lib/response-contract.ts` keeps
one statement-local `typescript/consistent-indexed-object-style` suppression.
With pinned TypeScript 7.0.2, replacing that recursive readonly mapping with
`Readonly<Record<...>>` causes excessive-instantiation failures at all three
consumers of recursive MCP JSON; reverting only that syntax clears them. Re-audit
the exact site on a TypeScript upgrade and remove the suppression when the
equivalent indexed-object spelling compiles.

One pinned formatter conflict is inapplicable: Oxlint 1.80.0
`unicorn/number-literal-case` requires uppercase hexadecimal digits, while the
mandatory Oxfmt 0.65.0 pass deterministically restores lowercase and the lint
rule has no configuration. Oxfmt therefore owns literal case. Re-audit this
single disposition on either tool upgrade; `unicorn/numeric-separators-style`
and every other applicable literal rule remain enforced.

Only exact pinned vendor declaration paths receive the enumerated authored
spelling/layout/structural exemptions. Type-aware checks are never exempt. The
previous blanket generated/vendor ignores and script-wide console exemptions are
removed. Verified reading-only research copies use `.txt` extensions, preserve
original bytes/provenance, and cannot become an executable vendor loophole.

There is no active official shadcn component after quarantine and no dormant
wildcard exemption. TASK-150.02 must identify the actual pinned official files,
record provenance, and add only individually classified authored style,
module-layout and file-length exemptions. Compiler, type-aware safety, React
correctness and accessibility remain enabled. Product-specific compositions,
adapters, generators and tests receive the full policy.

The existing browser runner has exactly three newly documented statement-level
`no-await-in-loop` suppressions in `runSelection`: finish an owner, audit/clean it,
and complete interrupted cleanup. All other sequential operations remain subject
to the rule and the task's narrow required-semantics/false-positive decision policy.
No rule is disabled for an entire file or browser directory. Other pre-existing
suppression sites remain visible diagnostics/audit work for TASK-150.01.02;
the unexplained consistent-function-scoping suppression in the browser gateway
needs its owning contract repaired or a concrete approved explanation.

## Quarantine boundary

[The quarantine record](../design/task-150-quarantine.md) owns the exact retained
seams, archived test behaviors, deferred owners and individual browser decisions.
The archive is locally ignored and never committed. Repository checks inspect both
HEAD and the index. The active lint graph rejects archive imports, re-exports,
dynamic loads and literal filesystem/serving paths. Vite denies the archive through
its filesystem policy while preserving default secret-file denials. The production
server serves only its existing build/vendor asset roots. Bun's archive exclusion
is repeated where a CLI ignore list replaces `bunfig.toml` defaults.

Full `bun run check` still requires the rebuilt frontend and normal browser lane.
It was not run or weakened to manufacture a pass during quarantine. Browser
execution belongs only to TASK-150.06 after implementation and integration are ready.
