# Analysis policy

TASK-150 applied the maintainer-approved lint policy to `src/ui/**` so the UI
rebuild did not wait on a repository-wide migration. TASK-151 adopted the same
policy, unchanged, for every other authored source file: `src/**`, `scripts/**`,
`tools/**` and `vite.config.ts`. Tests stay on the pre-policy repository baseline
by the maintainer's decision (2026-09-06), generated Codex declarations stay
lint-excluded and compiler-checked, and the earlier full-catalogue requirement is
superseded.

## Ordinary commands and repository boundary

`bun run lint` runs the repository baseline and the approved policy sequentially.
Both commands, and both stages of `bun run fix`, enter through `scripts/lint.ts`.
This small preflight delegates analysis to ordinary pinned Oxlint; it does not
implement an analyzer, compiler supervisor, or parallel worker lane.

Every invocation explicitly selects the repository `tsconfig.json` for native
import resolution. Before any type-aware analysis, the preflight compares the
actual Oxlint target inventory with the repository TypeScript program's declared
roots. It refuses unmatched targets, conflicting nested projects and undeclared
stdin inputs before starting tsgolint or applying fixes. Paths must match after
normalization; sharing a realpath is insufficient for the pinned backend.

This protects all lint scopes, not only the UI. It prevents ancestor/inferred
project fallback; imported dependency declarations remain available for checking
repository code. New type-aware source inventories must satisfy the same guard.
UI lint uses the existing repository TypeScript project, with no separate UI
project. `--tsconfig` alone is not a typed-project boundary, and the tested
`disableSolutionSearching` option does not block the unmatched-file case.

`lint:baseline` uses the pre-policy repository rules and archive guard in
`.oxlintrc.baseline.jsonc` with nested lint configuration disabled. It owns
`tests/**`, the module tests under `src/*/*/tests/**`, `frontend/**` and
`src/server/board-rendering/browser.ts` (a root of the frontend project, not the
repository project, so type-aware lint cannot own it). `lint:policy` uses the
approved policy in `.oxlintrc.jsonc`, type-aware analysis and one worker over
`src`, `scripts`, `tools` and `vite.config.ts`; its ignore patterns are exactly
the baseline lane's inventory, so neither lane has a gap or overlaps the other.
Generated Codex declarations keep their lint exclusion and remain compiler checked.
Root and frontend compiler safety improvements remain, including
`noPropertyAccessFromIndexSignature`: only index-signature properties require
brackets, while explicitly declared properties allow dots.

## Approved policy

Keep existing Archboard rules. Enable `correctness`, `suspicious`, and `perf` at
error. Leave `style`, `pedantic`, `restriction`, and overall `nursery` off. Select
only these nursery rules:

- `import/named`
- `import/export`
- `no-restricted-exports`, with every default-export form restricted: `defaultFrom`,
  `direct`, `named`, `namedFrom`, and `namespaceFrom`
- `promise/no-return-in-finally`
- `typescript/no-unnecessary-condition`
- `no-unreachable-loop`
- `unicorn/no-useless-iterator-to-array`
- `typescript/prefer-optional-chain`

Classic cyclomatic complexity is limited to **6**. Authored source is limited
to **600 physical lines**, including blanks and comments. Local imports,
re-exports, dynamic imports and imported types use `@/` aliases. Package imports
remain package imports; aliases never bypass private-module boundaries. Source
uses TypeScript, and `.js`, `.jsx`, `.mjs`, and `.cjs` are rejected; the Oxlint
plugin and the Vite configuration are TypeScript for that reason. Vite reads its
configuration from a default export, the one permitted default export.

Enable `eslint`, `typescript`, `unicorn`, `react`, `react-perf`, `import`, `jsdoc`,
`jsx-a11y`, and `promise`. The automatic JSX runtime retains its existing
`react/react-in-jsx-scope` exception. Warnings and unused suppressions fail the gate.
The approved selection is recorded in `strict-analysis-policy.json`. Sequential
awaiting that is the contract (ordered writes, one analyzer at a time) keeps its
loop and carries a line-level `no-await-in-loop` disable stating why; a rule is
never widened or a loop made concurrent to satisfy lint.

## Documentation for exploration

Use the pinned `eslint-plugin-jsdoc` `flat/recommended-typescript` preset at error,
plus `require-description`. Require documentation for named function declarations,
arrow functions, function expressions and methods. Keep concise descriptions of
function purpose, parameters and returned values. Explain why the function exists
when its role is not apparent from its name; do not just repeat the signature.
TypeScript owns parameter, property and return types: do not duplicate them in JSDoc.

Native JSDoc rules retain their normal names, including
`jsdoc/require-param-description`. The upstream plugin supplies only rules absent
from Oxlint under the `jsdoc-extra` alias. These rules check TypeScript too; the
alias does not authorize JavaScript source. No second ESLint command runs.
Lint enforces documentation presence and structure. Review must assess whether
the prose explains the purpose; a word count cannot establish that.

## OOM evidence and validation

The discarded autofix experiment started two overlapping tsgolint instances. One
reached about 38 GiB. A capped single-worker reproduction found the underlying
scope explosion: three targets excluded from the copied repository program made
tsgolint discover an unrelated `/tmp/tsconfig.json`, whose default scope was the
entire temporary tree. The repository program completed; constructing that second
program hit the 2 GiB limit. This did not prove dependency declarations themselves
were defective. The stray `/tmp/tsconfig.json`, `/tmp/package.json`, and
`/tmp/bun.lock` were removed with user authorization after preserving evidence.

Retain full process/session metadata and wait for the owned command to finish
before launching another. Analyzer probes use separately named systemd user scopes
with a memory limit, no swap and `OOMPolicy=kill`, outside the desktop app's scope.
Resource limits protect the machine; target-membership checks prevent this scope
failure. Never accept results from overlapping fixer runs on one source copy.

The engine contracts are in the [versioned CLI source](https://github.com/oxc-project/oxc/blob/oxlint_v1.80.0/apps/oxlint/src/command/lint.rs#L154-L161)
and [typed resolver](https://github.com/oxc-project/tsgolint/blob/v7.0.2001/internal/utils/find_tsconfig.go#L176-L191).
The complete product/browser gate remains TASK-150.06 after reconstruction and
integration; it has not passed during quarantine. Archive imports, serving and
commits remain forbidden. Official shadcn source retains the previously approved,
explicit style/structure exceptions and compiler, type-aware safety, React
correctness and accessibility checks.
