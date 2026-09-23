---
id: TASK-311
title: A binding pinned to a branch or commit opens the code at that ref
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 14:37'
updated_date: '2026-09-23 14:50'
labels:
  - code-target
  - frontend
  - skill
dependencies: []
ordinal: 543000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A node's binding may name a branch or a commit beside its repository and path (binding.branch, binding.commit). Opening the code honours them only when there is no local checkout, through the GitHub fallback (commit, then branch, then HEAD). With a registered checkout the local resolver ignores them and opens the working-tree file on whatever branch is checked out, so a binding to release/2.1 opens main's version. The archboard skill never mentions the two fields, so agents do not write them. The user (2026-09-23) agreed: open locally only when the checkout is on the bound ref, otherwise go to GitHub at that ref, never switching the checkout; for a repository not on GitHub, open the local file and say which ref the binding names; and teach the skill when to pin.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With a registered checkout on the bound branch, or at the bound commit, the code opens locally as before
- [x] #2 With a checkout on another ref, a GitHub repository's code is not opened locally: the person is told both refs and offered the file on GitHub at the bound ref
- [x] #3 With a checkout on another ref, a repository not on GitHub opens locally and the person is told the checkout's ref and the bound one
- [x] #4 A binding with no branch or commit behaves as before
- [x] #5 The skill's binding rule says when to write branch or commit, and INSTALL.md says how pinned bindings open
- [x] #6 Owned by resolver unit tests for the ref match and a route test for the three outcomes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. git.ts checkoutHead (symbolic-ref for the branch, rev-parse for HEAD); the code-target snapshot records it per checkout; resolver dependency repoHead.
2. resolver-core: a local target gains otherRef {named, checkedOut} when the binding's commit (else branch) is not what the checkout has out; an abbreviated commit matches.
3. Open route: otherRef and a GitHub URL -> 409 CHECKOUT_ON_OTHER_REF with both refs and the Open on GitHub action at the bound ref, nothing launched; otherRef without GitHub -> open locally, success carries otherRef. presentationTargetForBinding follows the same rule.
4. Browser: CodeTargetNotice kind info (default tone) for the refusal and for openedNotice(reply) naming both refs.
5. Skill binding rule and INSTALL.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commits bb9d5d95 and 90d... (narrowing fix). Owners: resolution.test.ts (no pin, bound branch, abbreviated bound commit open plainly; another branch, a commit over a branch and a detached HEAD name both refs), activation-contract.test.ts (GitHub refusal with the href at release%2F2.1 and no launch; the bound branch opens with no otherRef; a git.example.com repository opens locally with otherRef), activation.test.ts (openedNotice and the info kind). bun run check exit 0 (modules 3376, system 178, repository, browser). The frontend is rebuilt; a canvas restart picks up the server side. Not looked at in a real browser: the notice is the existing code-target notice in the default tone.

Correction: the narrowing fix is commit 73e166e2.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A binding that names a branch or commit now opens locally only when the checkout has that ref out. Otherwise a GitHub repository is offered on GitHub at the bound ref with both refs named, and one not on GitHub opens locally with a notice naming both; the checkout is never switched. The skill says when to pin and INSTALL.md how a pinned binding opens. Verified by resolver, route and browser owners and the full gate.
<!-- SECTION:FINAL_SUMMARY:END -->
