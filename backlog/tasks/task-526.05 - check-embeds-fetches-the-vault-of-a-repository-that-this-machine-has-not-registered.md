---
id: TASK-526.05
title: >-
  check embeds fetches the vault of a repository that this machine has not
  registered
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-24T15:36:00Z'
updated_date: '2026-10-24T19:57:00Z'
labels:
  - cli
  - code-check
dependencies:
  - TASK-526.03
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
parent_task_id: TASK-526
priority: medium
type: enhancement
ordinal: 925000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Documentation repositories often embed boards from a vault in another repository, and CI or a contributor has no checkout of it. The owner wants the check to fetch the source instead of skipping it. ADR 0057 decides why the whole vault directory is fetched, the cache, and the offline rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For an unregistered repository, the check fetches the .archboard/vault directory of the default branch shallow and sparse with the person git credentials
- [ ] #2 A fetched vault is cached in the state directory by commit and read again from the cache
- [ ] #3 Offline with a cached copy, the check uses it and reports that as information
- [ ] #4 Offline with no cached copy, the check reports a warning that names the repository
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Board proposal: `Command interface@TASK-526.05`. It adds the external Vault repository. It adds the data relationship from Embeds check to Vault repository, "the default branch vault, shallow and sparse", with its anchor at `fetchSteps` in fetched-vaults.ts. The Embeds check responsibility says that it fetches a vault that no checkout here holds. No other board draws what changes. The server serves a fetched vault through the routes it has.
2. Fetch and cache, in apps/cli/src/cli/operations/vault/embeds/fetched-vaults.ts. The address is `https://<identity>`. The person's own Git fetches it, with their credential helpers and their `url.<base>.insteadOf` rules. GIT_TERMINAL_PROMPT is 0, and the variables that point Git at a repository are removed. First `ls-remote <url> HEAD`. A cached commit is read again. Else `clone --depth=1 --filter=blob:none --no-checkout`, `sparse-checkout set --no-cone /.archboard/vault/` and `checkout`. A self-mapping insteadOf rule makes `origin` read as the identity. A rename puts the checkout at `<state>/fetched-vaults/<identity>/<commit>`, and the older commits are removed. When the fetch fails, the newest cached commit is read. With no cached commit, the fetch fails.
3. Vault resolution, in embed-vaults.ts. A registered checkout is read as it is. Any other vault is fetched. The answer's `vaults` lists each vault read: checkout, fetched with its commit, or cache with EMBED_VAULT_CACHED as information. With no cache, each embed gets the warning EMBED_VAULT_FETCH_FAILED, which names the repository. When the server refuses a vault with VAULT_UNREADABLE, the embed gets EMBED_VAULT_UNAVAILABLE, and the check goes on.
4. Answer: `EmbedsPart.vaults` and the new codes in embeds-answer.ts. The command metadata in vault.ts describes them. The lines in embed-state.ts name each fetched and cached vault.
5. Timing: VAULT_FETCH_TIMEOUT_MS in packages/timing, file embeds-check.ts.
6. Tests: tests/system/semantic-boards/embeds-fetch.test.ts uses a local bare remote. A `url.<base>.insteadOf` rule, set with GIT_CONFIG_COUNT for the CLI alone, leads to it. apps/cli/tests/cli/operations/vault/embeds/fetched-vaults.test.ts holds the identity validation. In embeds-check.test.ts, elsewhere.svg names a vault in no repository, so that test reaches no network.
7. Gate, proposal correction, code check diff and footprint.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built in commits 5ba8b3bb7 (code and tests) and ca3cae24d (proposal).

Decision, the address: `https://<identity>`, with no `.git` suffix, which GitHub accepts. A host that needs the suffix fails the fetch, and a person can add it with an insteadOf rule. The person's own Git fetches it. Their credential helpers give the credentials. Their `url.<base>.insteadOf` rules turn it into SSH or a mirror. No other form of the address is known, because the machine has no checkout of the repository. An identity that is not a host and a path, such as the directory name of a repository without a remote, gets EMBED_VAULT_UNAVAILABLE as information. Each segment must match `[\w.-]+`, and `.` and `..` are refused. So a recipe cannot make a URL or a directory outside the cache.

Decision, the cache: `<state>/fetched-vaults/<identity>/<commit>/` is a shallow, sparse, blob-filtered checkout with only `/.archboard/vault/`. The vault is at `<commit>/.archboard/vault`, which `isVaultLayout` accepts, so the server needs no change. A commit directory appears by a rename, so a directory that exists is complete. After a fetch, the older commits of the identity are removed. A self-mapping insteadOf rule in the cached checkout makes `git remote get-url origin` give the canonical address whatever rules the person has. So the server writes the recipe's repository identity into a fresh recipe, and `--fix` never writes a mirror's identity into an embed.

Decision, reuse: `git ls-remote <url> HEAD` gives the commit of the default branch. When the cache has that commit, the check reads it without a clone. When ls-remote or the clone fails, the newest cached commit (by directory time) is read.

Decision, the answer: a new `vaults` section in the embeds part lists each vault that the check read, in the order the embeds named them: `{source: "checkout", repo}`, `{source: "fetched", repo, commit}`, or `{source: "cache", repo, commit, severity: "information", code: "EMBED_VAULT_CACHED", message}`. A finding needs a file, and the cache note is about a vault. The no-cache failure is about each embed that the vault leaves unchecked, so it is the per-embed finding EMBED_VAULT_FETCH_FAILED (warning), with `repo`. That warning fails the check through the existing rule. The text lines add `vault: fetched: <repo> at <commit>` and `information: EMBED_VAULT_CACHED: <repo>: <message>`. A checkout's vault has no line.

Decision, a refused vault: when the server answers VAULT_UNREADABLE for any vault, readVault catches it and the embed gets EMBED_VAULT_UNAVAILABLE as information. Other errors still stop the check, because the check can then read no vault.

Decision, Git's environment: GIT_TERMINAL_PROMPT=0 and GCM_INTERACTIVE=never. The variables that point Git at a repository are removed, such as GIT_DIR and GIT_WORK_TREE. So a check that a Git hook runs never acts on the person's own repository. Each command is cancelled with the command's signal. A network command is bounded by VAULT_FETCH_TIMEOUT_MS (60 s, packages/timing/src/shared/constants/embeds-check.ts), and a local one by GIT_COMMAND_TIMEOUT_MS. A timeout counts as a failed fetch. A cancellation stops the check.

Decision, server memory: each fetched commit is another vault to the server. The check only lists and draws through read-only routes, which keep no memory by vault. The disk watch and the claims are kept only for panes and writes, and nothing writes a cached vault. So this is acceptable.

Decision, the test seam: Git's own `url.<base>.insteadOf`, set with GIT_CONFIG_COUNT for the CLI alone, leads `https://github.com/` to a local bare repository. The product has no seam that only tests use. The server never sees the rule. If the server did see it, the self-mapping rule in the cache still keeps the identity right.

Decision, module placement: fetched-vaults.ts is in the embeds check of the CLI, beside the vault resolution. The check is its only user, and it uses workspace's `stateDir`. No package needs it.

Change to embeds-check.test.ts: `elsewhere.svg` now names a vault in no repository (`repo: null`). Its expectations stay EMBED_VAULT_UNAVAILABLE information, and the test reaches no network. The unregistered identity is in embeds-fetch.test.ts.

Code check diff: `archboard check code` with and without `--variant TASK-526.05` gives the same 40 finding lines. No finding is new, and none is cleared.

Footprint against 5ba8b3bb7^: namedAndChanged is Embeds check, as a changed part and the added relationship to Vault repository. changedNotNamed is Vault check (vault.ts: only the text of the command metadata changes) and Commands (the container of both). namedNotChanged is empty.

Left out: the fetch uses Bun.spawn with the signal, as gitOutput does, not the process-group runner of the workspace package. That runner is private and takes no environment. Git's helper processes end with Git. A run killed with SIGKILL can leave a `.incoming-<uuid>` directory in the cache. Nothing reads it, and nothing removes it.

Merged onto TASK-526.04 (feat/check-export-artifacts) in worktree-agent-a34a6f2f72c3208c8. A finding names the recipe's vault as vaultRepo, and the embeds part carries both tracked and vaults. Command interface keeps TASK-526.04's adopted version 133. The TASK-526.05 proposal was drawn again on it with the CLI: Vault repository, Embeds check -> Vault repository (anchor fetched-vaults.ts fetchSteps), and the Embeds check responsibility, now naming tracked embeds and the fetch together.

Follow-ups after the merge:
- A cached vault can be behind its default branch. Every finding against a cached vault is information. --fix writes no embed from it and says why in notFixed (cachedFinding in embed-findings.ts, checkInVault in embeds-check.ts). ADR 0057 says so.
- The fetch's Git sets GIT_ASKPASS and SSH_ASKPASS empty and SSH_ASKPASS_REQUIRE=never. Decision: SSH_ASKPASS_REQUIRE=never is added, because SSH_ASKPASS_REQUIRE=force in a person's environment otherwise starts an askpass program.
- gitOutput and the fetch share gitEnvironment (clients/git/git-environment.ts), which removes GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE and the other repository variables.
- In a Git checkout without a vault, check, check all and check embeds run the embeds check alone (contract field runsWithoutVault, and CommandContext.checkout). Decision on the answer: no vault field, and skipped: {checks: ["semantics", "code"], message} for check and check all, with one stderr line. The exit status comes from the embeds part. check semantics and check code stay VAULT_NOT_FOUND. Every server call still names its vault: the listing and the render name each embed's vault, and the tracked-embed listing is not called without a vault.
- Proposals: Command interface@TASK-526.05 gains the description of Vault check. Command dispatch@TASK-526.05 (new) adds the branch of Addressing a vault where a command that runs without a vault runs in the checkout.

Code check diff (check code with and without --variant TASK-526.05): the same 40 finding lines. No finding is new, and none is cleared.
<!-- SECTION:NOTES:END -->
