---
id: TASK-628
title: >-
  The GitHub Actions report a first vault, fail without one, and install their
  own CLI version
status: Done
assignee: []
created_date: '2026-11-12T03:29:00Z'
updated_date: '2026-11-12T03:35:00Z'
labels:
  - actions
dependencies: []
ordinal: 1072000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A team that adopts archboard opens its first pull request with the vault in it. The base has no vault, so the pull-request Action said only that "a model could not be read at the base or the head" and left the Footprint and Plan sections empty, on the pull request where the report matters most (seen on Admin-By-Request/Platform #647). The check Action passes when the vault is missing, because `archboard check` skips the model checks and exits 0, so a deleted or moved vault goes unnoticed in CI. Both Actions install `archboard@latest` by default, so an Action pinned to a commit runs a CLI that drifts from it. On macOS the pull-request Action made its scratch directory under `/var`, a symlink to `/private/var`, which broke the vault link of a local run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With no vault at the base, the pull-request Action compares the proposal against an empty model and judges the footprint against that plan
- [x] #2 When a model cannot be read, the comment names the side (base or head) and the reason the CLI gave
- [x] #3 The check Action fails the step, whatever `fail-on` says, when the checks it runs need a vault and the checkout has none; `checks: embeds` still runs without a vault
- [x] #4 Without a `version` input, both Actions install the CLI version of the archboard release that the Action comes from
- [x] #5 The pull-request Action resolves its scratch directory through symlinks
- [x] #6 Tests cover the first-vault report, the named failing side, the missing-vault check failure and the default version; the Action docs describe the new behavior
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The pull-request Action reads an empty model at a base without a vault, so the first pull request gets a plan and a judged footprint. `model footprint` reads only the head vault, so it needs no change. A model that cannot be read is named by side with the CLI refusal. The check Action fails when the answer says checks were skipped for want of a vault; the CLI itself still exits 0, so local docs-only runs are unchanged. `version` now defaults to empty, and actions/shared/install-cli.sh installs the root package.json version, which release-please sets for every package. The docs examples keep `version: "{{version}}"`, because until the next release they pin the 0.4.0 Action, whose default is still `latest`. The realpath fix has no test: Linux tmpdir has no symlink.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Both GitHub Actions handle a repository that adopts archboard. A first vault gets a plan against an empty base and a judged footprint, a model read failure names base or head and the reason, the check Action fails when its checks need a vault the checkout lacks, both Actions install the CLI version of their own release by default, and the pull-request Action resolves its scratch directory through symlinks for macOS. Red-first tests in the Action suites cover each behavior except the macOS symlink.
<!-- SECTION:FINAL_SUMMARY:END -->
