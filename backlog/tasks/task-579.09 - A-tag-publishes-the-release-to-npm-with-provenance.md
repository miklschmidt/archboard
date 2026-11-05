---
id: TASK-579.09
title: A merged release PR publishes every package to npm through trusted publishing
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-05T14:59:00Z'
updated_date: '2026-11-05T17:06:00Z'
labels: []
dependencies:
  - TASK-579.08
  - TASK-579.11
references:
  - .github/workflows/ci.yml
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
  - docs/agents/releasing.md
parent_task_id: TASK-579
type: task
ordinal: 1030000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publishing by hand from a laptop gives no provenance and no proof that the tarball installs without the build tools. npm trusted publishing lets the release workflow publish through GitHub OIDC with no stored token, and gives each package provenance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In the workflow run where release-please creates a release, the packages are built, the packed tarballs install on Linux and macOS without Rust, Bun or Node.js, and a smoke test passes
- [ ] #2 Only after the smoke test, every package is published through npm trusted publishing (GitHub OIDC, `id-token: write`) with provenance; a prerelease goes to the dist-tag `next`
- [ ] #3 Each package on npm trusts only the release workflow and environment of this repository and disallows publication by token, and the repository stores no npm token
- [x] #4 The owner steps on npmjs.com (organization, placeholder first versions if npm needs them, trusted publisher per package) are written down in the order they must be done
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the placeholder job of .github/workflows/release.yml: build (ubuntu, Nix dev shell, bun run release, upload the tarballs) when release-please created the root release; smoke on ubuntu-latest and macos-latest (scripts/release/smoke.ts with npm and with bun add -g, PATH without Rust, Bun or Node.js); publish in the npm environment with id-token: write, npm 11.6.2, npm publish --provenance --access public, platform packages before launchers, prereleases to next, versions on npm already skipped.
2. build-voice and publish-voice jobs when release-please created the voice release.
3. docs/agents/releasing.md: how publication runs, and the owner's npmjs.com and GitHub steps in order.
4. Validate with actionlint (with shellcheck).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Jobs of release.yml: build on ubuntu in the Nix dev shell from the release tag, which runs bun run release and keeps the artifact release-packages. Then smoke on ubuntu-latest and macos-latest with fail-fast off: scripts/release/smoke.ts once with npm for archboard and once with Bun for @archboard/cli. Then publish in the environment npm with id-token write and contents read. The voice package gets build-voice and publish-voice, gated on the voice release output. The publishing jobs only download tarballs, so the job that holds the OIDC token installs none of the repository dependencies.

npm: actions/setup-node v5 with Node 24, then npm 11.6.2 installed globally, because trusted publishing needs npm 11.5.1 or later. No registry-url, so setup-node writes no token line. Each publish skips a name and version that npm view finds, so a failed run can run again after a partial publish. Platform packages go before launchers. A version with a hyphen goes to dist-tag next. The publish loop ran with a fake npm against the built tarballs: it maps every name to its tarball, skips a version that npm view finds, and publishes the rest with provenance, public access and the latest tag.

The smoke job uses setup-vp only for Bun, which runs the registry stub and the script, and for npm. The archboard commands run on the PATH that smoke.ts builds from the install bin and the system directories, and smoke.ts refuses that PATH when it holds bun, node, npm, npx, cargo or rustc. The owner steps in docs/agents/releasing.md name a sixth package, @archboard/codex-realtime-voice, because the workflow publishes it too, and the GitHub environment npm. actionlint with shellcheck passes on release.yml; on the whole repository it reports one older SC2016 info at ci.yml line 72, an intended single-quoted bash -c, which this task leaves alone.

Locally proven: actionlint clean; the publish loop ran against the built tarballs with a fake npm; the smoke script passes on linux-x64 with npm and bun. Unproven until a real release run on main: the darwin-arm64 executable on Apple silicon, the macOS smoke job, npm trusted publishing with provenance, and the release-please outputs feeding the jobs.
<!-- SECTION:NOTES:END -->
