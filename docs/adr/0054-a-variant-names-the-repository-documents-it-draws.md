---
status: accepted
---

# A variant names the repository documents it draws

Canonical state metadata supersedes variant-owned document lists below. Proposal documents and exact retained source references preserve the evidence contract.
[ADR 0062](0062-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.

Decided for TASK-498 on 2026-10-18.

Amended by TASK-526.01 (2026-10-24): the code check that reads the
references of every variant is `archboard check code`, also run by
`archboard check` and `archboard check all`. The plain check of this ADR is
now `archboard check semantics`, which reads no Git.
[ADR 0057](0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md)
decides the split.

## Context

A board held no link to the documents that it draws. In the
Docs-Architecture-Design vault, one design of the Platform repository (the
design document `backlog/docs/architecture/doc-0072` and its plan TASK-0417)
is a draft on four boards under four names. Endpoint Gateway holds two drafts,
"Device identity from Application Gateway" and "Device mTLS design", and only
one of them is the design. The other is an alternative that the design
rejects. An agent that explained the design's pull request could not tell
them apart. The design document also changed through the stack of pull
requests that builds it, from 338 lines at the first to 499 at the last. No
draft said which version it draws. The repository owner asked for a field that
couples a board to the repository's tasks, documents and ADRs.

A part already names a place in a repository: its binding is
`{ repo, path }`, with an optional `branch` or `commit`. One resolver turns a
binding into a file in a checkout, and the code check reads a pinned ref from
Git without a checkout (TASK-493).

## Decision

A **document reference** names one file in a repository that a variant draws:
a design document, an ADR, a task or a plan. It has the shape of a binding,
without the fields that only code has: `repo`, a repository identity, `path`,
the file in that repository, and optionally `branch` or `commit`, the version
that the variant draws. `commit` names one exact version and wins over
`branch`, as it does on a binding. With neither, the reference names the file
in the checkout that the vault reads for that repository. The binding's
resolver resolves it, so a reference reaches the same checkout, at the same
ref, as a binding that names the same repository, branch and commit.

A variant holds its references as the list `documents`. The field is absent
when the variant names none. The list belongs to the variant, not to the board,
because the version of a document belongs to a reading: a draft draws one
version of a design, and a later layer of a stack can draw a later one. A
current variant names the documents that it was built under.

- `semantic new` and `semantic edit` take `documents` in their payload. An
  edit that states the list replaces the list of the variant that it lands on,
  and only that variant's. An empty list removes it. An edit that leaves it out
  keeps the list. An edit of a historical or shelved variant's list is refused,
  as a summary edit is.
- `semantic branch` copies the list of the variant that it branches from, as it
  copies the content. A proposal then names what its predecessor was built
  under, and its author adds the documents of the proposal.
- No comparison counts a change to the list, and no edit of one variant changes
  the list of another, as with the summary.
- `semantic show` returns each variant with its list.
- `archboard check --code` reads the reference of every variant that it reads,
  in the code that a binding of the same repository and ref reads: the files on
  disk, or the tree of the ref from Git. A file that is not there is the
  warning `DOCUMENT_PATH_MISSING`, at `variants.<id>.documents.<index>`. A
  reference into a repository that this machine has not registered, and a ref
  that the checkout cannot resolve, are skipped with the reason, as a binding's
  are (`repository-unregistered`, `ref-not-checked-out`).

A reference names a file, never a directory, a section or a line. A document
grows, and a reference to a line in it goes stale with every edit above the
line. A reference has no role, such as "design" or "rejected alternative". The
document says what it decides, and the variant's lifecycle and summary say what
the variant is.

## Considered options

- **A list on the board.** Every variant would then name the same version of a
  design, and a draft could not say which version it draws. No case needs a
  reference that no variant carries: a current variant carries the documents of
  what is built.
- **A new address format, such as a URL.** It would need a second resolver and
  a second check. It also could not resolve in this machine's checkout of the
  repository, which is how a binding resolves.
- **The plain check.** `archboard check` without `--code` reads no Git, so it
  could test the file on disk only. A reference pinned to a branch would then
  be wrong or unread. The code check already reads a pinned ref.

## Consequences

- A variant's list is one more optional field in the board document. The schema
  version does not move, as for `formerNames` and `anchor`: every document that
  this build wrote before is one it reads.
- A current variant gathers the references of each proposal that is adopted
  into it. A proposal that no longer stands on an earlier document restates the
  list without it.
- A reference to a document that moves, such as a task that is archived, reads
  `DOCUMENT_PATH_MISSING` until somebody restates it at the new path or pins it
  to a commit that holds the file.
- A stack's design draft names its design document at the commit or branch
  that it draws. A later pull request finds the design draft through the
  document that it names. When the design changes through the stack, the agent
  that reconciles the drafts moves the reference to the new commit.
- The browser shows no list. It writes no board content, and this decision
  asks for no view of the list.
